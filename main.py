#!/usr/bin/env python3
"""
MADGOD sidecar — FastAPI backend
handles: vault parsing, wikilink graph, semantic embeddings,
         PlatformIO subprocess, file I/O, vault file watching

run: python sidecar/main.py
     or: uvicorn sidecar.main:app --port 8765 --reload
"""

import os
import re
import json
import asyncio
import subprocess
import threading
from pathlib import Path
from typing import Optional, List, Dict, Any
from datetime import datetime

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel

# ── optional heavy deps (graceful degradation) ────────────────
try:
    from sentence_transformers import SentenceTransformer
    import numpy as np
    EMBEDDINGS_AVAILABLE = True
except ImportError:
    EMBEDDINGS_AVAILABLE = False
    print("[sidecar] sentence-transformers not installed — semantic edges disabled")
    print("[sidecar] install: pip install sentence-transformers")

try:
    from watchdog.observers import Observer
    from watchdog.events import FileSystemEventHandler
    WATCHDOG_AVAILABLE = True
except ImportError:
    WATCHDOG_AVAILABLE = False
    print("[sidecar] watchdog not installed — file watching disabled")
    print("[sidecar] install: pip install watchdog")

# ─────────────────────────────────────────────────────────────
app = FastAPI(title="MADGOD sidecar", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── state ──────────────────────────────────────────────────────
_vault_path: Optional[Path] = None
_vault_cache: Dict[str, Any] = {}
_embedding_model = None
_pio_process: Optional[subprocess.Popen] = None
_serial_process: Optional[subprocess.Popen] = None
_ws_clients: List[WebSocket] = []
_observer = None

# ─────────────────────────────────────────────────────────────
# MODELS
# ─────────────────────────────────────────────────────────────

class VaultSetRequest(BaseModel):
    path: str

class NoteWriteRequest(BaseModel):
    path: str
    content: str

class PIOCommand(BaseModel):
    command: str          # "flash" | "monitor" | "build" | "clean"
    port: Optional[str]   = None
    baud: Optional[int]   = 115200
    project_path: Optional[str] = None

class ContextFileRequest(BaseModel):
    path: str

# ─────────────────────────────────────────────────────────────
# HEALTH
# ─────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {
        "status": "online",
        "version": "0.1.0",
        "vault": str(_vault_path) if _vault_path else None,
        "vault_loaded": bool(_vault_cache),
        "embeddings": EMBEDDINGS_AVAILABLE,
        "watchdog": WATCHDOG_AVAILABLE,
        "notes": len(_vault_cache.get("notes", [])),
    }

# ─────────────────────────────────────────────────────────────
# VAULT
# ─────────────────────────────────────────────────────────────

@app.post("/vault/set")
async def vault_set(req: VaultSetRequest):
    global _vault_path
    p = Path(req.path).expanduser().resolve()
    if not p.exists():
        raise HTTPException(400, f"path does not exist: {p}")
    if not p.is_dir():
        raise HTTPException(400, f"path is not a directory: {p}")
    _vault_path = p
    result = await _parse_vault(p)
    _start_watcher(p)
    return result

@app.get("/vault/reload")
async def vault_reload():
    if not _vault_path:
        raise HTTPException(400, "vault path not set — POST /vault/set first")
    result = await _parse_vault(_vault_path)
    return result

@app.get("/vault/stats")
async def vault_stats():
    if not _vault_cache:
        return {"notes": 0, "edges": 0, "vault": None}
    notes = _vault_cache.get("notes", [])
    edges = _vault_cache.get("wiki_edges", []) + _vault_cache.get("sem_edges", [])
    return {
        "vault": str(_vault_path),
        "notes": len(notes),
        "wiki_edges": len(_vault_cache.get("wiki_edges", [])),
        "sem_edges": len(_vault_cache.get("sem_edges", [])),
        "total_edges": len(edges),
    }

@app.get("/vault/graph")
async def vault_graph():
    """return full graph data for MAGI_GRAPH"""
    if not _vault_cache:
        raise HTTPException(400, "vault not loaded")
    return _vault_cache

@app.get("/vault/notes")
async def vault_notes():
    if not _vault_cache:
        return {"notes": []}
    return {"notes": [
        {"id": n["id"], "title": n["title"], "path": n["path"],
         "links": n.get("links", []), "tags": n.get("tags", [])}
        for n in _vault_cache.get("notes", [])
    ]}

@app.get("/vault/note/{note_id}")
async def vault_note_content(note_id: int):
    if not _vault_cache:
        raise HTTPException(400, "vault not loaded")
    notes = _vault_cache.get("notes", [])
    if note_id >= len(notes):
        raise HTTPException(404, "note not found")
    note = notes[note_id]
    path = Path(note["path"])
    if not path.exists():
        raise HTTPException(404, "note file not found on disk")
    content = path.read_text(encoding="utf-8")
    return {"id": note_id, "title": note["title"], "path": str(path), "content": content}

@app.post("/vault/note/write")
async def vault_note_write(req: NoteWriteRequest):
    if not _vault_path:
        raise HTTPException(400, "vault not set")
    target = Path(req.path)
    if not target.is_absolute():
        target = _vault_path / req.path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(req.content, encoding="utf-8")
    await _broadcast({"type": "note_saved", "path": str(target)})
    return {"saved": str(target)}

@app.get("/vault/search")
async def vault_search(q: str):
    if not _vault_cache:
        return {"results": []}
    results = []
    q_lower = q.lower()
    for note in _vault_cache.get("notes", []):
        score = 0
        if q_lower in note["title"].lower():
            score += 10
        path = Path(note["path"])
        if path.exists():
            try:
                content = path.read_text(encoding="utf-8", errors="ignore")
                count = content.lower().count(q_lower)
                score += min(count, 5)
                if score > 0:
                    # grab excerpt
                    idx = content.lower().find(q_lower)
                    start = max(0, idx - 60)
                    end   = min(len(content), idx + 120)
                    excerpt = content[start:end].replace("\n", " ")
                    results.append({"id": note["id"], "title": note["title"],
                                    "path": note["path"], "score": score,
                                    "excerpt": excerpt})
            except Exception:
                pass
    results.sort(key=lambda x: x["score"], reverse=True)
    return {"results": results[:20]}

# ─────────────────────────────────────────────────────────────
# FILE OPS
# ─────────────────────────────────────────────────────────────

@app.get("/file/read")
async def file_read(path: str):
    p = Path(path).expanduser()
    if not p.exists():
        raise HTTPException(404, f"file not found: {path}")
    if not p.is_file():
        raise HTTPException(400, "path is not a file")
    content = p.read_text(encoding="utf-8", errors="replace")
    return {"path": str(p), "content": content, "size": p.stat().st_size}

@app.get("/file/list")
async def file_list(path: str, ext: Optional[str] = None):
    p = Path(path).expanduser()
    if not p.exists() or not p.is_dir():
        raise HTTPException(400, f"directory not found: {path}")
    files = []
    for f in sorted(p.rglob("*")):
        if f.is_file():
            if ext and not f.suffix == ext:
                continue
            files.append({"name": f.name, "path": str(f),
                          "size": f.stat().st_size,
                          "modified": f.stat().st_mtime})
    return {"files": files}

@app.get("/serial/ports")
async def serial_ports():
    """list available serial ports"""
    try:
        import serial.tools.list_ports
        ports = [{"device": p.device, "description": p.description,
                  "hwid": p.hwid}
                 for p in serial.tools.list_ports.comports()]
        return {"ports": ports}
    except ImportError:
        # fallback: scan /dev/tty*
        devs = sorted(Path("/dev").glob("ttyUSB*")) + sorted(Path("/dev").glob("ttyACM*"))
        return {"ports": [{"device": str(d), "description": "serial"} for d in devs]}

# ─────────────────────────────────────────────────────────────
# PLATFORMIO
# ─────────────────────────────────────────────────────────────

@app.post("/pio/run")
async def pio_run(cmd: PIOCommand):
    """run a PlatformIO command, stream output via WebSocket broadcast"""
    global _pio_process

    proj = cmd.project_path or os.getcwd()

    pio_args = {
        "flash":   ["pio", "run", "--target", "upload"],
        "build":   ["pio", "run"],
        "clean":   ["pio", "run", "--target", "clean"],
        "monitor": ["pio", "device", "monitor", "--baud", str(cmd.baud or 115200)],
    }.get(cmd.command)

    if not pio_args:
        raise HTTPException(400, f"unknown pio command: {cmd.command}")

    if cmd.port and cmd.command in ("flash", "monitor"):
        pio_args += ["--port", cmd.port]

    async def stream():
        proc = await asyncio.create_subprocess_exec(
            *pio_args,
            cwd=proj,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
        )
        async for line in proc.stdout:
            text = line.decode("utf-8", errors="replace").rstrip()
            await _broadcast({"type": "pio_output", "line": text, "command": cmd.command})
            yield text + "\n"
        await proc.wait()
        await _broadcast({"type": "pio_done", "command": cmd.command, "returncode": proc.returncode})
        yield f"[EXIT {proc.returncode}]\n"

    return StreamingResponse(stream(), media_type="text/plain")

@app.get("/pio/which")
async def pio_which():
    """check if pio is installed"""
    try:
        r = subprocess.run(["pio", "--version"], capture_output=True, text=True, timeout=5)
        return {"available": True, "version": r.stdout.strip()}
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return {"available": False, "version": None}

# ─────────────────────────────────────────────────────────────
# WEBSOCKET — push events to frontend
# ─────────────────────────────────────────────────────────────

@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await ws.accept()
    _ws_clients.append(ws)
    try:
        await ws.send_json({"type": "connected", "sidecar": "0.1.0"})
        while True:
            data = await ws.receive_text()
            # echo / ping
            if data == "ping":
                await ws.send_json({"type": "pong"})
    except WebSocketDisconnect:
        _ws_clients.remove(ws)

async def _broadcast(msg: dict):
    dead = []
    for ws in _ws_clients:
        try:
            await ws.send_json(msg)
        except Exception:
            dead.append(ws)
    for ws in dead:
        if ws in _ws_clients:
            _ws_clients.remove(ws)

# ─────────────────────────────────────────────────────────────
# VAULT PARSING INTERNALS
# ─────────────────────────────────────────────────────────────

WIKILINK_RE = re.compile(r'\[\[([^\]\|#]+)(?:[|\#][^\]]*)?\]\]')
TAG_RE      = re.compile(r'(?:^|\s)#([A-Za-z][A-Za-z0-9_/-]*)', re.MULTILINE)
FRONTMATTER_RE = re.compile(r'^---\s*\n(.*?)\n---', re.DOTALL)

async def _parse_vault(vault: Path) -> dict:
    global _vault_cache

    md_files = list(vault.rglob("*.md"))
    if not md_files:
        _vault_cache = {"notes": [], "wiki_edges": [], "sem_edges": [], "nodes": []}
        return _vault_cache

    notes = []
    title_to_id: Dict[str, int] = {}

    # first pass — collect all notes
    for i, f in enumerate(md_files):
        try:
            content = f.read_text(encoding="utf-8", errors="ignore")
        except Exception:
            continue

        title = f.stem

        # parse frontmatter title if present
        fm_match = FRONTMATTER_RE.match(content)
        if fm_match:
            fm = fm_match.group(1)
            for line in fm.splitlines():
                if line.startswith("title:"):
                    title = line.split(":", 1)[1].strip().strip('"\'')
                    break

        tags = TAG_RE.findall(content)
        links_raw = WIKILINK_RE.findall(content)

        notes.append({
            "id":      i,
            "title":   title,
            "path":    str(f),
            "links":   links_raw,
            "tags":    list(set(tags)),
            "content": content[:500],   # preview only — full loaded on demand
            "x": 0.0, "y": 0.0, "z": 0.0,
            "vx": 0.0, "vy": 0.0, "vz": 0.0,
            "type": "note",
        })
        title_to_id[title.lower()] = i
        title_to_id[f.stem.lower()] = i

    # second pass — resolve wikilinks to edges
    wiki_edges = []
    seen_edges = set()
    hub_candidates = {}

    for note in notes:
        for link in note["links"]:
            target_id = title_to_id.get(link.lower())
            if target_id is None:
                # fuzzy match: check if link is a substring of any title
                for key, tid in title_to_id.items():
                    if link.lower() in key or key in link.lower():
                        target_id = tid
                        break
            if target_id is not None and target_id != note["id"]:
                key = tuple(sorted([note["id"], target_id]))
                if key not in seen_edges:
                    seen_edges.add(key)
                    wiki_edges.append({"a": note["id"], "b": target_id, "type": "wiki"})
                hub_candidates[note["id"]] = hub_candidates.get(note["id"], 0) + 1

    # mark hubs (notes with 3+ outbound links)
    for note in notes:
        if hub_candidates.get(note["id"], 0) >= 3:
            note["type"] = "hub"

    # spread initial positions
    import math
    n = len(notes)
    for i, note in enumerate(notes):
        angle = (i / n) * 2 * math.pi
        r = 30 + (i % 5) * 8
        note["x"] = r * math.cos(angle)
        note["y"] = r * math.sin(angle)
        note["z"] = ((i % 7) - 3) * 8

    # semantic edges via embeddings
    sem_edges = []
    if EMBEDDINGS_AVAILABLE and len(notes) > 1:
        sem_edges = await _compute_semantic_edges(notes)

    # build graph node format (minimal, positions randomised by physics on frontend)
    graph_nodes = [{
        "id":    n["id"],
        "title": n["title"],
        "path":  n["path"],
        "links": n["links"],
        "tags":  n["tags"],
        "type":  n["type"],
        "x": n["x"], "y": n["y"], "z": n["z"],
        "vx": 0.0, "vy": 0.0, "vz": 0.0,
    } for n in notes]

    _vault_cache = {
        "notes":      notes,
        "nodes":      graph_nodes,
        "wiki_edges": wiki_edges,
        "sem_edges":  sem_edges,
    }

    await _broadcast({
        "type":       "vault_loaded",
        "notes":      len(notes),
        "wiki_edges": len(wiki_edges),
        "sem_edges":  len(sem_edges),
    })

    return {
        "notes":      len(notes),
        "wiki_edges": len(wiki_edges),
        "sem_edges":  len(sem_edges),
        "vault":      str(vault),
    }

async def _compute_semantic_edges(notes: list) -> list:
    global _embedding_model

    loop = asyncio.get_event_loop()

    def _run_embeddings():
        global _embedding_model
        if _embedding_model is None:
            print("[sidecar] loading embedding model (all-MiniLM-L6-v2)...")
            _embedding_model = SentenceTransformer("all-MiniLM-L6-v2")
            print("[sidecar] embedding model loaded")

        texts = [f"{n['title']} {n['content']}" for n in notes]
        embeddings = _embedding_model.encode(texts, show_progress_bar=False,
                                              batch_size=32, normalize_embeddings=True)
        return embeddings

    try:
        embeddings = await loop.run_in_executor(None, _run_embeddings)
        sem_edges = []
        seen = set()
        THRESHOLD = 0.55

        for i in range(len(notes)):
            # cosine sim — embeddings are normalized so dot product = cosine
            sims = np.dot(embeddings, embeddings[i])
            top = np.argsort(sims)[::-1]

            count = 0
            for j in top:
                if j == i or count >= 4:
                    break
                if sims[j] < THRESHOLD:
                    break
                key = tuple(sorted([i, int(j)]))
                if key not in seen:
                    seen.add(key)
                    sem_edges.append({
                        "a": i, "b": int(j),
                        "type": "sem",
                        "score": float(sims[j]),
                    })
                    count += 1

        print(f"[sidecar] computed {len(sem_edges)} semantic edges")
        return sem_edges

    except Exception as e:
        print(f"[sidecar] embedding error: {e}")
        return []

# ─────────────────────────────────────────────────────────────
# FILE WATCHER
# ─────────────────────────────────────────────────────────────

def _start_watcher(vault: Path):
    global _observer
    if not WATCHDOG_AVAILABLE:
        return
    if _observer:
        _observer.stop()
        _observer.join()

    class VaultHandler(FileSystemEventHandler):
        def on_modified(self, event):
            if event.src_path.endswith(".md"):
                asyncio.run(_reload_debounced())
        def on_created(self, event):
            if event.src_path.endswith(".md"):
                asyncio.run(_reload_debounced())
        def on_deleted(self, event):
            if event.src_path.endswith(".md"):
                asyncio.run(_reload_debounced())

    _observer = Observer()
    _observer.schedule(VaultHandler(), str(vault), recursive=True)
    _observer.start()
    print(f"[sidecar] watching vault: {vault}")

_reload_scheduled = False
async def _reload_debounced():
    global _reload_scheduled
    if _reload_scheduled:
        return
    _reload_scheduled = True
    await asyncio.sleep(2.0)   # debounce 2s
    _reload_scheduled = False
    if _vault_path:
        await _parse_vault(_vault_path)
        print("[sidecar] vault reloaded (file change detected)")

# ─────────────────────────────────────────────────────────────
# MAIN
# ─────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    print("=" * 56)
    print("  MADGOD sidecar v0.1.0")
    print("  http://localhost:8765")
    print("  embeddings:", "YES" if EMBEDDINGS_AVAILABLE else "NO (pip install sentence-transformers)")
    print("  watchdog:  ", "YES" if WATCHDOG_AVAILABLE else "NO (pip install watchdog)")
    print("=" * 56)
    uvicorn.run(app, host="127.0.0.1", port=8765, log_level="warning")

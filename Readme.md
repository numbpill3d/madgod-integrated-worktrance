# MADGOD
### workspace operating environment

> 3D Obsidian topology · streaming AI chat · ESP32 serial/flash · generative visuals  
> aesthetic: pure black/white/grey · EVA geometry · CRT scanlines · VT323

---

## quickstart

```bash
# clone / extract, then:
chmod +x launch.sh
./launch.sh
```

opens at `http://localhost:8080` · sidecar API at `http://localhost:8765`

**Chromium required** for Web Serial (ESP32 monitor). Firefox works for everything else.

---

## first run

On first launch a setup overlay appears. Enter:
- **Anthropic API key** — `sk-ant-api03-...` (get at console.anthropic.com)
- **Obsidian vault path** — `/home/you/obsidian` (optional, leave blank for demo graph)

Or configure later via terminal:
```
set claude.key sk-ant-api03-...
vault set /path/to/obsidian
vault reload
```

---

## terminal commands

| command | description |
|---|---|
| `graph` | open 3D note topology |
| `chat [claude\|ollama\|openrouter]` | open AI chat, optionally switch provider |
| `note [title]` | open note editor |
| `code [file]` | open code editor |
| `esp32 [monitor\|flash\|ports\|baud]` | ESP32 control |
| `context [add\|remove\|clear\|list]` | manage AI context injection |
| `visual [particles\|alife\|field\|wave\|strange]` | generative art canvas |
| `vault set <path>` | set Obsidian vault path |
| `vault reload` | rebuild graph from vault |
| `vault search <query>` | full-text search vault |
| `vault stats` | show vault statistics |
| `set claude.key <key>` | save Claude API key |
| `set openrouter.key <key>` | save OpenRouter key |
| `set provider <claude\|ollama\|openrouter>` | switch AI provider |
| `sidecar status` | check sidecar status |
| `sidecar connect` | reconnect sidecar |
| `config` | open settings modal |
| `status` | show system status |
| `help` | command reference |

**keyboard shortcuts**  
`Ctrl+K` or `Ctrl+/` → focus terminal  
`Ctrl+1–7` → switch modules  
`Ctrl+,` → config modal  
`Tab` → autocomplete in terminal  
`↑ / ↓` → command history  

---

## sidecar

The Python sidecar (`sidecar/main.py`) handles:
- Vault markdown parsing + wikilink graph construction
- Semantic similarity edges via `sentence-transformers`
- File read/write API
- PlatformIO subprocess integration
- Vault file watching (auto-reload on `.md` changes)
- WebSocket push events to frontend

**manual start:**
```bash
cd sidecar
pip install -r requirements.txt
python main.py
```

**API endpoints:**
```
GET  /health
POST /vault/set        { "path": "/home/you/obsidian" }
GET  /vault/reload
GET  /vault/graph
GET  /vault/notes
GET  /vault/note/{id}
POST /vault/note/write { "path": "file.md", "content": "..." }
GET  /vault/search?q=query
GET  /file/read?path=/abs/path
GET  /file/list?path=/dir&ext=.py
GET  /serial/ports
POST /pio/run          { "command": "flash", "port": "/dev/ttyUSB0" }
WS   /ws
```

---

## modules

| module | key | description |
|---|---|---|
| MAGI_GRAPH | `Ctrl+1` | 3D force-directed Obsidian note topology · Two edge types: wikilinks (bright) + semantic similarity (dim) · click node to open note |
| SOMA_CHAT | `Ctrl+2` | Streaming AI chat · Claude / Ollama / OpenRouter · context injection · code highlighting |
| LEXICON | `Ctrl+3` | Markdown editor · live preview · wikilink autocomplete · save to vault |
| CORTEX_CODE | `Ctrl+4` | Code editor · quick AI prompts · send to chat · inject to context |
| ESP32_CTRL | `Ctrl+5` | Web Serial monitor · PlatformIO build/flash/clean · baud control |
| CTX_INJECT | `Ctrl+6` | Drag-drop context manager · path loader via sidecar · token counter |
| VISUAL_LAB | `Ctrl+7` | Generative canvas: particles · boids A-life · vector field · wave mesh · Lorenz attractor |

---

## extending

**add a module:**
1. Create `src/modules/mymodule.js` with `MADGOD.registerModule('mymodule', { onActivate, getActions })`
2. Add `<script src="src/modules/mymodule.js">` to `index.html` before `init.js`
3. Add nav button: `<button class="nav-item" data-module="mymodule"><span class="nav-icon">◎</span><span class="nav-label">MY_MODULE</span></button>`
4. Add command entry to `COMMAND_MAP` in `src/core/commands.js`

---

## stack

- **frontend** — vanilla JS + Three.js r128, no framework, single HTML entry point
- **sidecar** — Python FastAPI + sentence-transformers + watchdog + uvicorn
- **AI** — Anthropic Claude (direct API), Ollama (local), OpenRouter (proxy)
- **ESP32** — Web Serial API + PlatformIO CLI via sidecar subprocess

---

*built for Arch Linux · Chromium · Obsidian vaults*  
*aesthetic: laincore × EVA-NERV × terminal brutalism*

#!/usr/bin/env node
// ============================================================
// MADGOD — sidecar bundler
// runs PyInstaller on main.py → produces a single binary
// that Tauri ships as an externalBin resource.
//
// output lands in src-tauri/binaries/madgod-sidecar-<triple>
// where <triple> is the Rust target triple for this machine.
//
// usage:  node scripts/bundle-sidecar.js [--target <triple>]
// ============================================================

const { execSync, spawnSync } = require('child_process');
const path  = require('path');
const fs    = require('fs');
const os    = require('os');

// ── resolve target triple ─────────────────────────────────
function detectTriple() {
  try {
    const out = execSync('rustc -vV', { encoding: 'utf8' });
    const m = out.match(/host:\s+(\S+)/);
    if (m) return m[1];
  } catch (_) {}

  // fallback heuristic
  const p = process.platform;
  const a = process.arch === 'x64' ? 'x86_64' : 'aarch64';
  if (p === 'linux')  return `${a}-unknown-linux-gnu`;
  if (p === 'darwin') return `${a}-apple-darwin`;
  if (p === 'win32')  return `${a}-pc-windows-msvc`;
  throw new Error('cannot detect Rust target triple — pass --target <triple>');
}

const args   = process.argv.slice(2);
const tIdx   = args.indexOf('--target');
const triple = tIdx !== -1 ? args[tIdx + 1] : detectTriple();

const ROOT    = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'src-tauri', 'binaries');
const MAIN_PY = path.join(ROOT, 'main.py');
const BIN_EXT = process.platform === 'win32' ? '.exe' : '';
const OUT_NAME = `madgod-sidecar-${triple}${BIN_EXT}`;
const OUT_PATH = path.join(OUT_DIR, OUT_NAME);

fs.mkdirSync(OUT_DIR, { recursive: true });

// ── check PyInstaller ─────────────────────────────────────
function hasPyInstaller() {
  const r = spawnSync('pyinstaller', ['--version'], { encoding: 'utf8' });
  return r.status === 0;
}

if (!hasPyInstaller()) {
  console.log('[sidecar] PyInstaller not found — installing...');
  execSync('pip3 install pyinstaller --break-system-packages', { stdio: 'inherit' });
}

// ── build hidden imports list ────────────────────────────
// FastAPI + sentence-transformers have many dynamic imports
const HIDDEN = [
  'uvicorn.logging',
  'uvicorn.loops',
  'uvicorn.loops.auto',
  'uvicorn.protocols',
  'uvicorn.protocols.http',
  'uvicorn.protocols.http.auto',
  'uvicorn.protocols.websockets',
  'uvicorn.protocols.websockets.auto',
  'uvicorn.lifespan',
  'uvicorn.lifespan.on',
  'uvicorn.main',
  'fastapi',
  'starlette',
  'pydantic',
  'anyio',
  'anyio._backends._asyncio',
  'sentence_transformers',
  'torch',
  'numpy',
  'sklearn',
  'watchdog',
  'watchdog.observers',
  'watchdog.observers.inotify',   // Linux
  'watchdog.observers.fsevents',  // macOS
  'watchdog.observers.winapi',    // Windows
  'serial',
].map(m => `--hidden-import=${m}`).join(' ');

const COLLECT = [
  'sentence_transformers',
  'torch',
  'sklearn',
].map(m => `--collect-all=${m}`).join(' ');

// ── run PyInstaller ───────────────────────────────────────
console.log(`[sidecar] building for triple: ${triple}`);
console.log(`[sidecar] output: ${OUT_PATH}`);
console.log('[sidecar] running PyInstaller (this takes ~60-120s first time)...\n');

const WORK_DIR = path.join(ROOT, '.pyinstaller-work');
const DIST_DIR = path.join(ROOT, '.pyinstaller-dist');

const cmd = [
  'pyinstaller',
  '--onefile',
  '--noconfirm',
  '--clean',
  `--name madgod-sidecar`,
  `--distpath "${DIST_DIR}"`,
  `--workpath "${WORK_DIR}"`,
  `--specpath "${WORK_DIR}"`,
  HIDDEN,
  COLLECT,
  `"${MAIN_PY}"`,
].join(' ');

try {
  execSync(cmd, { stdio: 'inherit', cwd: ROOT });
} catch (e) {
  console.error('[sidecar] PyInstaller failed:', e.message);
  process.exit(1);
}

// ── copy to binaries/ with triple suffix ─────────────────
const builtBin = path.join(DIST_DIR, `madgod-sidecar${BIN_EXT}`);
if (!fs.existsSync(builtBin)) {
  console.error('[sidecar] built binary not found at', builtBin);
  process.exit(1);
}

fs.copyFileSync(builtBin, OUT_PATH);
if (process.platform !== 'win32') {
  fs.chmodSync(OUT_PATH, 0o755);
}

console.log(`\n[sidecar] ✓  binary ready: src-tauri/binaries/${OUT_NAME}`);
console.log('[sidecar]    run "npm run build" to bundle into the app\n');

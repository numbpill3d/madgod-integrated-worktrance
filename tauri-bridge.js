// ============================================================
// MADGOD — Tauri bridge
// loaded before state.js only when running inside Tauri.
// Replaces shell-based sidecar launch with Tauri IPC.
// In browser mode (python -m http.server) this file is skipped.
// ============================================================

(function () {
  // detect Tauri environment
  const IS_TAURI = typeof window.__TAURI__ !== 'undefined' ||
                   typeof window.__TAURI_INTERNALS__ !== 'undefined';

  if (!IS_TAURI) return;  // running in plain browser — do nothing

  const { invoke } = window.__TAURI__.core;

  // ── override MADGOD.connectSidecar ───────────────────────
  // wait until MADGOD is defined (scripts load after this file)
  document.addEventListener('DOMContentLoaded', async () => {

    // 1. ask Tauri to spawn the sidecar
    try {
      const port = await invoke('start_sidecar');
      console.log('[tauri-bridge] sidecar started on port', port);
    } catch (e) {
      console.warn('[tauri-bridge] sidecar spawn failed:', e);
    }

    // 2. patch MADGOD state with platform info
    try {
      const platform = await invoke('get_platform');
      window._MADGOD_PLATFORM = platform;
      // Web Serial is unavailable on non-Chromium — warn on Windows/Mac WebView
      if (platform !== 'linux') {
        console.info('[tauri-bridge] platform:', platform, '— Web Serial may be limited in WebView');
      }
    } catch (_) {}

    // 3. override window controls (decorations are off — we draw our own titlebar)
    window.TAURI_WIN = {
      minimize: () => invoke('window_minimize'),
      maximize: () => invoke('window_maximize'),
      close:    () => invoke('window_close'),
    };

    // 4. patch file dialogs into MADGOD modules
    window.TAURI_DIALOG = {
      openFile: (title, filters, multiple = false) =>
        invoke('dialog_open_file', { title, filters, multiple }),

      saveFile: (title, defaultName, filters) =>
        invoke('dialog_save_file', { title, defaultName, filters }),

      openDir: (title) =>
        invoke('dialog_open_dir', { title }),
    };

    // 5. inject titlebar window-control buttons (decorations=false)
    injectTitlebarControls();
  });

  function injectTitlebarControls() {
    const titlebar = document.getElementById('titlebar');
    if (!titlebar) return;

    // remove any existing controls first (idempotent)
    titlebar.querySelectorAll('.win-ctrl').forEach(el => el.remove());

    const controls = document.createElement('div');
    controls.style.cssText = 'display:flex;gap:6px;align-items:center;margin-left:auto;padding-right:4px;flex-shrink:0';

    [
      { label: '─', title: 'minimize', fn: () => invoke('window_minimize') },
      { label: '□', title: 'maximize', fn: () => invoke('window_maximize') },
      { label: '✕', title: 'close',    fn: () => invoke('window_close'),    danger: true },
    ].forEach(({ label, title, fn, danger }) => {
      const btn = document.createElement('button');
      btn.textContent = label;
      btn.title = title;
      btn.className = 'win-ctrl icon-btn';
      if (danger) btn.style.cssText = '--btn-hover-color:var(--danger)';
      btn.addEventListener('click', fn);
      controls.appendChild(btn);
    });

    // draggable region on titlebar (Tauri data-tauri-drag-region)
    titlebar.setAttribute('data-tauri-drag-region', '');
    titlebar.style.cursor = 'default';
    titlebar.appendChild(controls);
  }

})();

// ============================================================
// MADGOD — global state + sidecar bridge
// ============================================================

window.MADGOD = {
  version: '0.1.0',
  SIDECAR_URL: 'http://localhost:8765',
  SIDECAR_WS:  'ws://localhost:8765/ws',

  state: {
    activeModule: 'graph',
    provider: localStorage.getItem('mg_provider') || 'claude',
    ollamaModel: 'llama3',
    vaultPath: localStorage.getItem('mg_vault_path') || '~/obsidian',
    vaultLoaded: false,
    apiKeys: {
      claude:     localStorage.getItem('mg_claude_key') || '',
      openrouter: localStorage.getItem('mg_or_key')     || '',
    },
    context: [],
    contextTokens: 0,
    conversation: [],
    notes: [],
    graph: { nodes: [], edges: [], _wiki: [], _sem: [] },
    esp: { connected: false, port: null, baud: 115200 },
    session: { start: Date.now() },
    terminal: { history: [], historyIdx: -1, collapsed: false },
    railCollapsed: false,
    terminalH: 200,
    sidecar: { online: false, ws: null, embeddings: false },
    physicsRunning: true,
  },

  modules: {},
  registerModule(id, mod) { this.modules[id] = mod; },
  getState() { return this.state; },

  set(key, val) { this.state[key] = val; this._emit('statechange', { key, val }); },
  _listeners: {},
  on(event, fn) { if (!this._listeners[event]) this._listeners[event] = []; this._listeners[event].push(fn); },
  _emit(event, data) { (this._listeners[event] || []).forEach(fn => fn(data)); },

  saveKey(provider, key) { this.state.apiKeys[provider] = key; localStorage.setItem(`mg_${provider}_key`, key); },
  saveVaultPath(p)        { this.state.vaultPath = p;            localStorage.setItem('mg_vault_path', p); },

  async sidecarFetch(path, opts = {}) {
    const res = await fetch(this.SIDECAR_URL + path, {
      ...opts, headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    });
    if (!res.ok) { const e = await res.json().catch(() => ({ detail: res.statusText })); throw new Error(e.detail || `HTTP ${res.status}`); }
    return res.json();
  },

  async sidecarPost(path, body) {
    return this.sidecarFetch(path, { method: 'POST', body: JSON.stringify(body) });
  },

  async connectSidecar() {
    try {
      const h = await this.sidecarFetch('/health');
      this.state.sidecar.online = true;
      this.state.sidecar.embeddings = h.embeddings;
      const dot = document.getElementById('vault-dot');
      if (dot) dot.classList.add('active');
      if (h.vault) { this.saveVaultPath(h.vault); const vp = document.getElementById('vault-path'); if (vp) vp.textContent = h.vault; }
      Terminal.success(`sidecar online — notes: ${h.notes}  embeddings: ${h.embeddings ? 'YES' : 'NO'}`);
      this._connectSidecarWS();
      if (h.vault_loaded && h.notes > 0) {
        Terminal.info(`vault cached — loading graph (${h.notes} notes)`);
        setTimeout(() => { if (this.modules.graph && this.modules.graph.loadVaultFromSidecar) this.modules.graph.loadVaultFromSidecar(); }, 600);
      }
    } catch(e) {
      this.state.sidecar.online = false;
      Terminal.warn('sidecar offline — run: python sidecar/main.py');
      Terminal.sys('vault graph, file ops, PlatformIO require sidecar');
    }
  },

  _connectSidecarWS() {
    try {
      const ws = new WebSocket(this.SIDECAR_WS);
      this.state.sidecar.ws = ws;
      ws.onmessage = (e) => { try { this._handleSidecarEvent(JSON.parse(e.data)); } catch {} };
      ws.onclose   = () => { this.state.sidecar.ws = null; setTimeout(() => { if (this.state.sidecar.online) this._connectSidecarWS(); }, 5000); };
    } catch(e) {}
  },

  _handleSidecarEvent(msg) {
    switch(msg.type) {
      case 'vault_loaded':
        Terminal.success(`vault reloaded — ${msg.notes} notes, ${msg.wiki_edges} wiki + ${msg.sem_edges} semantic edges`);
        if (this.modules.graph && this.modules.graph.loadVaultFromSidecar) this.modules.graph.loadVaultFromSidecar();
        break;
      case 'note_saved':
        Terminal.success(`saved: ${msg.path}`);
        break;
      case 'pio_output':
        if (this.modules.esp32 && this.modules.esp32.pioLine) this.modules.esp32.pioLine(msg.line);
        break;
      case 'pio_done':
        Terminal.success(`pio ${msg.command} finished (exit ${msg.returncode})`);
        break;
    }
  },
};

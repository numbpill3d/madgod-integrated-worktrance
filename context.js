// ============================================================
// MADGOD — CTX_INJECT module  (full build)
// context manager: drag-drop, file-picker, sidecar path read
// ============================================================

MADGOD.registerModule('context', (() => {

  function render() {
    const el = document.getElementById('module-context');
    el.innerHTML = `
      <div id="context-drop-zone">
        <div style="font-size:14px;margin-bottom:8px;color:var(--text)">DROP FILES HERE</div>
        <div style="margin-bottom:6px">or click to browse, or load from vault path via sidecar</div>
        <div style="font-size:11px;color:var(--text-dim)">supported: .md .txt .py .js .cpp .c .rs .json .yaml .toml and any text file</div>
      </div>
      <div id="ctx-path-row" style="display:flex;padding:0 20px 12px;gap:0">
        <input type="text" id="ctx-path-input" placeholder="/path/to/file.py  (requires sidecar)">
        <button class="icon-btn" id="ctx-path-load" style="border-left:none">[ LOAD ]</button>
      </div>
      <div id="ctx-summary" style="padding:0 20px 8px;font-size:11px;color:var(--text-dim);display:flex;gap:16px">
        <span>FILES: <span id="ctx-file-count">0</span></span>
        <span>TOKENS: <span id="ctx-token-count">0</span></span>
        <span>EST COST: <span id="ctx-cost">$0.000</span></span>
      </div>
      <div id="context-items" style="flex:1;overflow-y:auto;padding:0 20px 20px"></div>`;

    bindContext();
    renderItems();
  }

  function bindContext() {
    const dropZone = document.getElementById('context-drop-zone');

    dropZone.addEventListener('click', () => {
      const input = document.createElement('input');
      input.type = 'file'; input.multiple = true;
      input.onchange = e => Array.from(e.target.files).forEach(readAndAdd);
      input.click();
    });
    dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
    dropZone.addEventListener('drop', e => {
      e.preventDefault(); dropZone.classList.remove('drag-over');
      Array.from(e.dataTransfer.files).forEach(readAndAdd);
    });

    document.getElementById('ctx-path-load').addEventListener('click', loadByPath);
    document.getElementById('ctx-path-input').addEventListener('keydown', e => { if (e.key==='Enter') loadByPath(); });
  }

  function readAndAdd(file) {
    const reader = new FileReader();
    reader.onload = e => {
      const content = e.target.result;
      addItem({ name: file.name, content, tokens: Math.ceil(content.length/4), size: file.size, source: 'local' });
    };
    reader.readAsText(file);
  }

  async function loadByPath() {
    const pathEl = document.getElementById('ctx-path-input');
    const path   = pathEl?.value.trim();
    if (!path) return;
    if (!MADGOD.state.sidecar.online) {
      Terminal.error('path loading requires sidecar — run: python sidecar/main.py');
      return;
    }
    Terminal.info(`loading: ${path}`);
    try {
      const r = await MADGOD.sidecarFetch(`/file/read?path=${encodeURIComponent(path)}`);
      const name = path.split('/').pop();
      addItem({ name, content: r.content, tokens: Math.ceil(r.content.length/4), size: r.size, source: 'sidecar', path });
      if (pathEl) pathEl.value = '';
    } catch(e) {
      Terminal.error(`load failed: ${e.message}`);
    }
  }

  function addItem(item) {
    // dedupe by name
    const existing = MADGOD.state.context.findIndex(f => f.name === item.name);
    if (existing >= 0) {
      MADGOD.state.context[existing] = item;
      Terminal.info(`updated context: ${item.name}`);
    } else {
      MADGOD.state.context.push(item);
      Terminal.success(`added to context: ${item.name} (${item.tokens} tokens)`);
    }
    recalcTokens();
    renderItems();
    updateCtxBar();
  }

  function addFile(name) {
    if (!MADGOD.state.sidecar.online) {
      Terminal.warn('sidecar offline — drag the file onto CTX_INJECT or open the module and use the path loader');
      return;
    }
    // route to path loader
    Router.navigate('context');
    setTimeout(() => {
      const pathEl = document.getElementById('ctx-path-input');
      if (pathEl) { pathEl.value = name; pathEl.focus(); }
    }, 150);
  }

  function removeFile(name) {
    const idx = MADGOD.state.context.findIndex(f => f.name === name);
    if (idx < 0) { Terminal.error(`not in context: ${name}`); return; }
    MADGOD.state.context.splice(idx, 1);
    recalcTokens();
    renderItems();
    updateCtxBar();
    Terminal.info(`removed: ${name}`);
  }

  function recalcTokens() {
    MADGOD.state.contextTokens = MADGOD.state.context.reduce((a,f)=>a+(f.tokens||0),0);
  }

  function renderItems() {
    const el = document.getElementById('context-items');
    if (!el) return;
    el.innerHTML = '';

    // summary bar
    const count  = MADGOD.state.context.length;
    const tokens = MADGOD.state.contextTokens;
    const cost   = ((tokens / 1000000) * 3).toFixed(4); // claude sonnet input ~$3/MTok
    const fc = document.getElementById('ctx-file-count');  if (fc) fc.textContent=count;
    const tc = document.getElementById('ctx-token-count'); if (tc) tc.textContent=tokens.toLocaleString();
    const cc = document.getElementById('ctx-cost');        if (cc) cc.textContent=`$${cost}`;

    if (count === 0) {
      el.innerHTML = '<div style="padding:20px;color:var(--text-dim);font-size:12px;letter-spacing:.08em;border:1px dashed var(--border)">NO FILES IN CONTEXT — drop files above or load by path</div>';
      return;
    }

    MADGOD.state.context.forEach((f, i) => {
      const card = document.createElement('div');
      card.className = 'ctx-item-card';
      card.innerHTML = `
        <div class="ctx-item-info">
          <div class="ctx-item-name">${f.name}</div>
          <div class="ctx-item-meta">${(f.tokens||0).toLocaleString()} tokens │ ${f.size ? (f.size/1024).toFixed(1)+'kb' : '?'} │ ${f.source||'local'}</div>
        </div>
        <div style="display:flex;gap:6px;align-items:flex-start">
          <button class="ctx-item-remove" data-i="${i}" title="remove">[ ✕ ]</button>
        </div>`;
      card.querySelector('.ctx-item-remove').addEventListener('click', () => {
        MADGOD.state.context.splice(i, 1);
        recalcTokens(); renderItems(); updateCtxBar();
        Terminal.info(`removed: ${f.name}`);
      });
      el.appendChild(card);
    });
  }

  function updateCtxBar() {
    const total = MADGOD.state.contextTokens;
    const bar   = document.getElementById('ctx-bar');
    const label = document.getElementById('ctx-tokens');
    if (bar)   bar.style.width = Math.min(100, (total/100000)*100) + '%';
    if (label) label.textContent = `${(total/1000).toFixed(1)}k / 100k`;
    const chatCtx = document.getElementById('chat-ctx-tokens');
    if (chatCtx) chatCtx.textContent = total.toLocaleString();
    const toggle = document.getElementById('chat-ctx-toggle');
    if (toggle) toggle.textContent = `[ CTX: ${MADGOD.state.context.length} ]`;
  }

  function onActivate() { render(); Terminal.sys('CTX_INJECT online'); }

  return { onActivate, addFile, removeFile, render };
})());

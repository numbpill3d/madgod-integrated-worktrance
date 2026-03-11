// ============================================================
// MADGOD — init  (full build)
// bootstraps workspace, first-run setup, sidecar connect
// ============================================================

(function() {

  // ── build module DOM scaffolding ──────────────────────────
  const moduleIds = ['graph','chat','note','code','esp32','context','visual'];
  const container = document.getElementById('module-container');
  moduleIds.forEach(id => {
    const div = document.createElement('div');
    div.id = `module-${id}`; div.className = 'module';
    container.appendChild(div);
  });

  // graph overlays
  document.getElementById('module-graph').insertAdjacentHTML('beforeend', `
    <div id="graph-overlay">
      <div class="graph-stat" id="graph-stat-nodes">NODES --</div>
      <div class="graph-stat" id="graph-stat-edges">EDGES --</div>
      <div class="graph-stat" id="graph-stat-physics" style="cursor:pointer" title="click to toggle physics">PHYSICS ON</div>
    </div>
    <div id="graph-hover-info"><div class="hover-title">--</div><div class="hover-meta">--</div></div>
  `);

  // modal overlay
  document.body.insertAdjacentHTML('beforeend',`<div id="modal-overlay"><div id="modal-box"></div></div>`);

  // first-run overlay
  const hasKey   = !!localStorage.getItem('mg_claude_key') || !!localStorage.getItem('mg_or_key');
  const hasVault = !!localStorage.getItem('mg_vault_path');
  const firstRun = !hasKey && !hasVault && !localStorage.getItem('mg_first_run_done');

  if (firstRun) {
    document.body.insertAdjacentHTML('afterbegin', `
      <div id="first-run-overlay">
        <div class="fr-logo">MADGOD</div>
        <div class="fr-sub">WORKSPACE OPERATING ENVIRONMENT // FIRST RUN</div>
        <div class="fr-form">
          <div class="fr-field">
            <label>ANTHROPIC API KEY</label>
            <input type="password" id="fr-claude-key" placeholder="sk-ant-api03-...">
            <span class="fr-hint">get yours at console.anthropic.com</span>
          </div>
          <div class="fr-field">
            <label>OBSIDIAN VAULT PATH  <span style="color:var(--text-dim)">(optional)</span></label>
            <input type="text" id="fr-vault" placeholder="/home/you/obsidian">
            <span class="fr-hint">leave blank to use demo graph</span>
          </div>
          <div class="fr-field">
            <label>OPENROUTER API KEY  <span style="color:var(--text-dim)">(optional)</span></label>
            <input type="password" id="fr-or-key" placeholder="sk-or-...">
          </div>
          <div class="fr-actions">
            <button class="fr-btn primary" id="fr-save">[ INITIALIZE MADGOD ]</button>
          </div>
          <div class="fr-skip" id="fr-skip">skip — configure later via terminal</div>
        </div>
      </div>`);

    document.getElementById('fr-save').addEventListener('click', () => {
      const ck = document.getElementById('fr-claude-key')?.value.trim();
      const vk = document.getElementById('fr-vault')?.value.trim();
      const ok = document.getElementById('fr-or-key')?.value.trim();
      if (ck)  MADGOD.saveKey('claude', ck);
      if (ok)  MADGOD.saveKey('openrouter', ok);
      if (vk)  MADGOD.saveVaultPath(vk);
      localStorage.setItem('mg_first_run_done','1');
      document.getElementById('first-run-overlay').classList.add('hidden');
      bootWorkspace();
    });
    document.getElementById('fr-skip').addEventListener('click', () => {
      localStorage.setItem('mg_first_run_done','1');
      document.getElementById('first-run-overlay').classList.add('hidden');
      bootWorkspace();
    });
    document.getElementById('fr-claude-key').focus();
  } else {
    bootWorkspace();
  }

  // ── MAIN BOOT ─────────────────────────────────────────────
  function bootWorkspace() {
    Terminal.init();
    Router.init();

    // settings button
    document.getElementById('settings-btn').addEventListener('click', () => Modal.open('settings'));

    // graph physics stat toggle
    document.getElementById('graph-stat-physics')?.addEventListener('click', () => {
      MADGOD.state.physicsRunning = !MADGOD.state.physicsRunning;
      const el = document.getElementById('graph-stat-physics');
      if (el) el.textContent = `PHYSICS ${MADGOD.state.physicsRunning ? 'ON' : 'OFF'}`;
    });

    // clock + uptime
    function tick() {
      const now=new Date();
      const hh=String(now.getHours()).padStart(2,'0'), mm=String(now.getMinutes()).padStart(2,'0'), ss=String(now.getSeconds()).padStart(2,'0');
      document.getElementById('sb-time').textContent=`${hh}:${mm}:${ss}`;
      const e=Math.floor((Date.now()-MADGOD.state.session.start)/1000);
      const eh=String(Math.floor(e/3600)).padStart(2,'0'), em=String(Math.floor((e%3600)/60)).padStart(2,'0'), es=String(e%60).padStart(2,'0');
      document.getElementById('sb-uptime').textContent=`UPTIME ${eh}:${em}:${es}`;
      document.getElementById('session-time').textContent=`${eh}:${em}:${es}`;
    }
    setInterval(tick,1000); tick();

    // vault path display + provider
    document.getElementById('vault-path').textContent = MADGOD.state.vaultPath;
    document.getElementById('vault-dot').classList.add('pulse');
    document.getElementById('ai-dot').classList.add('active');
    document.getElementById('ai-provider').textContent = MADGOD.state.provider.toUpperCase();

    // keyboard shortcuts
    document.addEventListener('keydown', e => {
      const tag=document.activeElement.tagName;
      if ((e.ctrlKey||e.metaKey) && e.key==='k') { e.preventDefault(); Terminal.focus(); return; }
      if (e.ctrlKey && !e.shiftKey && !e.metaKey) {
        const idx=parseInt(e.key)-1;
        const ids=['graph','chat','note','code','esp32','context','visual'];
        if (ids[idx] !== undefined) { e.preventDefault(); Router.navigate(ids[idx]); return; }
        if (e.key===',' ) { e.preventDefault(); Modal.open('settings'); return; }
        if (e.key==='/' ) { e.preventDefault(); Terminal.focus(); return; }
      }
    });

    // boot module
    Router.navigate(MADGOD.state.activeModule);

    Terminal.sys('MADGOD workspace initialized');
    Terminal.info('Ctrl+K or Ctrl+/  →  terminal    Ctrl+1–7  →  modules    Ctrl+,  →  config');

    // connect sidecar after a short delay (non-blocking)
    setTimeout(() => MADGOD.connectSidecar(), 800);
  }

})();

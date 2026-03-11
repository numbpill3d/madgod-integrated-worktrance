// ============================================================
// MADGOD — ESP32_CTRL  (full build)
// Web Serial + PlatformIO sidecar integration
// ============================================================

MADGOD.registerModule('esp32', (() => {
  let port=null, reader=null, writer=null, readLoop=false;
  let _pioStreaming = false;

  function render() {
    const el = document.getElementById('module-esp32');
    const s  = MADGOD.state.esp;
    el.innerHTML = `
      <div id="esp-topbar">
        <div class="esp-control-group">
          <span class="esp-label">PORT</span>
          <select class="esp-select" id="esp-port-select">
            <option value="">-- select --</option>
          </select>
          <button class="esp-btn" id="esp-scan-btn">[ SCAN ]</button>
        </div>
        <div class="esp-control-group">
          <span class="esp-label">BAUD</span>
          <select class="esp-select" id="esp-baud-select">
            ${[9600,19200,57600,74880,115200,230400,460800,921600].map(b=>`<option value="${b}" ${b===s.baud?'selected':''}>${b}</option>`).join('')}
          </select>
        </div>
        <button class="esp-btn" id="esp-connect-btn">${s.connected?'[ DISCONNECT ]':'[ CONNECT ]'}</button>
        <button class="esp-btn" id="esp-clear-btn">[ CLEAR ]</button>
        <div class="esp-control-group" style="border-left:1px solid var(--border);padding-left:10px;margin-left:4px">
          <span class="esp-label">PIO</span>
          <button class="esp-btn" id="esp-flash-btn">[ FLASH ]</button>
          <button class="esp-btn" id="esp-build-btn">[ BUILD ]</button>
          <button class="esp-btn" id="esp-clean-btn">[ CLEAN ]</button>
        </div>
        <div class="esp-control-group" style="margin-left:auto">
          <span class="dot ${s.connected?'pulse':''}"></span>
          <span style="font-size:11px;color:var(--text-muted)" id="esp-status-label">${s.connected?s.port||'connected':'no device'}</span>
        </div>
      </div>
      <div id="esp-toolbar" style="display:flex;align-items:center;gap:8px;padding:4px 12px;border-bottom:1px solid var(--border);background:var(--bg-panel);flex-shrink:0">
        <span style="font-size:10px;color:var(--text-dim);letter-spacing:.1em">AUTOSCROLL</span>
        <input type="checkbox" id="esp-autoscroll" checked>
        <span style="font-size:10px;color:var(--text-dim);letter-spacing:.1em;margin-left:10px">TIMESTAMPS</span>
        <input type="checkbox" id="esp-timestamps" checked>
        <span style="font-size:10px;color:var(--text-dim);letter-spacing:.1em;margin-left:10px">HEX</span>
        <input type="checkbox" id="esp-hex">
        <span id="esp-line-count" style="margin-left:auto;font-size:10px;color:var(--text-dim)">0 lines</span>
      </div>
      <div id="esp-serial-output"></div>
      <div id="esp-input-row">
        <span class="esp-send-prompt">TX &gt;</span>
        <input type="text" id="esp-serial-input" placeholder="send to device (Enter to send)">
        <button class="esp-btn" id="esp-send-btn" style="flex-shrink:0">[ SEND ]</button>
      </div>`;

    bindEsp();
    sysLine('ESP32_CTRL online');
    sysLine('Web Serial: ' + ('serial' in navigator ? 'available' : 'NOT available — requires Chromium'));
    sysLine('PlatformIO sidecar: ' + (MADGOD.state.sidecar.online ? 'online' : 'offline'));
    if (MADGOD.state.sidecar.online) _scanPorts();
  }

  function bindEsp() {
    document.getElementById('esp-connect-btn').addEventListener('click', toggleConnect);
    document.getElementById('esp-scan-btn').addEventListener('click', _scanPorts);
    document.getElementById('esp-clear-btn').addEventListener('click', ()=>{ document.getElementById('esp-serial-output').innerHTML=''; updateLineCount(); });
    document.getElementById('esp-flash-btn').addEventListener('click', ()=>runPio('flash'));
    document.getElementById('esp-build-btn').addEventListener('click', ()=>runPio('build'));
    document.getElementById('esp-clean-btn').addEventListener('click', ()=>runPio('clean'));

    const sendInput = document.getElementById('esp-serial-input');
    const sendBtn   = document.getElementById('esp-send-btn');
    async function sendSerial() {
      const val = sendInput.value;
      sendInput.value='';
      if (!val) return;
      if (writer) {
        await writer.write(new TextEncoder().encode(val+'\n'));
        serialLine(`TX: ${val}`, 'sys');
      } else { Terminal.warn('not connected'); }
    }
    sendInput.addEventListener('keydown', e=>{ if (e.key==='Enter') sendSerial(); });
    sendBtn.addEventListener('click', sendSerial);

    document.getElementById('esp-baud-select').addEventListener('change', e=>{
      MADGOD.state.esp.baud=parseInt(e.target.value);
      Terminal.info(`baud → ${e.target.value}`);
    });
  }

  async function _scanPorts() {
    const sel = document.getElementById('esp-port-select');
    if (!sel) return;
    // sidecar port scan
    if (MADGOD.state.sidecar.online) {
      try {
        const r = await MADGOD.sidecarFetch('/serial/ports');
        sel.innerHTML = '<option value="">-- select --</option>';
        r.ports.forEach(p => {
          const opt = document.createElement('option');
          opt.value = p.device; opt.textContent = `${p.device} — ${p.description||''}`;
          sel.appendChild(opt);
        });
        if (r.ports.length === 0) sysLine('no serial ports detected');
        else sysLine(`found ${r.ports.length} port(s)`);
        return;
      } catch(e) { sysLine(`port scan via sidecar failed: ${e.message}`,'error'); }
    }
    // web serial fallback
    if ('serial' in navigator) {
      const ports = await navigator.serial.getPorts().catch(()=>[]);
      sel.innerHTML = '<option value="">-- select --</option>';
      ports.forEach((p,i)=>{
        const opt=document.createElement('option');
        opt.value=String(i); opt.textContent=`port ${i}`;
        sel.appendChild(opt);
      });
    }
  }

  async function toggleConnect() {
    if (MADGOD.state.esp.connected) await disconnect();
    else await connect();
  }

  async function connect(portDevice) {
    if (!('serial' in navigator)) {
      sysLine('Web Serial API not available','error');
      sysLine('launch Chromium with: chromium --app=http://localhost:8080','sys');
      return;
    }
    try {
      port = await navigator.serial.requestPort();
      await port.open({ baudRate: MADGOD.state.esp.baud });
      MADGOD.state.esp.connected=true;
      writer = port.writable.getWriter();

      const statusLabel = document.getElementById('esp-status-label');
      if (statusLabel) statusLabel.textContent='connected';
      document.getElementById('esp-connect-btn').textContent='[ DISCONNECT ]';
      document.getElementById('esp-status').style.display='flex';
      document.getElementById('esp-dot').classList.add('pulse');

      sysLine(`connected @ ${MADGOD.state.esp.baud} baud`);
      Terminal.success('ESP32 serial connected');

      // read loop
      readLoop=true;
      const ds = new TextDecoderStream();
      port.readable.pipeTo(ds.writable);
      const lr = ds.readable.getReader();
      let buf='';
      (async()=>{
        while(readLoop) {
          try {
            const { done, value } = await lr.read();
            if (done) break;
            buf+=value;
            const lines=buf.split('\n'); buf=lines.pop();
            lines.forEach(l=>serialLine(l.replace('\r','')));
          } catch(e) { sysLine(`read error: ${e.message}`,'error'); break; }
        }
      })();
    } catch(e) {
      sysLine(`connection failed: ${e.message}`,'error');
      Terminal.error(`esp32 connect: ${e.message}`);
    }
  }

  async function disconnect() {
    readLoop=false;
    try { if (writer) { await writer.close(); writer=null; } if (port) { await port.close(); port=null; } } catch(e){}
    MADGOD.state.esp.connected=false;
    const statusLabel = document.getElementById('esp-status-label');
    if (statusLabel) statusLabel.textContent='no device';
    const btn = document.getElementById('esp-connect-btn');
    if (btn) btn.textContent='[ CONNECT ]';
    document.getElementById('esp-dot')?.classList.remove('pulse');
    sysLine('disconnected');
    Terminal.info('ESP32 disconnected');
  }

  async function runPio(cmd) {
    if (_pioStreaming) { Terminal.warn('PIO command already running'); return; }
    if (!MADGOD.state.sidecar.online) {
      sysLine(`sidecar offline — run: python sidecar/main.py`,'error');
      Terminal.error('PlatformIO requires sidecar to be running');
      return;
    }
    const sel  = document.getElementById('esp-port-select');
    const prt  = sel?.value || null;
    const baud = MADGOD.state.esp.baud;

    sysLine(`pio ${cmd} starting...`,'sys');
    _pioStreaming=true;

    try {
      const res = await fetch(`${MADGOD.SIDECAR_URL}/pio/run`, {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({ command:cmd, port:prt, baud }),
      });
      const reader = res.body.getReader();
      const dec    = new TextDecoder();
      while(true) {
        const { done, value } = await reader.read();
        if (done) break;
        dec.decode(value).split('\n').forEach(l=>{ if (l.trim()) serialLine(l); });
      }
      sysLine(`pio ${cmd} complete`,'sys');
      Terminal.success(`pio ${cmd} done`);
    } catch(e) {
      sysLine(`pio error: ${e.message}`,'error');
      Terminal.error(`pio ${cmd}: ${e.message}`);
    }
    _pioStreaming=false;
  }

  function listPorts() { _scanPorts(); }
  function flash()     { runPio('flash'); }
  function pioLine(l)  { serialLine(l); }

  let _lineCount=0;
  function serialLine(text, type='data') {
    const el = document.getElementById('esp-serial-output');
    if (!el) return;
    const autoscroll   = document.getElementById('esp-autoscroll')?.checked;
    const showTs       = document.getElementById('esp-timestamps')?.checked;
    const showHex      = document.getElementById('esp-hex')?.checked;
    const d=new Date(), hh=String(d.getHours()).padStart(2,'0'), mm=String(d.getMinutes()).padStart(2,'0'), ss=String(d.getSeconds()).padStart(2,'0'), ms=String(d.getMilliseconds()).padStart(3,'0');
    const ts = `${hh}:${mm}:${ss}.${ms}`;
    const hexStr = showHex ? ' ' + Array.from(new TextEncoder().encode(text)).map(b=>b.toString(16).padStart(2,'0')).join(' ') : '';
    const line=document.createElement('div');
    line.className=`serial-line ${type==='error'?'error':type==='sys'?'sys':''}`;
    line.innerHTML=`${showTs?`<span class="serial-ts">[${ts}]</span>`:''}<span class="serial-data">${text.replace(/</g,'&lt;')}${hexStr}</span>`;
    el.appendChild(line);
    _lineCount++;
    if (el.children.length>3000) el.removeChild(el.firstChild);
    if (autoscroll) el.scrollTop=el.scrollHeight;
    updateLineCount();
  }
  function sysLine(t,type='sys') { serialLine(t,type); }
  function updateLineCount() {
    const el=document.getElementById('esp-line-count');
    if (el) el.textContent=`${_lineCount} lines`;
  }

  function onActivate() { render(); Terminal.sys('ESP32_CTRL online'); }

  function getActions() {
    return [
      { label:'[ CONNECT ]',  fn: connect },
      { label:'[ FLASH ]',    fn: ()=>runPio('flash') },
      { label:'[ BUILD ]',    fn: ()=>runPio('build') },
      { label:'[ CLEAR ]',    fn: ()=>{ const el=document.getElementById('esp-serial-output'); if(el) el.innerHTML=''; } },
    ];
  }

  return { onActivate, connect, disconnect, flash, listPorts, pioLine, getActions };
})());

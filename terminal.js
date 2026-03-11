// ============================================================
// MADGOD — terminal engine  (full build)
// persistent command interface with history + autocomplete
// ============================================================

const Terminal = (() => {
  let output, input, wrapper;
  const MAX_LINES = 800;
  const ALL_COMMANDS = [
    'open','graph','chat','note','code','visual','esp32',
    'context','vault','sidecar','set','config','status','reload','clear','help',
  ];
  const SUBCOMMANDS = {
    open:    ['graph','chat','note','code','esp32','context','visual'],
    chat:    ['claude','ollama','openrouter'],
    esp32:   ['monitor','flash','ports','baud','disconnect'],
    context: ['add','remove','clear','list'],
    vault:   ['set','reload','stats','search'],
    sidecar: ['status','connect','pio'],
    set:     ['claude.key','openrouter.key','provider','ollama.model'],
    visual:  ['particles','alife','field','wave'],
  };

  function ts() {
    const d = new Date();
    return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}`;
  }

  function appendLine(msg, type='info') {
    const line = document.createElement('div');
    line.className = `term-line ${type}`;
    line.innerHTML = `<span class="ts">[${ts()}]</span><span class="msg">${msg}</span>`;
    output.appendChild(line);
    while (output.children.length > MAX_LINES) output.removeChild(output.firstChild);
    output.scrollTop = output.scrollHeight;
  }

  // ── AUTOCOMPLETE ─────────────────────────────────────────
  let acSuggestions = [], acIdx = -1;

  function computeSuggestions(val) {
    const parts = val.trimStart().split(/\s+/);
    if (parts.length === 1) {
      // completing the command name
      return ALL_COMMANDS.filter(c => c.startsWith(parts[0].toLowerCase()));
    }
    if (parts.length === 2) {
      const cmd = parts[0].toLowerCase();
      const subs = SUBCOMMANDS[cmd] || [];
      const prefix = parts[1].toLowerCase();
      // also suggest note titles for 'note' and 'vault search'
      const extras = [];
      if (cmd === 'note' || cmd === 'code') {
        MADGOD.state.notes.slice(0,20).forEach(n => {
          if (n.title && n.title.toLowerCase().startsWith(prefix)) extras.push(`"${n.title}"`);
        });
      }
      return [...subs.filter(s => s.startsWith(prefix)), ...extras];
    }
    return [];
  }

  function renderInlineSuggestion(val) {
    const sugs = computeSuggestions(val);
    acSuggestions = sugs;
    acIdx = -1;

    const existing = document.getElementById('term-autocomplete');
    if (existing) existing.remove();

    if (!sugs.length || !val.trim()) return;

    const parts = val.trimStart().split(/\s+/);
    const lastPart = parts[parts.length-1].toLowerCase();
    const topMatch = sugs[0];

    if (!topMatch || !topMatch.toLowerCase().startsWith(lastPart)) return;
    if (topMatch.toLowerCase() === lastPart) return;

    const ghost = document.createElement('span');
    ghost.id = 'term-autocomplete';
    ghost.textContent = topMatch.slice(lastPart.length);
    ghost.style.cssText = 'color:var(--text-dim);pointer-events:none;user-select:none;';
    document.getElementById('terminal-input-row').appendChild(ghost);
  }

  // ── INPUT HANDLING ────────────────────────────────────────
  function handleInput(raw) {
    const cmd = raw.trim();
    if (!cmd) return;
    const hist = MADGOD.state.terminal.history;
    if (hist[hist.length-1] !== cmd) hist.push(cmd);
    MADGOD.state.terminal.historyIdx = -1;
    appendLine(`madgod&gt; ${cmd}`, 'cmd');
    const g = document.getElementById('term-autocomplete');
    if (g) g.remove();
    Commands.dispatch(cmd);
  }

  function init() {
    output  = document.getElementById('terminal-output');
    input   = document.getElementById('terminal-input');
    wrapper = document.getElementById('terminal-wrapper');

    input.addEventListener('input', () => renderInlineSuggestion(input.value));

    input.addEventListener('keydown', e => {
      const hist = MADGOD.state.terminal.history;

      if (e.key === 'Enter') {
        const val = input.value;
        input.value = '';
        handleInput(val);
        return;
      }

      // Tab autocomplete
      if (e.key === 'Tab') {
        e.preventDefault();
        const sugs = computeSuggestions(input.value);
        if (!sugs.length) return;
        const parts = input.value.trimStart().split(/\s+/);
        parts[parts.length-1] = sugs[acIdx < 0 ? 0 : (acIdx+1) % sugs.length];
        acIdx = acIdx < 0 ? 0 : (acIdx+1) % sugs.length;
        input.value = parts.join(' ');
        renderInlineSuggestion(input.value);
        return;
      }

      if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (!hist.length) return;
        const idx = MADGOD.state.terminal.historyIdx;
        const next = idx < 0 ? hist.length-1 : Math.max(0, idx-1);
        MADGOD.state.terminal.historyIdx = next;
        input.value = hist[next] || '';
        renderInlineSuggestion(input.value);
        return;
      }

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const idx = MADGOD.state.terminal.historyIdx;
        if (idx < 0) return;
        const next = idx >= hist.length-1 ? -1 : idx+1;
        MADGOD.state.terminal.historyIdx = next;
        input.value = next < 0 ? '' : (hist[next] || '');
        renderInlineSuggestion(input.value);
        return;
      }

      if (e.key === 'Escape') {
        input.value = '';
        const g = document.getElementById('term-autocomplete');
        if (g) g.remove();
        return;
      }
    });

    document.getElementById('term-clear').addEventListener('click', () => {
      output.innerHTML = '';
      Terminal.sys('terminal cleared');
    });

    const toggleBtn = document.getElementById('term-toggle');
    toggleBtn.addEventListener('click', () => {
      const c = MADGOD.state.terminal.collapsed = !MADGOD.state.terminal.collapsed;
      wrapper.classList.toggle('collapsed', c);
      toggleBtn.textContent = c ? '[ ▲ ]' : '[ ▼ ]';
    });

    // resize handle
    const resizer = document.getElementById('terminal-resizer');
    let dragging=false, startY=0, startH=0;
    resizer.addEventListener('mousedown', e => {
      dragging=true; startY=e.clientY; startH=wrapper.getBoundingClientRect().height;
      document.body.style.userSelect='none';
    });
    document.addEventListener('mousemove', e => {
      if (!dragging) return;
      const newH = Math.min(650, Math.max(60, startH+(startY-e.clientY)));
      wrapper.style.height=newH+'px';
      MADGOD.state.terminalH=newH;
      document.getElementById('app').style.bottom=`calc(${newH}px + var(--statusbar-h))`;
    });
    document.addEventListener('mouseup', () => { dragging=false; document.body.style.userSelect=''; });

    // global: any printable key focuses terminal unless in an input/textarea
    document.addEventListener('keydown', e => {
      const tag = document.activeElement.tagName;
      if (tag==='INPUT'||tag==='TEXTAREA') return;
      if (e.key.length===1 && !e.ctrlKey && !e.metaKey && !e.altKey) input.focus();
    });

    // welcome
    const lines = [
      { m:'┌──────────────────────────────────────────────────────┐', t:'sys' },
      { m:`│  MADGOD v${MADGOD.version} — workspace operating environment      │`, t:'sys' },
      { m:'│  type help for commands │ Tab to autocomplete         │', t:'sys' },
      { m:'└──────────────────────────────────────────────────────┘', t:'sys' },
    ];
    lines.forEach((l,i) => setTimeout(()=>appendLine(l.m,l.t), i*55));
  }

  return {
    init,
    print:   m => appendLine(m,'info'),
    info:    m => appendLine(m,'info'),
    success: m => appendLine(m,'success'),
    warn:    m => appendLine(m,'warn'),
    error:   m => appendLine(m,'err'),
    sys:     m => appendLine(m,'sys'),
    focus:   ()=> input && input.focus(),
  };
})();

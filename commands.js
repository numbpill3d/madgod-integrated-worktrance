// ============================================================
// MADGOD — command dispatch
// adding a command = one entry in COMMAND_MAP
// ============================================================

const Commands = (() => {

  // ── helpers ──────────────────────────────────────────────
  function requireArg(args, n, usage) {
    if (args.length < n) {
      Terminal.error(`missing argument. usage: ${usage}`);
      return false;
    }
    return true;
  }

  // ── command table ─────────────────────────────────────────
  // each entry: { desc, usage, fn(args) }
  const COMMAND_MAP = {

    // ── NAVIGATION ──────────────────────────────────────────
    open: {
      desc: 'open a module in the viewport',
      usage: 'open <module>',
      fn(args) {
        if (!requireArg(args, 1, 'open <module>')) return;
        const mod = args[0].toLowerCase();
        const aliases = { graph: 'graph', chat: 'chat', note: 'note', code: 'code', esp: 'esp32', esp32: 'esp32', context: 'context', ctx: 'context', visual: 'visual', lab: 'visual' };
        const resolved = aliases[mod];
        if (!resolved) { Terminal.error(`unknown module: ${mod}. try: graph chat note code esp32 context visual`); return; }
        Router.navigate(resolved);
        Terminal.success(`opened ${resolved}`);
      }
    },

    graph: {
      desc: 'open the MAGI_GRAPH module',
      usage: 'graph',
      fn() { Router.navigate('graph'); Terminal.success('opened MAGI_GRAPH'); }
    },

    chat: {
      desc: 'open SOMA_CHAT, optionally set provider',
      usage: 'chat [claude|ollama|openrouter] [model]',
      fn(args) {
        Router.navigate('chat');
        if (args[0]) {
          const p = args[0].toLowerCase();
          if (!['claude','ollama','openrouter'].includes(p)) {
            Terminal.error(`unknown provider: ${p}`);
            return;
          }
          MADGOD.state.provider = p;
          localStorage.setItem('mg_provider', p);
          if (p === 'ollama' && args[1]) MADGOD.state.ollamaModel = args[1];
          if (MADGOD.modules.chat && MADGOD.modules.chat.setProvider) {
            MADGOD.modules.chat.setProvider(p, args[1]);
          }
          Terminal.success(`provider set to ${p}${args[1] ? ' / ' + args[1] : ''}`);
        } else {
          Terminal.success(`opened SOMA_CHAT (provider: ${MADGOD.state.provider})`);
        }
      }
    },

    note: {
      desc: 'open or create a note in LEXICON',
      usage: 'note [filename]',
      fn(args) {
        Router.navigate('note');
        if (args[0] && MADGOD.modules.note && MADGOD.modules.note.openFile) {
          MADGOD.modules.note.openFile(args[0]);
        }
        Terminal.success(`opened LEXICON${args[0] ? ': ' + args[0] : ''}`);
      }
    },

    code: {
      desc: 'open CORTEX_CODE editor',
      usage: 'code [file]',
      fn(args) {
        Router.navigate('code');
        if (args[0] && MADGOD.modules.code && MADGOD.modules.code.openFile) {
          MADGOD.modules.code.openFile(args[0]);
        }
        Terminal.success(`opened CORTEX_CODE${args[0] ? ': ' + args[0] : ''}`);
      }
    },

    visual: {
      desc: 'open VISUAL_LAB generative canvas',
      usage: 'visual [particles|alife|field|fractal]',
      fn(args) {
        Router.navigate('visual');
        if (args[0] && MADGOD.modules.visual && MADGOD.modules.visual.setMode) {
          MADGOD.modules.visual.setMode(args[0]);
        }
        Terminal.success(`opened VISUAL_LAB${args[0] ? ': ' + args[0] : ''}`);
      }
    },

    // ── ESP32 ───────────────────────────────────────────────
    esp32: {
      desc: 'ESP32 control: monitor, flash, ports',
      usage: 'esp32 <monitor|flash|ports|baud> [args]',
      fn(args) {
        if (!args[0]) { Router.navigate('esp32'); Terminal.success('opened ESP32_CTRL'); return; }
        const sub = args[0].toLowerCase();
        switch (sub) {
          case 'monitor':
            Router.navigate('esp32');
            if (MADGOD.modules.esp32 && MADGOD.modules.esp32.connect) {
              MADGOD.modules.esp32.connect(args[1] || null);
            }
            break;
          case 'flash':
            Router.navigate('esp32');
            if (MADGOD.modules.esp32 && MADGOD.modules.esp32.flash) {
              Terminal.info('initiating flash sequence...');
              MADGOD.modules.esp32.flash();
            }
            break;
          case 'ports':
            Router.navigate('esp32');
            if (MADGOD.modules.esp32 && MADGOD.modules.esp32.listPorts) {
              MADGOD.modules.esp32.listPorts();
            }
            break;
          case 'baud':
            if (!args[1]) { Terminal.error('usage: esp32 baud <rate>'); return; }
            MADGOD.state.esp.baud = parseInt(args[1]);
            Terminal.success(`baud rate set to ${args[1]}`);
            break;
          case 'disconnect':
            if (MADGOD.modules.esp32 && MADGOD.modules.esp32.disconnect) {
              MADGOD.modules.esp32.disconnect();
            }
            break;
          default:
            Terminal.error(`unknown esp32 subcommand: ${sub}. try: monitor flash ports baud`);
        }
      }
    },

    // ── AI / CONTEXT ─────────────────────────────────────────
    context: {
      desc: 'manage AI context injection',
      usage: 'context <add|remove|clear|list> [filename]',
      fn(args) {
        if (!args[0]) { Router.navigate('context'); Terminal.success('opened CTX_INJECT'); return; }
        const sub = args[0].toLowerCase();
        switch (sub) {
          case 'add':
            if (!requireArg(args, 2, 'context add <filename>')) return;
            if (MADGOD.modules.context && MADGOD.modules.context.addFile) {
              MADGOD.modules.context.addFile(args[1]);
            }
            break;
          case 'remove':
            if (!requireArg(args, 2, 'context remove <filename>')) return;
            if (MADGOD.modules.context && MADGOD.modules.context.removeFile) {
              MADGOD.modules.context.removeFile(args[1]);
            }
            break;
          case 'clear':
            MADGOD.state.context = [];
            MADGOD.state.contextTokens = 0;
            Terminal.success('context cleared');
            if (MADGOD.modules.context && MADGOD.modules.context.render) {
              MADGOD.modules.context.render();
            }
            break;
          case 'list':
            if (MADGOD.state.context.length === 0) {
              Terminal.info('context is empty');
            } else {
              MADGOD.state.context.forEach((f, i) => {
                Terminal.print(`  [${i}] ${f.name} — ${f.tokens || '?'} tokens`);
              });
            }
            break;
          default:
            Terminal.error(`unknown subcommand: ${sub}`);
        }
      }
    },

    // ── VAULT ────────────────────────────────────────────────
    vault: {
      desc: 'obsidian vault operations',
      usage: 'vault <set|reload|stats|search> [arg]',
      fn(args) {
        if (!args[0]) { Terminal.info(`vault: ${MADGOD.state.vaultPath}`); return; }
        const sub = args[0].toLowerCase();
        switch (sub) {
          case 'set':
            if (!requireArg(args, 2, 'vault set <path>')) return;
            MADGOD.saveVaultPath(args[1]);
            const vp = document.getElementById('vault-path');
            if (vp) vp.textContent = args[1];
            Terminal.success(`vault path → ${args[1]}`);
            Terminal.info('run "vault reload" to rebuild graph');
            break;
          case 'reload':
            Terminal.info('reloading vault...');
            if (MADGOD.modules.graph && MADGOD.modules.graph.loadVault) {
              MADGOD.modules.graph.loadVault();
            }
            break;
          case 'stats':
            if (MADGOD.state.sidecar.online) {
              MADGOD.sidecarFetch('/vault/stats').then(s => {
                Terminal.sys('── VAULT STATS ─────────────────────');
                Terminal.info(`path:       ${s.vault}`);
                Terminal.info(`notes:      ${s.notes}`);
                Terminal.info(`wiki edges: ${s.wiki_edges}`);
                Terminal.info(`sem edges:  ${s.sem_edges}`);
                Terminal.sys('────────────────────────────────────');
              }).catch(e => Terminal.error(e.message));
            } else {
              Terminal.info(`vault: ${MADGOD.state.vaultPath}`);
              Terminal.info(`notes: ${MADGOD.state.notes.length}`);
              Terminal.info(`sidecar offline — stats limited`);
            }
            break;
          case 'search': {
            const q = args.slice(1).join(' ');
            if (!q) { Terminal.error('usage: vault search <query>'); return; }
            if (!MADGOD.state.sidecar.online) { Terminal.error('sidecar offline — vault search requires sidecar'); return; }
            Terminal.info(`searching vault for: "${q}"`);
            MADGOD.sidecarFetch(`/vault/search?q=${encodeURIComponent(q)}`).then(r => {
              if (!r.results.length) { Terminal.warn('no results'); return; }
              Terminal.sys(`── ${r.results.length} results ──`);
              r.results.slice(0,8).forEach(res => {
                Terminal.print(`  <span style="color:var(--text)">${res.title}</span> <span style="color:var(--text-dim)">(score:${res.score})</span>`);
                if (res.excerpt) Terminal.sys(`    ${res.excerpt.slice(0,80).replace(/</g,'&lt;')}…`);
              });
            }).catch(e => Terminal.error(e.message));
            break;
          }
          default:
            Terminal.error(`unknown vault subcommand: ${sub}. try: set reload stats search`);
        }
      }
    },

    sidecar: {
      desc: 'sidecar management',
      usage: 'sidecar <status|connect|pio>',
      fn(args) {
        const sub = (args[0]||'status').toLowerCase();
        switch(sub) {
          case 'status':
            Terminal.sys('── SIDECAR ──────────────────────────');
            Terminal.info(`online:     ${MADGOD.state.sidecar.online}`);
            Terminal.info(`url:        ${MADGOD.SIDECAR_URL}`);
            Terminal.info(`embeddings: ${MADGOD.state.sidecar.embeddings}`);
            Terminal.info(`ws:         ${MADGOD.state.sidecar.ws ? 'connected' : 'disconnected'}`);
            Terminal.sys('────────────────────────────────────');
            break;
          case 'connect':
            Terminal.info('connecting to sidecar...');
            MADGOD.connectSidecar();
            break;
          case 'pio':
            MADGOD.sidecarFetch('/pio/which').then(r => {
              Terminal.info(`platformio: ${r.available ? r.version : 'NOT FOUND'}`);
              if (!r.available) Terminal.warn('install: pip install platformio or curl -fsSL https://raw.githubusercontent.com/platformio/platformio-core-installer/master/get-platformio.py | python3');
            }).catch(() => Terminal.error('sidecar offline'));
            break;
          default:
            Terminal.error('usage: sidecar <status|connect|pio>');
        }
      }
    },

    // ── CONFIG ───────────────────────────────────────────────
    set: {
      desc: 'set a configuration value',
      usage: 'set <key> <value>',
      fn(args) {
        if (!requireArg(args, 2, 'set <key> <value>')) return;
        const key = args[0].toLowerCase();
        const val = args.slice(1).join(' ');
        switch (key) {
          case 'claude.key':
          case 'claude_key':
            MADGOD.saveKey('claude', val);
            Terminal.success('claude api key saved');
            break;
          case 'openrouter.key':
          case 'or_key':
            MADGOD.saveKey('openrouter', val);
            Terminal.success('openrouter api key saved');
            break;
          case 'provider':
            MADGOD.state.provider = val;
            localStorage.setItem('mg_provider', val);
            Terminal.success(`provider set to ${val}`);
            break;
          case 'ollama.model':
          case 'ollama_model':
            MADGOD.state.ollamaModel = val;
            Terminal.success(`ollama model set to ${val}`);
            break;
          default:
            Terminal.error(`unknown config key: ${key}`);
            Terminal.warn('available keys: claude.key  openrouter.key  provider  ollama.model');
        }
      }
    },

    config: {
      desc: 'open configuration modal',
      usage: 'config',
      fn() { Modal.open('settings'); }
    },

    // ── SYSTEM ───────────────────────────────────────────────
    clear: {
      desc: 'clear terminal output',
      usage: 'clear',
      fn() { document.getElementById('terminal-output').innerHTML = ''; }
    },

    status: {
      desc: 'show system status',
      usage: 'status',
      fn() {
        const s = MADGOD.state;
        Terminal.sys('── SYSTEM STATUS ──────────────────────────');
        Terminal.info(`module:    ${s.activeModule}`);
        Terminal.info(`provider:  ${s.provider}${s.provider === 'ollama' ? ' / ' + s.ollamaModel : ''}`);
        Terminal.info(`vault:     ${s.vaultPath} (${s.vaultLoaded ? 'loaded' : 'not loaded'})`);
        Terminal.info(`notes:     ${s.notes.length}`);
        Terminal.info(`ctx files: ${s.context.length} (${s.contextTokens} tokens)`);
        Terminal.info(`esp32:     ${s.esp.connected ? s.esp.port + ' @ ' + s.esp.baud : 'disconnected'}`);
        Terminal.sys('───────────────────────────────────────────');
      }
    },

    reload: {
      desc: 'reload current module',
      usage: 'reload',
      fn() {
        const mod = MADGOD.state.activeModule;
        if (MADGOD.modules[mod] && MADGOD.modules[mod].onActivate) {
          MADGOD.modules[mod].onActivate();
          Terminal.success(`reloaded ${mod}`);
        }
      }
    },

    help: {
      desc: 'show this help',
      usage: 'help [command]',
      fn(args) {
        if (args[0] && COMMAND_MAP[args[0]]) {
          const c = COMMAND_MAP[args[0]];
          Terminal.sys(`── ${args[0]} ──`);
          Terminal.info(c.desc);
          Terminal.info(`usage: ${c.usage}`);
          return;
        }

        const sections = [
          { label: 'NAVIGATION', cmds: ['open','graph','chat','note','code','visual'] },
          { label: 'ESP32', cmds: ['esp32'] },
          { label: 'AI / CONTEXT', cmds: ['context','set'] },
          { label: 'VAULT', cmds: ['vault'] },
          { label: 'SYSTEM', cmds: ['status','reload','config','clear','help'] },
        ];

        Terminal.sys('── MADGOD COMMAND REFERENCE ────────────────────────────');
        sections.forEach(sec => {
          Terminal.sys(`  ${sec.label}`);
          sec.cmds.forEach(name => {
            const c = COMMAND_MAP[name];
            if (c) Terminal.print(`    <span style="color:var(--text)">${(name + '            ').slice(0,14)}</span>${c.desc}`);
          });
        });
        Terminal.sys('────────────────────────────────────────────────────────');
        Terminal.info('type <span style="color:var(--text)">help &lt;command&gt;</span> for usage details');
      }
    },
  };

  // ── dispatch ──────────────────────────────────────────────
  function dispatch(raw) {
    const parts = raw.trim().split(/\s+/);
    const name  = parts[0].toLowerCase();
    const args  = parts.slice(1);

    if (COMMAND_MAP[name]) {
      try {
        COMMAND_MAP[name].fn(args);
      } catch(e) {
        Terminal.error(`command error: ${e.message}`);
        console.error(e);
      }
    } else {
      Terminal.error(`unknown command: ${name}  (type 'help' for commands)`);
    }
  }

  return { dispatch, COMMAND_MAP };
})();

// ── MODAL system (settings, etc.) ────────────────────────────
const Modal = (() => {
  function open(type) {
    const overlay = document.getElementById('modal-overlay');
    const box     = document.getElementById('modal-box');

    if (type === 'settings') {
      box.innerHTML = `
        <div class="modal-title">// CONFIGURATION</div>
        <div class="modal-field">
          <label>ANTHROPIC API KEY</label>
          <input type="password" id="cfg-claude-key" placeholder="sk-ant-..." value="${MADGOD.state.apiKeys.claude}">
        </div>
        <div class="modal-field">
          <label>OPENROUTER API KEY</label>
          <input type="password" id="cfg-or-key" placeholder="sk-or-..." value="${MADGOD.state.apiKeys.openrouter}">
        </div>
        <div class="modal-field">
          <label>OBSIDIAN VAULT PATH</label>
          <input type="text" id="cfg-vault" placeholder="/home/user/obsidian" value="${MADGOD.state.vaultPath}">
        </div>
        <div class="modal-field">
          <label>DEFAULT PROVIDER</label>
          <select id="cfg-provider">
            <option value="claude" ${MADGOD.state.provider==='claude'?'selected':''}>claude</option>
            <option value="ollama" ${MADGOD.state.provider==='ollama'?'selected':''}>ollama</option>
            <option value="openrouter" ${MADGOD.state.provider==='openrouter'?'selected':''}>openrouter</option>
          </select>
        </div>
        <div class="modal-field">
          <label>OLLAMA MODEL</label>
          <input type="text" id="cfg-ollama" placeholder="llama3" value="${MADGOD.state.ollamaModel}">
        </div>
        <div class="modal-actions">
          <button class="modal-btn" onclick="Modal.close()">[ CANCEL ]</button>
          <button class="modal-btn primary" onclick="Modal.save()">[ SAVE ]</button>
        </div>`;
    }

    overlay.classList.add('visible');
    overlay.addEventListener('click', e => { if (e.target === overlay) Modal.close(); }, { once: true });
  }

  function close() {
    document.getElementById('modal-overlay').classList.remove('visible');
  }

  function save() {
    const claudeKey = document.getElementById('cfg-claude-key')?.value;
    const orKey     = document.getElementById('cfg-or-key')?.value;
    const vault     = document.getElementById('cfg-vault')?.value;
    const provider  = document.getElementById('cfg-provider')?.value;
    const ollama    = document.getElementById('cfg-ollama')?.value;

    if (claudeKey) MADGOD.saveKey('claude', claudeKey);
    if (orKey)     MADGOD.saveKey('openrouter', orKey);
    if (vault)     MADGOD.saveVaultPath(vault);
    if (provider)  { MADGOD.state.provider = provider; localStorage.setItem('mg_provider', provider); }
    if (ollama)    MADGOD.state.ollamaModel = ollama;

    close();
    Terminal.success('configuration saved');
  }

  return { open, close, save };
})();

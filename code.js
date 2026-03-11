// ============================================================
// MADGOD — CORTEX_CODE  (full build)
// code editor with sidecar file read, AI context, send-to-chat
// ============================================================

MADGOD.registerModule('code', (() => {
  let currentLang = 'python';
  let currentPath = null;
  let saveDebounce = null;

  const LANG_EXT = { python:'py', cpp:'cpp', rust:'rs', js:'js', bash:'sh', c:'c', html:'html', css:'css', json:'json', yaml:'yaml' };

  function render() {
    const el = document.getElementById('module-code');
    el.innerHTML = `
      <div id="code-main">
        <div id="code-topbar" style="display:flex;align-items:center;gap:8px;padding:6px 10px;border-bottom:1px solid var(--border);background:var(--bg-panel);flex-shrink:0">
          <span style="font-size:10px;color:var(--text-dim);letter-spacing:.1em;flex-shrink:0">FILE</span>
          <input type="text" id="code-filename" placeholder="untitled.py" style="flex:1;background:none;border:none;color:var(--text);font-family:var(--font-mono);font-size:12px">
          <button class="icon-btn" id="code-open-btn">[ OPEN ]</button>
          <button class="icon-btn" id="code-save-btn">[ SAVE ]</button>
          <button class="icon-btn" id="code-to-chat">[ → CHAT ]</button>
          <button class="icon-btn" id="code-to-ctx">[ + CTX ]</button>
        </div>
        <textarea id="code-editor-area" spellcheck="false" placeholder="# code here..."></textarea>
        <div id="code-statusline">
          <select id="code-lang-select" style="background:none;border:none;color:var(--text-muted);font-family:var(--font-mono);font-size:11px;cursor:pointer;padding:0">
            ${Object.keys(LANG_EXT).map(l=>`<option value="${l}" ${l===currentLang?'selected':''}>${l}</option>`).join('')}
          </select>
          <span style="color:var(--border)">│</span>
          <span id="code-line-col">LN 1 COL 1</span>
          <span style="color:var(--border)">│</span>
          <span id="code-char-count">0 chars</span>
          <span id="code-save-status" style="margin-left:auto;color:var(--text-dim)"></span>
        </div>
      </div>
      <div id="code-ctx-panel">
        <div class="ctx-panel-header">
          CONTEXT
          <span style="font-size:10px;color:var(--text-dim);font-weight:normal;margin-left:6px">${MADGOD.state.context.length} files</span>
        </div>
        <div id="ctx-file-list"></div>
        <div style="padding:8px 10px;border-top:1px solid var(--border)">
          <button class="icon-btn" style="width:100%;font-size:11px;letter-spacing:.06em" id="code-add-ctx">[ + ADD FILE ]</button>
        </div>
        <div style="padding:4px 10px 8px;border-top:1px solid var(--border)">
          <div style="font-size:10px;color:var(--text-dim);margin-bottom:6px;letter-spacing:.1em">QUICK PROMPT</div>
          <button class="icon-btn" style="width:100%;margin-bottom:4px;font-size:11px" id="code-ask-explain">[ EXPLAIN ]</button>
          <button class="icon-btn" style="width:100%;margin-bottom:4px;font-size:11px" id="code-ask-fix">[ FIX BUGS ]</button>
          <button class="icon-btn" style="width:100%;font-size:11px" id="code-ask-review">[ REVIEW ]</button>
        </div>
      </div>`;

    bindCode();
    renderCtxFiles();
  }

  function bindCode() {
    const editor = document.getElementById('code-editor-area');

    editor.addEventListener('keydown', e => {
      if (e.key === 'Tab') {
        e.preventDefault();
        const s=editor.selectionStart, end=editor.selectionEnd;
        editor.value=editor.value.slice(0,s)+'  '+editor.value.slice(end);
        editor.selectionStart=editor.selectionEnd=s+2;
      }
      if ((e.ctrlKey||e.metaKey) && e.key==='s') { e.preventDefault(); saveFile(); }
      // auto-indent on enter
      if (e.key==='Enter') {
        e.preventDefault();
        const before=editor.value.slice(0,editor.selectionStart);
        const lastLine=before.split('\n').pop();
        const indent=lastLine.match(/^(\s*)/)[1];
        const extra=lastLine.trimEnd().endsWith(':') || lastLine.trimEnd().endsWith('{') ? '  ' : '';
        const ins='\n'+indent+extra;
        const s=editor.selectionStart;
        editor.value=editor.value.slice(0,s)+ins+editor.value.slice(editor.selectionEnd);
        editor.selectionStart=editor.selectionEnd=s+ins.length;
      }
    });

    editor.addEventListener('input', () => { updateStatusLine(); scheduleAutoSave(); });
    editor.addEventListener('keyup', updateStatusLine);
    editor.addEventListener('click', updateStatusLine);

    document.getElementById('code-lang-select').addEventListener('change', e => {
      currentLang=e.target.value;
      const fn=document.getElementById('code-filename');
      if (fn && fn.value && !fn.value.includes('.')) fn.value=fn.value+'.'+LANG_EXT[currentLang];
    });

    document.getElementById('code-open-btn').addEventListener('click', openFilePicker);
    document.getElementById('code-save-btn').addEventListener('click', saveFile);

    document.getElementById('code-to-chat').addEventListener('click', () => {
      const code=editor.value.trim();
      if (!code) { Terminal.warn('editor is empty'); return; }
      Router.navigate('chat');
      setTimeout(() => {
        const ci=document.getElementById('chat-input');
        if (ci) ci.value='```'+currentLang+'\n'+code+'\n```\n';
        ci?.focus();
      }, 120);
      Terminal.info('code sent to SOMA_CHAT');
    });

    document.getElementById('code-to-ctx').addEventListener('click', () => {
      const code=editor.value.trim();
      if (!code) { Terminal.warn('editor is empty'); return; }
      const fn=document.getElementById('code-filename')?.value || 'snippet.'+LANG_EXT[currentLang];
      MADGOD.state.context.push({ name:fn, content:code, tokens:Math.ceil(code.length/4), source:'editor' });
      MADGOD.state.contextTokens=MADGOD.state.context.reduce((a,f)=>a+(f.tokens||0),0);
      Terminal.success(`added to context: ${fn}`);
      renderCtxFiles();
    });

    document.getElementById('code-add-ctx').addEventListener('click', () => {
      Router.navigate('context');
      Terminal.info('drop files on CTX_INJECT or load by path');
    });

    // quick prompts
    document.getElementById('code-ask-explain').addEventListener('click', () => sendQuickPrompt('Explain this code clearly and concisely:'));
    document.getElementById('code-ask-fix').addEventListener('click',    () => sendQuickPrompt('Find and fix any bugs in this code. Show the corrected version:'));
    document.getElementById('code-ask-review').addEventListener('click', () => sendQuickPrompt('Code review this. Note style, correctness, performance, and security issues:'));
  }

  function sendQuickPrompt(prefix) {
    const code=document.getElementById('code-editor-area')?.value.trim();
    if (!code) { Terminal.warn('editor is empty'); return; }
    Router.navigate('chat');
    setTimeout(() => {
      const ci=document.getElementById('chat-input');
      if (ci) { ci.value=`${prefix}\n\n\`\`\`${currentLang}\n${code}\n\`\`\``; }
    }, 120);
  }

  function openFilePicker() {
    if (MADGOD.state.sidecar.online) {
      showFileBrowser();
    } else {
      const input=document.createElement('input');
      input.type='file'; input.accept='.py,.js,.cpp,.c,.rs,.ts,.html,.css,.json,.yaml,.toml,.md,.txt,.sh';
      input.onchange=e => {
        const file=e.target.files[0]; if (!file) return;
        const reader=new FileReader();
        reader.onload=ev => {
          document.getElementById('code-editor-area').value=ev.target.result;
          document.getElementById('code-filename').value=file.name;
          currentPath=null;
          updateStatusLine();
          Terminal.success(`opened: ${file.name}`);
        };
        reader.readAsText(file);
      };
      input.click();
    }
  }

  function showFileBrowser() {
    Terminal.info('loading vault file list...');
    MADGOD.sidecarFetch(`/file/list?path=${encodeURIComponent(MADGOD.state.vaultPath)}`).then(r => {
      const codeFiles=r.files.filter(f=>/\.(py|js|cpp|c|rs|ts|html|css|json|yaml|toml|sh|bash)$/.test(f.name));
      if (!codeFiles.length) { Terminal.warn('no code files found in vault'); return; }
      Terminal.sys('── CODE FILES (click to open) ──────────');
      codeFiles.slice(0,15).forEach(f => {
        const line=document.createElement('div');
        line.className='term-line info';
        line.innerHTML=`<span class="ts"></span><span class="msg" style="cursor:pointer;color:var(--text)" data-path="${f.path}">  >> ${f.name}</span>`;
        line.querySelector('.msg').addEventListener('click', () => openFile(f.name, f.path));
        document.getElementById('terminal-output').appendChild(line);
      });
      Terminal.sys('─────────────────────────────────────────');
    }).catch(e=>Terminal.error(e.message));
  }

  async function openFile(name, path) {
    if (!path || !MADGOD.state.sidecar.online) {
      const editor=document.getElementById('code-editor-area');
      if (editor) editor.value=`// ${name}\n// filesystem read requires sidecar\n`;
      document.getElementById('code-filename').value=name||'untitled';
      return;
    }
    try {
      const r=await MADGOD.sidecarFetch(`/file/read?path=${encodeURIComponent(path)}`);
      document.getElementById('code-editor-area').value=r.content;
      document.getElementById('code-filename').value=name||path.split('/').pop();
      currentPath=path;
      // detect lang from extension
      const ext=path.split('.').pop().toLowerCase();
      const langMap={py:'python',js:'js',cpp:'cpp',c:'c',rs:'rust',sh:'bash',bash:'bash',ts:'js',html:'html',css:'css',json:'json',yaml:'yaml'};
      if (langMap[ext]) {
        currentLang=langMap[ext];
        const sel=document.getElementById('code-lang-select'); if (sel) sel.value=currentLang;
      }
      updateStatusLine();
      Terminal.success(`opened: ${name}`);
    } catch(e) { Terminal.error(`open failed: ${e.message}`); }
  }

  async function saveFile() {
    const editor=document.getElementById('code-editor-area');
    const fn=document.getElementById('code-filename')?.value.trim() || 'untitled.'+LANG_EXT[currentLang];
    const content=editor?.value||'';
    const statusEl=document.getElementById('code-save-status');
    if (statusEl) statusEl.textContent='saving...';

    if (MADGOD.state.sidecar.online) {
      try {
        const path=currentPath||fn;
        await MADGOD.sidecarPost('/vault/note/write', { path, content });
        if (statusEl) statusEl.textContent=`saved ${new Date().toTimeString().slice(0,5)}`;
        Terminal.success(`saved: ${fn}`);
      } catch(e) {
        if (statusEl) statusEl.textContent='save failed';
        Terminal.error(`save: ${e.message}`);
      }
    } else {
      const blob=new Blob([content],{type:'text/plain'});
      const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=fn; a.click();
      if (statusEl) statusEl.textContent='downloaded';
      Terminal.success(`downloaded: ${fn}`);
    }
  }

  function scheduleAutoSave() {
    if (!currentPath || !MADGOD.state.sidecar.online) return;
    clearTimeout(saveDebounce);
    saveDebounce=setTimeout(saveFile, 4000);
  }

  function updateStatusLine() {
    const editor=document.getElementById('code-editor-area'); if (!editor) return;
    const text=editor.value.slice(0,editor.selectionStart);
    const ln=text.split('\n').length, col=text.split('\n').pop().length+1;
    const lc=document.getElementById('code-line-col'); if (lc) lc.textContent=`LN ${ln} COL ${col}`;
    const cc=document.getElementById('code-char-count'); if (cc) cc.textContent=`${editor.value.length} chars`;
  }

  function renderCtxFiles() {
    const list=document.getElementById('ctx-file-list'); if (!list) return;
    list.innerHTML='';
    if (!MADGOD.state.context.length) {
      list.innerHTML='<div style="padding:10px;color:var(--text-dim);font-size:11px">empty</div>';
      return;
    }
    MADGOD.state.context.forEach((f,i) => {
      const item=document.createElement('div'); item.className='ctx-file-item';
      item.innerHTML=`<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${f.name}</span><button class="ctx-file-remove" data-i="${i}">✕</button>`;
      item.querySelector('.ctx-file-remove').addEventListener('click', () => {
        MADGOD.state.context.splice(i,1);
        MADGOD.state.contextTokens=MADGOD.state.context.reduce((a,f)=>a+(f.tokens||0),0);
        renderCtxFiles(); Terminal.info(`removed: ${f.name}`);
      });
      list.appendChild(item);
    });
  }

  function onActivate() { render(); Terminal.sys('CORTEX_CODE online'); }

  function getActions() {
    return [
      { label:'[ OPEN ]',   fn: openFilePicker },
      { label:'[ SAVE ]',   fn: saveFile },
      { label:'[ → CHAT ]', fn: ()=>document.getElementById('code-to-chat')?.click() },
      { label:'[ + CTX ]',  fn: ()=>document.getElementById('code-to-ctx')?.click() },
    ];
  }

  return { onActivate, openFile, getActions };
})());

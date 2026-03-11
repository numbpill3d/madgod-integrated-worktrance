// ============================================================
// MADGOD — LEXICON  (full build)
// markdown editor with sidecar file read/write + wikilink autocomplete
// ============================================================

MADGOD.registerModule('note', (() => {
  let currentFile = null, currentPath = null, previewVisible = false;
  let saveDebounce = null;

  function render() {
    const el = document.getElementById('module-note');
    el.innerHTML = `
      <div id="note-topbar">
        <span style="font-size:10px;color:var(--text-dim);letter-spacing:.12em;flex-shrink:0">FILE</span>
        <input type="text" id="note-filename" placeholder="untitled.md" value="${currentFile||''}">
        <button class="note-toggle ${!previewVisible?'active':''}" id="note-edit-btn">[ EDIT ]</button>
        <button class="note-toggle ${previewVisible?'active':''}" id="note-prev-btn">[ PREVIEW ]</button>
        <button class="icon-btn" id="note-save-btn">[ SAVE ]</button>
        <button class="icon-btn" id="note-new-btn">[ NEW ]</button>
        <button class="icon-btn" id="note-open-btn">[ OPEN ]</button>
        <button class="icon-btn" id="note-ctx-btn" title="add to AI context">[ + CTX ]</button>
      </div>
      <div id="wikilink-dropdown" style="display:none;position:absolute;z-index:200;background:var(--bg-panel);border:1px solid var(--border-hi);max-height:160px;overflow-y:auto;font-size:12px;min-width:200px"></div>
      <div id="note-body">
        <textarea id="note-editor" spellcheck="false" placeholder="# title&#10;&#10;Start writing...&#10;&#10;Use [[wikilinks]] to link notes"></textarea>
        <div id="note-preview"></div>
      </div>
      <div id="note-statusline">
        <span id="note-stat-words">0 words</span>
        <span>│</span>
        <span id="note-stat-chars">0 chars</span>
        <span>│</span>
        <span id="note-stat-lines">0 lines</span>
        <span style="margin-left:auto" id="note-save-status"></span>
      </div>`;

    bindNote();
    if (currentPath && MADGOD.state.sidecar.online) _loadFromSidecar(currentPath);
  }

  function bindNote() {
    document.getElementById('note-edit-btn').addEventListener('click', ()=>setPreview(false));
    document.getElementById('note-prev-btn').addEventListener('click', ()=>setPreview(true));
    document.getElementById('note-save-btn').addEventListener('click', saveNote);
    document.getElementById('note-ctx-btn').addEventListener('click', addToContext);
    document.getElementById('note-new-btn').addEventListener('click', ()=>{ newNote(); });

    document.getElementById('note-open-btn').addEventListener('click', ()=>{
      if (MADGOD.state.sidecar.online) showNoteSelector();
      else { Terminal.warn('note browser requires sidecar — drag a file onto the editor'); }
    });

    const editor = document.getElementById('note-editor');

    editor.addEventListener('input', () => {
      if (previewVisible) updatePreview(editor.value);
      updateStats(editor.value);
      handleWikilinkAutocomplete(editor);
      scheduleSave();
    });

    editor.addEventListener('keydown', e => {
      if (e.key === 'Tab') {
        e.preventDefault();
        const s=editor.selectionStart, end=editor.selectionEnd;
        editor.value=editor.value.slice(0,s)+'  '+editor.value.slice(end);
        editor.selectionStart=editor.selectionEnd=s+2;
      }
      if ((e.ctrlKey||e.metaKey) && e.key==='s') { e.preventDefault(); saveNote(); }
      if (e.key==='Escape') hideWikilinkDropdown();
    });

    // click outside closes dropdown
    document.addEventListener('click', e => {
      if (!e.target.closest('#wikilink-dropdown') && e.target !== editor) hideWikilinkDropdown();
    });
  }

  // ── WIKILINK AUTOCOMPLETE ─────────────────────────────────
  let _wikilinkStart = -1;

  function handleWikilinkAutocomplete(editor) {
    const val = editor.value;
    const pos = editor.selectionStart;
    // find [[ before cursor
    const before = val.slice(0, pos);
    const match  = before.match(/\[\[([^\]\n]*)$/);
    if (!match) { hideWikilinkDropdown(); return; }

    const query = match[1].toLowerCase();
    _wikilinkStart = before.lastIndexOf('[[');

    const notes = MADGOD.state.notes || [];
    const matches = notes
      .filter(n => n.title && n.title.toLowerCase().includes(query))
      .slice(0, 8);

    if (!matches.length) { hideWikilinkDropdown(); return; }
    showWikilinkDropdown(matches, editor, _wikilinkStart + 2);
  }

  function showWikilinkDropdown(notes, editor, queryStart) {
    const dd = document.getElementById('wikilink-dropdown');
    dd.innerHTML = '';
    notes.forEach(n => {
      const item = document.createElement('div');
      item.textContent = n.title;
      item.style.cssText = 'padding:5px 10px;cursor:pointer;color:var(--text-muted);';
      item.addEventListener('mouseenter', ()=> item.style.color='var(--text)');
      item.addEventListener('mouseleave', ()=> item.style.color='var(--text-muted)');
      item.addEventListener('mousedown', e => {
        e.preventDefault();
        const val = editor.value;
        const pos = editor.selectionStart;
        // replace from [[ to cursor
        const before = val.slice(0, _wikilinkStart);
        const after  = val.slice(pos);
        editor.value = before + `[[${n.title}]]` + after;
        editor.selectionStart = editor.selectionEnd = before.length + n.title.length + 4;
        hideWikilinkDropdown();
        editor.focus();
        updateStats(editor.value);
      });
      dd.appendChild(item);
    });
    // position near cursor
    const coords = getCaretCoordinates(editor, editor.selectionStart);
    const rect   = editor.getBoundingClientRect();
    dd.style.left   = (rect.left + coords.left) + 'px';
    dd.style.top    = (rect.top  + coords.top  + 18) + 'px';
    dd.style.display = 'block';
  }

  function hideWikilinkDropdown() {
    const dd = document.getElementById('wikilink-dropdown');
    if (dd) dd.style.display = 'none';
  }

  // minimal caret position estimator
  function getCaretCoordinates(el, pos) {
    const div = document.createElement('div');
    const style = getComputedStyle(el);
    ['fontFamily','fontSize','fontWeight','lineHeight','padding','border','boxSizing','wordSpacing','letterSpacing','whiteSpace'].forEach(p=>div.style[p]=style[p]);
    div.style.position='absolute'; div.style.visibility='hidden'; div.style.overflow='hidden';
    div.style.width=el.offsetWidth+'px';
    div.textContent = el.value.slice(0, pos);
    const span = document.createElement('span');
    span.textContent = '|';
    div.appendChild(span);
    document.body.appendChild(div);
    const { offsetLeft: left, offsetTop: top } = span;
    document.body.removeChild(div);
    return { left: left - el.scrollLeft, top: top - el.scrollTop };
  }

  // ── FILE OPS ──────────────────────────────────────────────
  function newNote() {
    currentFile=null; currentPath=null;
    const editor = document.getElementById('note-editor');
    const fn     = document.getElementById('note-filename');
    if (editor) editor.value='';
    if (fn)     fn.value='';
    Terminal.info('new note');
  }

  async function saveNote() {
    const editor = document.getElementById('note-editor');
    const fn     = document.getElementById('note-filename');
    if (!editor) return;

    const filename = fn?.value.trim() || 'untitled.md';
    const content  = editor.value;
    currentFile    = filename;

    const statusEl = document.getElementById('note-save-status');
    if (statusEl) statusEl.textContent = 'saving...';

    if (MADGOD.state.sidecar.online) {
      try {
        const path = currentPath || filename;
        await MADGOD.sidecarPost('/vault/note/write', { path, content });
        if (statusEl) statusEl.textContent = `saved ${new Date().toTimeString().slice(0,5)}`;
        Terminal.success(`saved: ${filename}`);
      } catch(e) {
        if (statusEl) statusEl.textContent = 'save failed';
        Terminal.error(`save failed: ${e.message}`);
      }
    } else {
      // local fallback — download
      const blob = new Blob([content], { type:'text/markdown' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename.endsWith('.md') ? filename : filename+'.md';
      a.click();
      if (statusEl) statusEl.textContent = 'downloaded';
      Terminal.success(`downloaded: ${a.download}`);
    }
  }

  function scheduleSave() {
    clearTimeout(saveDebounce);
    saveDebounce = setTimeout(() => {
      if (currentPath && MADGOD.state.sidecar.online) saveNote();
    }, 3000);
  }

  async function _loadFromSidecar(path) {
    try {
      const r = await MADGOD.sidecarFetch(`/file/read?path=${encodeURIComponent(path)}`);
      const editor = document.getElementById('note-editor');
      if (editor) { editor.value = r.content; updateStats(r.content); if (previewVisible) updatePreview(r.content); }
      const fn = document.getElementById('note-filename');
      if (fn) fn.value = path.split('/').pop();
      Terminal.success(`opened: ${path.split('/').pop()}`);
    } catch(e) {
      Terminal.error(`open failed: ${e.message}`);
    }
  }

  function showNoteSelector() {
    const notes = MADGOD.state.notes;
    if (!notes.length) { Terminal.warn('no notes loaded — run: vault reload'); return; }
    // show a quick list in terminal
    Terminal.sys('── NOTES (click to open) ──────────────────');
    notes.slice(0,20).forEach(n => {
      const line = document.createElement('div');
      line.className = 'term-line info';
      line.innerHTML = `<span class="ts"></span><span class="msg" style="cursor:pointer;color:var(--text)" data-path="${n.path}" data-title="${n.title}">  >> ${n.title}</span>`;
      line.querySelector('.msg').addEventListener('click', () => {
        openFile(n.title, n.path);
        Router.navigate('note');
      });
      document.getElementById('terminal-output').appendChild(line);
    });
    Terminal.sys('────────────────────────────────────────────');
  }

  function openFile(title, path) {
    currentFile = title;
    currentPath = path;
    if (MADGOD.state.sidecar.online && path) {
      _loadFromSidecar(path);
    } else {
      const fn = document.getElementById('note-filename');
      if (fn) fn.value = title;
    }
  }

  function addToContext() {
    const editor = document.getElementById('note-editor');
    const fn     = document.getElementById('note-filename');
    if (!editor) return;
    const name    = fn?.value || currentFile || 'untitled.md';
    const content = editor.value;
    const tokens  = Math.ceil(content.length/4);
    MADGOD.state.context.push({ name, content, tokens });
    MADGOD.state.contextTokens = MADGOD.state.context.reduce((a,f)=>a+(f.tokens||0),0);
    Terminal.success(`added to context: ${name} (${tokens} tokens)`);
  }

  // ── PREVIEW ───────────────────────────────────────────────
  function setPreview(show) {
    previewVisible=show;
    const editor  = document.getElementById('note-editor');
    const preview = document.getElementById('note-preview');
    const eBtn    = document.getElementById('note-edit-btn');
    const pBtn    = document.getElementById('note-prev-btn');
    if (!editor||!preview) return;
    preview.classList.toggle('visible',show);
    eBtn?.classList.toggle('active',!show);
    pBtn?.classList.toggle('active',show);
    if (show) updatePreview(editor.value);
  }

  function updatePreview(md) {
    const el = document.getElementById('note-preview');
    if (!el) return;
    let html = md
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/^---[\s\S]*?---\n/m,'') // strip frontmatter
      .replace(/^### (.+)$/gm,'<h3>$1</h3>')
      .replace(/^## (.+)$/gm,'<h2>$1</h2>')
      .replace(/^# (.+)$/gm,'<h1>$1</h1>')
      .replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>')
      .replace(/\*(.+?)\*/g,'<em>$1</em>')
      .replace(/~~(.+?)~~/g,'<del>$1</del>')
      .replace(/`([^`\n]+)`/g,'<code>$1</code>')
      .replace(/```[\w]*\n([\s\S]*?)```/g,'<pre><code>$1</code></pre>')
      .replace(/\[\[([^\]]+)\]\]/g,'<a class="wikilink" href="#note-$1" onclick="Commands.dispatch(`note &quot;$1&quot;`);return false">$1</a>')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g,'<a href="$2" target="_blank">$1</a>')
      .replace(/^> (.+)$/gm,'<blockquote>$1</blockquote>')
      .replace(/^- (.+)$/gm,'<li>$1</li>')
      .replace(/^\d+\. (.+)$/gm,'<li>$1</li>')
      .replace(/^---$/gm,'<hr>')
      .replace(/\n\n/g,'</p><p>')
      .replace(/\n/g,'<br>');
    el.innerHTML = '<p>'+html+'</p>';
  }

  function updateStats(text) {
    if (!text) return;
    const words = text.trim().split(/\s+/).filter(Boolean).length;
    const chars = text.length;
    const lines = text.split('\n').length;
    const wEl   = document.getElementById('note-stat-words');
    const cEl   = document.getElementById('note-stat-chars');
    const lEl   = document.getElementById('note-stat-lines');
    if (wEl) wEl.textContent=`${words} words`;
    if (cEl) cEl.textContent=`${chars} chars`;
    if (lEl) lEl.textContent=`${lines} lines`;
  }

  function onActivate() {
    render();
    Terminal.sys('LEXICON online');
  }

  function getActions() {
    return [
      { label:'[ SAVE ]',    fn: saveNote },
      { label:'[ PREVIEW ]', fn: ()=>setPreview(!previewVisible) },
      { label:'[ + CTX ]',   fn: addToContext },
      { label:'[ NOTES ]',   fn: showNoteSelector },
    ];
  }

  return { onActivate, openFile, getActions };
})());

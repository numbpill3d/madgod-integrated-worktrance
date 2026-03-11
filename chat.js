// ============================================================
// MADGOD — SOMA_CHAT module
// streaming AI chat: claude / ollama / openrouter
// ============================================================

MADGOD.registerModule('chat', (() => {

  function render() {
    const el = document.getElementById('module-chat');
    el.innerHTML = `
      <div id="chat-provider-bar">
        <span style="font-size:10px;color:var(--text-dim);letter-spacing:.12em">PROVIDER</span>
        <button class="provider-btn ${MADGOD.state.provider==='claude'?'active':''}" data-p="claude">CLAUDE</button>
        <button class="provider-btn ${MADGOD.state.provider==='ollama'?'active':''}" data-p="ollama">OLLAMA</button>
        <button class="provider-btn ${MADGOD.state.provider==='openrouter'?'active':''}" data-p="openrouter">OPENROUTER</button>
        <span id="chat-model-label" style="font-size:11px;color:var(--text-muted);margin-left:8px"></span>
        <button class="icon-btn" id="chat-clear-btn" style="margin-left:auto">[ CLR ]</button>
        <button class="icon-btn" id="chat-ctx-toggle">[ CTX: ${MADGOD.state.context.length} ]</button>
      </div>
      <div id="chat-messages"></div>
      <div id="chat-input-area">
        <div id="chat-ctx-bar">
          <span>CTX TOKENS: <span id="chat-ctx-tokens">${MADGOD.state.contextTokens}</span></span>
          <span>MSGS: <span id="chat-msg-count">${MADGOD.state.conversation.length}</span></span>
          <span id="chat-stream-status"></span>
        </div>
        <div id="chat-input-row">
          <textarea id="chat-input" rows="2" placeholder="message..."></textarea>
          <button id="chat-send">[ SEND ]</button>
        </div>
      </div>`;

    bindChat();
    renderMessages();
    updateModelLabel();
  }

  function updateModelLabel() {
    const el = document.getElementById('chat-model-label');
    if (!el) return;
    const p = MADGOD.state.provider;
    if (p === 'ollama') el.textContent = `// ${MADGOD.state.ollamaModel}`;
    else if (p === 'openrouter') el.textContent = '// via openrouter';
    else el.textContent = '// claude-sonnet-4-20250514';
  }

  function bindChat() {
    // provider buttons
    document.querySelectorAll('.provider-btn').forEach(btn => {
      btn.addEventListener('click', () => setProvider(btn.dataset.p));
    });

    // send
    const sendBtn = document.getElementById('chat-send');
    const inputEl = document.getElementById('chat-input');
    sendBtn?.addEventListener('click', sendMessage);
    inputEl?.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
    });

    // clear
    document.getElementById('chat-clear-btn')?.addEventListener('click', () => {
      MADGOD.state.conversation = [];
      renderMessages();
      Terminal.sys('conversation cleared');
    });
  }

  function setProvider(p, model) {
    MADGOD.state.provider = p;
    localStorage.setItem('mg_provider', p);
    if (model) MADGOD.state.ollamaModel = model;
    document.querySelectorAll('.provider-btn').forEach(b => b.classList.toggle('active', b.dataset.p === p));
    updateModelLabel();

    // update titlebar
    document.getElementById('ai-provider').textContent = p.toUpperCase();
    Terminal.success(`provider → ${p}`);
  }

  function renderMessages() {
    const el = document.getElementById('chat-messages');
    if (!el) return;
    el.innerHTML = '';
    MADGOD.state.conversation.forEach(msg => appendMessage(msg.role, msg.content));
    el.scrollTop = el.scrollHeight;
  }

  function appendMessage(role, content, streaming = false) {
    const el = document.getElementById('chat-messages');
    if (!el) return null;
    const div = document.createElement('div');
    div.className = 'chat-msg';
    div.innerHTML = `
      <div class="msg-role ${role}">${role.toUpperCase()} <span style="color:var(--text-dim);font-size:10px">[${ts()}]</span></div>
      <div class="msg-content ${role}">${formatContent(content)}${streaming ? '<span class="stream-cursor"></span>' : ''}</div>`;
    el.appendChild(div);
    el.scrollTop = el.scrollHeight;
    return div.querySelector('.msg-content');
  }

  function formatContent(text) {
    // basic code block detection
    return text
      .replace(/```(\w*)\n?([\s\S]*?)```/g, '<pre><code>$2</code></pre>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\n/g, '<br>');
  }

  function ts() {
    const d = new Date();
    return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  }

  async function sendMessage() {
    const inputEl = document.getElementById('chat-input');
    if (!inputEl) return;
    const text = inputEl.value.trim();
    if (!text) return;
    inputEl.value = '';
    inputEl.style.height = '';

    // append user msg
    MADGOD.state.conversation.push({ role: 'user', content: text });
    appendMessage('user', text);

    // build context injection
    let systemPrompt = 'You are MADGOD, an intelligent workspace assistant. You help with coding, writing, ESP32/embedded systems, cybersecurity, OSINT, and Obsidian note management.';
    if (MADGOD.state.context.length > 0) {
      systemPrompt += '\n\nContext files:\n';
      MADGOD.state.context.forEach(f => {
        systemPrompt += `\n--- ${f.name} ---\n${f.content}\n`;
      });
    }

    // streaming assistant bubble
    const streamEl = appendMessage('assistant', '', true);
    let full = '';
    document.getElementById('chat-stream-status').textContent = 'STREAMING...';

    try {
      const p = MADGOD.state.provider;

      if (p === 'claude') {
        await streamClaude(systemPrompt, MADGOD.state.conversation, (chunk) => {
          full += chunk;
          if (streamEl) streamEl.innerHTML = formatContent(full) + '<span class="stream-cursor"></span>';
          document.getElementById('chat-messages').scrollTop = 99999;
        });
      } else if (p === 'ollama') {
        await streamOllama(systemPrompt, MADGOD.state.conversation, (chunk) => {
          full += chunk;
          if (streamEl) streamEl.innerHTML = formatContent(full) + '<span class="stream-cursor"></span>';
          document.getElementById('chat-messages').scrollTop = 99999;
        });
      } else if (p === 'openrouter') {
        await streamOpenRouter(systemPrompt, MADGOD.state.conversation, (chunk) => {
          full += chunk;
          if (streamEl) streamEl.innerHTML = formatContent(full) + '<span class="stream-cursor"></span>';
          document.getElementById('chat-messages').scrollTop = 99999;
        });
      }

      // finalize
      if (streamEl) streamEl.innerHTML = formatContent(full);
      MADGOD.state.conversation.push({ role: 'assistant', content: full });

    } catch (err) {
      if (streamEl) streamEl.innerHTML = `<span style="color:var(--danger)">ERROR: ${err.message}</span>`;
      Terminal.error(`chat error: ${err.message}`);
    }

    document.getElementById('chat-stream-status').textContent = '';
    document.getElementById('chat-msg-count').textContent = MADGOD.state.conversation.length;
  }

  // ── CLAUDE STREAMING ──────────────────────────────────────
  async function streamClaude(system, conversation, onChunk) {
    const key = MADGOD.state.apiKeys.claude;
    if (!key) {
      throw new Error('no Claude API key — run: set claude.key sk-ant-...');
    }

    const msgs = conversation.map(m => ({ role: m.role, content: m.content }));
    // ensure last is user
    if (msgs[msgs.length - 1]?.role !== 'user') return;

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        system,
        messages: msgs,
        stream: true,
      }),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error?.message || `HTTP ${res.status}`);
    }

    const reader = res.body.getReader();
    const dec    = new TextDecoder();
    let buf = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop();
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6);
        if (data === '[DONE]') return;
        try {
          const j = JSON.parse(data);
          if (j.type === 'content_block_delta' && j.delta?.text) {
            onChunk(j.delta.text);
          }
        } catch {}
      }
    }
  }

  // ── OLLAMA STREAMING ──────────────────────────────────────
  async function streamOllama(system, conversation, onChunk) {
    const msgs = [{ role: 'system', content: system }, ...conversation.map(m => ({ role: m.role, content: m.content }))];
    const res = await fetch('http://localhost:11434/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: MADGOD.state.ollamaModel, messages: msgs, stream: true }),
    });
    if (!res.ok) throw new Error(`Ollama HTTP ${res.status} — is Ollama running?`);

    const reader = res.body.getReader();
    const dec    = new TextDecoder();
    let buf = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop();
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const j = JSON.parse(line);
          if (j.message?.content) onChunk(j.message.content);
          if (j.done) return;
        } catch {}
      }
    }
  }

  // ── OPENROUTER STREAMING ──────────────────────────────────
  async function streamOpenRouter(system, conversation, onChunk) {
    const key = MADGOD.state.apiKeys.openrouter;
    if (!key) throw new Error('no OpenRouter key — run: set openrouter.key sk-or-...');

    const msgs = [{ role: 'system', content: system }, ...conversation.map(m => ({ role: m.role, content: m.content }))];
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${key}`,
        'content-type': 'application/json',
        'HTTP-Referer': 'madgod-workspace',
        'X-Title': 'MADGOD',
      },
      body: JSON.stringify({
        model: 'anthropic/claude-sonnet-4',
        messages: msgs,
        stream: true,
        max_tokens: 4096,
      }),
    });
    if (!res.ok) throw new Error(`OpenRouter HTTP ${res.status}`);

    const reader = res.body.getReader();
    const dec    = new TextDecoder();
    let buf = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop();
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6);
        if (data === '[DONE]') return;
        try {
          const j = JSON.parse(data);
          const t = j.choices?.[0]?.delta?.content;
          if (t) onChunk(t);
        } catch {}
      }
    }
  }

  function onActivate() {
    render();
    Terminal.sys('SOMA_CHAT online');
  }

  return { onActivate, setProvider, render };
})());

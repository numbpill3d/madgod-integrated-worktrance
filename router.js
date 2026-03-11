// ============================================================
// MADGOD — module router
// mounts/unmounts modules into the viewport
// ============================================================

const Router = (() => {

  function navigate(moduleId) {
    const modules = MADGOD.modules;

    if (!modules[moduleId]) {
      Terminal.error(`unknown module: ${moduleId}`);
      return;
    }

    // deactivate current
    const prev = MADGOD.state.activeModule;
    if (prev && modules[prev]) {
      const prevEl = document.getElementById(`module-${prev}`);
      if (prevEl) prevEl.classList.remove('active');
      if (modules[prev].onDeactivate) modules[prev].onDeactivate();
    }

    // activate new
    MADGOD.state.activeModule = moduleId;
    const el = document.getElementById(`module-${moduleId}`);
    if (el) {
      el.classList.add('active');
    }

    if (modules[moduleId].onActivate) modules[moduleId].onActivate();

    // update nav
    document.querySelectorAll('.nav-item').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.module === moduleId);
    });

    // update breadcrumb
    const nameMap = {
      graph:   'MAGI_GRAPH',
      chat:    'SOMA_CHAT',
      note:    'LEXICON',
      code:    'CORTEX_CODE',
      esp32:   'ESP32_CTRL',
      context: 'CTX_INJECT',
      visual:  'VISUAL_LAB',
    };
    const name = nameMap[moduleId] || moduleId.toUpperCase();
    document.getElementById('active-module-name').textContent = name;
    document.getElementById('sb-module').textContent = name;

    // update viewport actions
    const actionsEl = document.getElementById('viewport-actions');
    actionsEl.innerHTML = '';
    if (modules[moduleId].getActions) {
      modules[moduleId].getActions().forEach(action => {
        const btn = document.createElement('button');
        btn.className = 'icon-btn';
        btn.textContent = action.label;
        btn.title = action.title || '';
        btn.addEventListener('click', action.fn);
        actionsEl.appendChild(btn);
      });
    }
  }

  function init() {
    // nav click
    document.querySelectorAll('.nav-item').forEach(btn => {
      btn.addEventListener('click', () => {
        navigate(btn.dataset.module);
        Terminal.sys(`switched to ${btn.dataset.module}`);
      });
    });

    // rail toggle
    const rail = document.getElementById('left-rail');
    const toggleBtn = document.getElementById('rail-toggle');
    toggleBtn.addEventListener('click', () => {
      MADGOD.state.railCollapsed = !MADGOD.state.railCollapsed;
      rail.classList.toggle('collapsed', MADGOD.state.railCollapsed);
      toggleBtn.textContent = MADGOD.state.railCollapsed ? '▷' : '◁';
    });
  }

  return { navigate, init };
})();

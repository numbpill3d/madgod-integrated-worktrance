// ============================================================
// MADGOD — MAGI_GRAPH  (full build)
// 3D force-directed obsidian topology, sidecar-aware
// ============================================================

MADGOD.registerModule('graph', (() => {
  let scene, camera, renderer, animId;
  let nodes = [], edges = [], nodeMeshes = [], edgeLines = [];
  let raycaster, mouse, hoveredNode = null;
  let frameCount = 0, physicsFrames = 0;
  let physicsActive = true;
  const container = () => document.getElementById('module-graph');

  // ── ORBIT ────────────────────────────────────────────────
  const orbit = { dragging: false, startX:0, startY:0, rotX:0, rotY:0, zoom:110 };

  // ── DEMO DATA ─────────────────────────────────────────────
  function generateDemoGraph() {
    const names = [
      'RESONATOR_ENTROPY','URBINDEX','CAN_bus_notes','ESP32_pinout',
      'laincore_aesthetics','VOIDRANE_worldbuilding','OSINT_toolkit',
      'firmware_rev_eng','hardware_implants','chaincoder_posts',
      'AEON_persona','xenotrek_archive','neocities_themes',
      'three_js_experiments','obsidian_workflow','madgod_dev',
      'e-waste-clinic','bash_automation','python_scripts',
      'nolove_site','voidrane_nekoweb',
    ];
    const ns = names.map((title, i) => ({
      id:i, title, links:[], path:'',
      x:(Math.random()-.5)*60, y:(Math.random()-.5)*60, z:(Math.random()-.5)*60,
      vx:0, vy:0, vz:0, type: Math.random()>.7 ? 'hub':'note',
    }));
    const wiki = [[0,3],[0,7],[1,8],[2,3],[3,14],[4,12],[5,1],[6,7],[6,8],[9,10],[10,11],[11,12],[13,12],[13,4],[14,15],[15,9],[16,6],[17,6],[18,9],[19,20],[20,5]];
    const sem  = [[0,1],[2,7],[3,8],[4,5],[6,11],[9,14],[10,15],[12,19],[13,18],[16,17]];
    return {
      nodes: ns,
      wikiEdges: wiki.map(([a,b])=>({a,b,type:'wiki'})),
      semEdges:  sem.map(([a,b]) =>({a,b,type:'sem'})),
    };
  }

  // ── SCENE ─────────────────────────────────────────────────
  function initScene() {
    const el = container();
    const w = el.clientWidth, h = el.clientHeight;
    scene  = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(55, w/h, 0.1, 1000);
    camera.position.set(0,0,110);

    renderer = new THREE.WebGLRenderer({ antialias:true, alpha:true });
    renderer.setSize(w,h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio,2));
    renderer.setClearColor(0x040404, 1);
    el.appendChild(renderer.domElement);

    raycaster = new THREE.Raycaster();
    raycaster.params.Points.threshold = 1.5;
    mouse = new THREE.Vector2();

    // deep void fog — monochrome
    scene.fog = new THREE.FogExp2(0x040404, 0.007);

    // monochrome lighting + dim blood-red rim
    scene.add(new THREE.AmbientLight(0xffffff, 0.12));
    const dir = new THREE.DirectionalLight(0xffffff, 0.45);
    dir.position.set(60, 60, 60);
    scene.add(dir);
    const rim = new THREE.PointLight(0x8b1a1a, 1.0, 280);
    rim.position.set(-80, -40, -60);
    scene.add(rim);

    // star-field background
    _addStarField();

    renderer.domElement.addEventListener('mousemove', onMouseMove);
    renderer.domElement.addEventListener('click', onNodeClick);
    setupOrbit();
    window.addEventListener('resize', onResize);
  }

  function setupOrbit() {
    const el = renderer.domElement;
    el.addEventListener('mousedown', e => { orbit.dragging=true; orbit.startX=e.clientX; orbit.startY=e.clientY; });
    el.addEventListener('mouseup',    () => orbit.dragging=false);
    el.addEventListener('mouseleave', () => orbit.dragging=false);
    el.addEventListener('mousemove', e => {
      if (!orbit.dragging) return;
      orbit.rotY += (e.clientX - orbit.startX) * 0.005;
      orbit.rotX += (e.clientY - orbit.startY) * 0.005;
      orbit.startX=e.clientX; orbit.startY=e.clientY;
    });
    el.addEventListener('wheel', e => {
      orbit.zoom = Math.min(280, Math.max(20, orbit.zoom + e.deltaY*0.08));
    }, { passive:true });
  }

  // ── BUILD GRAPH ───────────────────────────────────────────
  function buildGraph(data) {
    nodeMeshes.forEach(m => { m.geometry.dispose(); m.material.dispose(); scene.remove(m); });
    edgeLines.forEach(l  => { l.geometry.dispose(); l.material.dispose(); scene.remove(l); });
    nodeMeshes=[]; edgeLines=[];

    nodes = data.nodes;
    edges = [...(data.wikiEdges||[]), ...(data.semEdges||[])];
    MADGOD.state.graph._wiki = data.wikiEdges || [];
    MADGOD.state.graph._sem  = data.semEdges  || [];

    nodes.forEach(n => {
      const isHub = n.type === 'hub';
      const geo = isHub
        ? new THREE.OctahedronGeometry(2.4, 0)
        : new THREE.IcosahedronGeometry(1.1, 0);
      const mat = new THREE.MeshStandardMaterial({
        color:            isHub ? 0xffffff : 0x1a1a1a,
        emissive:         isHub ? 0xffffff : 0x444444,
        emissiveIntensity:isHub ? 0.70     : 0.15,
        wireframe:        !isHub,
        transparent:      true,
        opacity:          isHub ? 0.92 : 0.55,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(n.x, n.y, n.z);
      mesh.userData = { nodeId:n.id, node:n, baseOpacity:mat.opacity, baseEmissive:mat.emissiveIntensity };
      scene.add(mesh);
      nodeMeshes.push(mesh);
    });

    // wikilink edges — white
    (data.wikiEdges||[]).forEach(e => addEdge(e, 0xffffff, 0.38));
    // semantic edges — blood red
    (data.semEdges||[]).forEach(e  => addEdge(e, 0x8b1a1a, 0.55));

    physicsFrames = 0;
    physicsActive = true;
    updateStats();
  }

  function addEdge(e, color, opacity) {
    const a = nodes[e.a], b = nodes[e.b];
    if (!a||!b) return;
    const pts = [new THREE.Vector3(a.x,a.y,a.z), new THREE.Vector3(b.x,b.y,b.z)];
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const mat = new THREE.LineBasicMaterial({ color, transparent:true, opacity });
    const line = new THREE.Line(geo, mat);
    line.userData = { ea:e.a, eb:e.b };
    scene.add(line);
    edgeLines.push(line);
  }

  // ── PHYSICS ───────────────────────────────────────────────
  const K_REPEL=90, K_SPRING=0.014, L_REST=20, DAMPING=0.87;
  const PHYSICS_SETTLE_FRAMES = 800; // stop auto-simulating after this many frames

  function simulateStep() {
    if (!nodes.length) return;
    nodes.forEach(n => { n.fx=0; n.fy=0; n.fz=0; });

    // repulsion (O(n²) — fine for <500 nodes)
    for (let i=0; i<nodes.length; i++) {
      for (let j=i+1; j<nodes.length; j++) {
        const a=nodes[i], b=nodes[j];
        const dx=a.x-b.x, dy=a.y-b.y, dz=a.z-b.z;
        const d2=dx*dx+dy*dy+dz*dz+0.01;
        const d=Math.sqrt(d2), f=K_REPEL/d2;
        a.fx+=f*dx/d; a.fy+=f*dy/d; a.fz+=f*dz/d;
        b.fx-=f*dx/d; b.fy-=f*dy/d; b.fz-=f*dz/d;
      }
    }

    // spring attraction
    edges.forEach(e => {
      const a=nodes[e.a], b=nodes[e.b];
      if (!a||!b) return;
      const dx=b.x-a.x, dy=b.y-a.y, dz=b.z-a.z;
      const d=Math.sqrt(dx*dx+dy*dy+dz*dz)+0.01;
      const f=K_SPRING*(d-L_REST);
      const nx=dx/d, ny=dy/d, nz=dz/d;
      a.fx+=f*nx; a.fy+=f*ny; a.fz+=f*nz;
      b.fx-=f*nx; b.fy-=f*ny; b.fz-=f*nz;
    });

    nodes.forEach(n => {
      n.vx=(n.vx+n.fx)*DAMPING;
      n.vy=(n.vy+n.fy)*DAMPING;
      n.vz=(n.vz+n.fz)*DAMPING;
      n.x+=n.vx*0.5; n.y+=n.vy*0.5; n.z+=n.vz*0.5;
    });

    physicsFrames++;
    // auto-settle: slow down sim after convergence
    if (physicsFrames > PHYSICS_SETTLE_FRAMES) physicsActive = false;
  }

  function syncGeometry() {
    nodeMeshes.forEach((mesh,i) => {
      const n=nodes[i]; if (!n) return;
      mesh.position.set(n.x,n.y,n.z);
    });
    const allEdges = [...MADGOD.state.graph._wiki, ...MADGOD.state.graph._sem];
    edgeLines.forEach((line,i) => {
      const e=allEdges[i]; if (!e) return;
      const a=nodes[e.a], b=nodes[e.b]; if (!a||!b) return;
      const pos = line.geometry.attributes.position;
      pos.setXYZ(0,a.x,a.y,a.z);
      pos.setXYZ(1,b.x,b.y,b.z);
      pos.needsUpdate=true;
    });
  }

  // ── HOVER / CLICK ─────────────────────────────────────────
  function onMouseMove(e) {
    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x =  ((e.clientX-rect.left)/rect.width )*2-1;
    mouse.y = -((e.clientY-rect.top) /rect.height)*2+1;
    raycaster.setFromCamera(mouse, camera);
    const hits = raycaster.intersectObjects(nodeMeshes);
    if (hits.length>0) {
      const hit = hits[0].object;
      if (hoveredNode !== hit) {
        if (hoveredNode) resetNode(hoveredNode);
        hoveredNode=hit; highlightNode(hoveredNode);
        showHover(hoveredNode.userData.node);
      }
    } else {
      if (hoveredNode) { resetNode(hoveredNode); hoveredNode=null; }
      hideHover();
    }
  }

  function onNodeClick() {
    if (!hoveredNode) return;
    const node = hoveredNode.userData.node;
    Terminal.info(`◈ ${node.title}`);
    if (node.path) Commands.dispatch(`note "${node.title}"`);
  }

  function highlightNode(m) {
    m.material.color.set(0xffffff);
    m.material.emissive.set(0xffffff);
    m.material.emissiveIntensity = 1.4;
    m.material.opacity = 1;
    m.material.wireframe = false;
    renderer.domElement.style.cursor = 'pointer';
    physicsActive = true;
  }
  function resetNode(m) {
    const ud = m.userData;
    const isHub = ud.node.type === 'hub';
    m.material.color.set(isHub ? 0xffffff : 0x1a1a1a);
    m.material.emissive.set(isHub ? 0xffffff : 0x444444);
    m.material.emissiveIntensity = ud.baseEmissive;
    m.material.opacity = ud.baseOpacity;
    m.material.wireframe = !isHub;
    renderer.domElement.style.cursor = 'default';
  }

  function showHover(n) {
    const el=document.getElementById('graph-hover-info'); if (!el) return;
    el.style.display='block';
    el.innerHTML=`<div class="hover-title">${n.title}</div><div class="hover-meta">links: ${n.links ? n.links.length : 0} │ type: ${n.type||'note'}${n.tags&&n.tags.length?' │ '+n.tags.slice(0,3).map(t=>'#'+t).join(' '):''}</div>`;
  }
  function hideHover() {
    const el=document.getElementById('graph-hover-info'); if (el) el.style.display='none';
  }

  // ── ANIMATE ───────────────────────────────────────────────
  function animate() {
    animId = requestAnimationFrame(animate);
    frameCount++;

    // physics — every other frame
    if (frameCount%2===0 && (physicsActive || MADGOD.state.physicsRunning)) {
      simulateStep(); syncGeometry();
    }

    // auto-rotate when idle
    if (!orbit.dragging) orbit.rotY += 0.0006;

    const cX=Math.cos(orbit.rotX), sX=Math.sin(orbit.rotX);
    const cY=Math.cos(orbit.rotY), sY=Math.sin(orbit.rotY);
    camera.position.x = orbit.zoom * sY * cX;
    camera.position.y = orbit.zoom * sX;
    camera.position.z = orbit.zoom * cY * cX;
    camera.lookAt(0,0,0);

    // node pulse + spin — hub nodes glow-pulse cyan, regular nodes dim violet
    nodeMeshes.forEach((mesh,i) => {
      if (mesh===hoveredNode) return;
      const isHub = mesh.userData.node.type === 'hub';
      const t = frameCount*0.016 + i*0.38;
      mesh.rotation.y += isHub ? 0.006 : 0.003;
      mesh.rotation.x += isHub ? 0.003 : 0.0015;
      const pulse = isHub
        ? mesh.userData.baseEmissive + Math.sin(t)*0.20   // hub pulses white — organic heartbeat
        : mesh.userData.baseEmissive + Math.sin(t)*0.05;  // nodes breathe subtly
      mesh.material.emissiveIntensity = pulse;
    });

    renderer.render(scene,camera);
  }

  function onResize() {
    const el=container(); if (!el||!renderer) return;
    const w=el.clientWidth, h=el.clientHeight;
    camera.aspect=w/h; camera.updateProjectionMatrix();
    renderer.setSize(w,h);
  }

  function updateStats() {
    const nc=document.getElementById('sb-notes-count');
    const ec=document.getElementById('sb-edges-count');
    const ns=document.getElementById('graph-stat-nodes');
    const es=document.getElementById('graph-stat-edges');
    if (nc) nc.textContent=`${nodes.length} notes`;
    if (ec) ec.textContent=`${edges.length} edges`;
    if (ns) ns.textContent=`NODES ${nodes.length}`;
    if (es) es.textContent=`EDGES ${edges.length}`;
  }

  // ── SIDECAR VAULT LOAD ────────────────────────────────────
  async function loadVaultFromSidecar() {
    Terminal.info('fetching vault graph from sidecar...');
    try {
      const data = await MADGOD.sidecarFetch('/vault/graph');
      if (!data.nodes || data.nodes.length === 0) {
        Terminal.warn('vault is empty or no notes found');
        return;
      }
      MADGOD.state.notes = data.notes || data.nodes;
      buildGraph({ nodes: data.nodes, wikiEdges: data.wiki_edges, semEdges: data.sem_edges });
      MADGOD.state.vaultLoaded = true;
      Terminal.success(`graph loaded — ${data.nodes.length} nodes, ${(data.wiki_edges||[]).length} wiki, ${(data.sem_edges||[]).length} semantic`);
    } catch(e) {
      Terminal.error(`vault load failed: ${e.message}`);
    }
  }

  async function loadVault() {
    if (MADGOD.state.sidecar.online) {
      // set vault path on sidecar then load
      try {
        Terminal.info(`setting vault: ${MADGOD.state.vaultPath}`);
        const r = await MADGOD.sidecarPost('/vault/set', { path: MADGOD.state.vaultPath });
        Terminal.success(`vault parsed — ${r.notes} notes, ${r.wiki_edges} wiki edges`);
        await loadVaultFromSidecar();
      } catch(e) {
        Terminal.error(`vault set failed: ${e.message}`);
        Terminal.warn('falling back to demo graph');
        _loadDemo();
      }
    } else {
      Terminal.warn('sidecar offline — loading demo graph');
      _loadDemo();
    }
  }

  function _loadDemo() {
    const demo = generateDemoGraph();
    buildGraph(demo);
    Terminal.sys('demo graph loaded (21 nodes)');
  }

  function togglePhysics() {
    MADGOD.state.physicsRunning = !MADGOD.state.physicsRunning;
    physicsActive = MADGOD.state.physicsRunning;
    Terminal.info(`physics: ${MADGOD.state.physicsRunning ? 'ON' : 'OFF'}`);
  }

  // ── STAR FIELD ────────────────────────────────────────────
  function _addStarField() {
    const N = 2200;
    const pos = new Float32Array(N * 3);
    const col = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi   = Math.acos(2 * Math.random() - 1);
      const r     = 220 + Math.random() * 280;
      pos[i*3]   = r * Math.sin(phi) * Math.cos(theta);
      pos[i*3+1] = r * Math.sin(phi) * Math.sin(theta);
      pos[i*3+2] = r * Math.cos(phi);
      // cool blue-white tint with occasional cyan spark
      const isCyan = Math.random() < 0.05;
      // white stars with very occasional dim-red ones (blood)
      const isRed = Math.random() < 0.04;
      const bright = 0.35 + Math.random() * 0.5;
      col[i*3]   = isRed ? 0.55 : bright;
      col[i*3+1] = isRed ? 0.08 : bright;
      col[i*3+2] = isRed ? 0.08 : bright;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color',    new THREE.BufferAttribute(col, 3));
    scene.add(new THREE.Points(geo, new THREE.PointsMaterial({
      vertexColors: true,
      size: 0.35,
      transparent: true,
      opacity: 0.55,
      sizeAttenuation: true,
    })));
  }

  // ── MODULE INTERFACE ──────────────────────────────────────
  function onActivate() {
    if (!renderer) { initScene(); _loadDemo(); animate(); }
    Terminal.sys('MAGI_GRAPH online');
  }

  function getActions() {
    return [
      { label:'[ RELOAD ]',     fn: ()=>Commands.dispatch('vault reload') },
      { label:'[ RESET VIEW ]', fn: ()=>{ orbit.rotX=0; orbit.rotY=0; orbit.zoom=110; } },
      { label:'[ PHYSICS ]',    fn: togglePhysics },
      { label:'[ SEARCH ]',     fn: ()=>{ Terminal.focus(); document.getElementById('terminal-input').value='vault search '; } },
    ];
  }

  return { onActivate, loadVault, loadVaultFromSidecar, getActions };
})());

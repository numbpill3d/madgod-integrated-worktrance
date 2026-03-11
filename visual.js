// ============================================================
// MADGOD — VISUAL_LAB
// generative art: particles, boids, field, wave, Lorenz
// ============================================================


// ============================================================
// MADGOD — VISUAL_LAB module
// ============================================================

MADGOD.registerModule('visual', (() => {
  let scene, camera, renderer, animId;
  let currentMode = 'particles';

  const PARTICLE_COUNT = 3000;
  let pPos, pVel, pSystem;

  function render() {
    const el = document.getElementById('module-visual');
    el.innerHTML = `
      <div id="visual-controls">
        <button class="visual-btn active" data-mode="particles">PARTICLES</button>
        <button class="visual-btn" data-mode="alife">A-LIFE</button>
        <button class="visual-btn" data-mode="field">FIELD</button>
        <button class="visual-btn" data-mode="wave">WAVE</button>
        <button class="visual-btn" data-mode="strange">STRANGE</button>
        <button class="visual-btn" data-mode="topology">TOPO</button>
      </div>
      <div id="visual-info" style="position:absolute;bottom:14px;left:16px;font-size:10px;color:var(--text-dim);letter-spacing:.1em;z-index:10;pointer-events:none">${currentMode.toUpperCase()}</div>`;

    el.querySelectorAll('.visual-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        el.querySelectorAll('.visual-btn').forEach(b=>b.classList.remove('active'));
        btn.classList.add('active');
        setMode(btn.dataset.mode);
      });
    });
  }

  function initScene() {
    const el = document.getElementById('module-visual');
    const w=el.clientWidth, h=el.clientHeight;
    scene  = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(60, w/h, 0.1, 2000);
    camera.position.z = 90;
    renderer = new THREE.WebGLRenderer({ antialias:true });
    renderer.setSize(w,h);
    renderer.setClearColor(0x040404, 1);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    el.insertBefore(renderer.domElement, el.firstChild);
    window.addEventListener('resize', () => {
      const e2=document.getElementById('module-visual'); if (!e2||!renderer) return;
      const nw=e2.clientWidth, nh=e2.clientHeight;
      camera.aspect=nw/nh; camera.updateProjectionMatrix(); renderer.setSize(nw,nh);
    });
  }

  function clearScene() {
    if (animId) cancelAnimationFrame(animId);
    if (scene) while(scene.children.length) scene.remove(scene.children[0]);
  }

  function setMode(mode) {
    currentMode=mode;
    if (!renderer) return;
    clearScene();
    camera.position.set(0,0,90); camera.lookAt(0,0,0);
    const info = document.getElementById('visual-info');
    if (info) info.textContent = mode.toUpperCase();
    switch(mode) {
      case 'particles': initParticles(); break;
      case 'alife':     initALife();     break;
      case 'field':     initField();     break;
      case 'wave':      initWave();      break;
      case 'strange':   initStrange();   break;
      case 'topology':  initTopology();  break;
    }
  }

  // ── PARTICLES ─────────────────────────────────────────────
  function initParticles() {
    const geo  = new THREE.BufferGeometry();
    pPos = new Float32Array(PARTICLE_COUNT*3);
    pVel = [];
    const pCol = new Float32Array(PARTICLE_COUNT*3);
    for (let i=0; i<PARTICLE_COUNT; i++) {
      const theta=Math.random()*Math.PI*2, phi=Math.acos(2*Math.random()-1), r=20+Math.random()*50;
      pPos[i*3]   = r*Math.sin(phi)*Math.cos(theta);
      pPos[i*3+1] = r*Math.sin(phi)*Math.sin(theta);
      pPos[i*3+2] = r*Math.cos(phi);
      pVel.push({ x:(Math.random()-.5)*.1, y:(Math.random()-.5)*.1, z:(Math.random()-.5)*.06 });
      // monochrome: white core → grey outer shell
      const t = i / PARTICLE_COUNT;
      const v = 0.55 + (1 - t) * 0.45;   // 0.55 (dim) → 1.0 (bright)
      pCol[i*3]   = v;
      pCol[i*3+1] = v;
      pCol[i*3+2] = v;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pPos,3));
    geo.setAttribute('color',    new THREE.BufferAttribute(pCol,3));
    pSystem = new THREE.Points(geo, new THREE.PointsMaterial({
      vertexColors: true, size: 0.40,
      transparent: true, opacity: 0.80,
      sizeAttenuation: true,
    }));
    scene.add(pSystem);
    let f=0;
    (function loop() {
      animId=requestAnimationFrame(loop); f++;
      const pos=pSystem.geometry.attributes.position;
      for (let i=0;i<PARTICLE_COUNT;i++) {
        const v=pVel[i], px=pos.getX(i), py=pos.getY(i), pz=pos.getZ(i);
        const ax=-px*.00015 + Math.sin(f*.003+i*.2)*.0015;
        const ay=-py*.00015 + Math.cos(f*.002+i*.3)*.0015;
        v.x=(v.x+ax)*.994; v.y=(v.y+ay)*.994; v.z=(v.z-pz*.00008)*.996;
        pos.setXYZ(i, px+v.x, py+v.y, pz+v.z);
      }
      pos.needsUpdate=true;
      pSystem.rotation.y+=.0004;
      renderer.render(scene,camera);
    })();
  }

  // ── A-LIFE boids ─────────────────────────────────────────
  function initALife() {
    const N=400;
    const agents=Array.from({length:N},()=>({
      x:(Math.random()-.5)*70, y:(Math.random()-.5)*70, z:(Math.random()-.5)*40,
      vx:(Math.random()-.5)*.4, vy:(Math.random()-.5)*.4, vz:(Math.random()-.5)*.15,
    }));
    const geo=new THREE.BufferGeometry();
    const pos=new Float32Array(N*3);
    const col=new Float32Array(N*3);
    agents.forEach((a,i)=>{ pos[i*3]=a.x; pos[i*3+1]=a.y; pos[i*3+2]=a.z; });
    geo.setAttribute('position',new THREE.BufferAttribute(pos,3));
    geo.setAttribute('color',   new THREE.BufferAttribute(col,3));
    const pts=new THREE.Points(geo,new THREE.PointsMaterial({
      vertexColors:true, size:0.6, transparent:true, opacity:.92,
      sizeAttenuation:true,
    }));
    scene.add(pts);
    const RANGE=14, MAX_SPD=0.55;
    (function loop() {
      animId=requestAnimationFrame(loop);
      const p=pts.geometry.attributes.position;
      const c=pts.geometry.attributes.color;
      for(let i=0;i<N;i++) {
        const a=agents[i]; let sx=0,sy=0,sz=0,ax=0,ay=0,az=0,cx=0,cy=0,cz=0,n=0;
        for(let j=0;j<N;j++) {
          if(i===j) continue;
          const b=agents[j],dx=b.x-a.x,dy=b.y-a.y,dz=b.z-a.z,d=Math.sqrt(dx*dx+dy*dy+dz*dz);
          if(d<RANGE&&d>0) {
            if(d<4){ sx-=dx/d*.04; sy-=dy/d*.04; sz-=dz/d*.015; }
            ax+=b.vx; ay+=b.vy; az+=b.vz;
            cx+=b.x;  cy+=b.y;  cz+=b.z; n++;
          }
        }
        if(n>0){ a.vx+=sx+ax/n*.008+(cx/n-a.x)*.0008; a.vy+=sy+ay/n*.008+(cy/n-a.y)*.0008; a.vz+=sz+az/n*.003+(cz/n-a.z)*.0003; }
        const spd=Math.sqrt(a.vx*a.vx+a.vy*a.vy+a.vz*a.vz);
        if(spd>MAX_SPD){a.vx=a.vx/spd*MAX_SPD;a.vy=a.vy/spd*MAX_SPD;a.vz=a.vz/spd*MAX_SPD;}
        a.x+=a.vx; a.y+=a.vy; a.z+=a.vz;
        if(Math.abs(a.x)>50)a.vx*=-1; if(Math.abs(a.y)>50)a.vy*=-1; if(Math.abs(a.z)>28)a.vz*=-1;
        p.setXYZ(i,a.x,a.y,a.z);
        // white=slow, blood-red=fast — vital signs
        const t=Math.min(spd/MAX_SPD, 1);
        c.setXYZ(i, 1.0, 1.0 - t*0.88, 1.0 - t*0.88);
      }
      p.needsUpdate=true;
      c.needsUpdate=true;
      renderer.render(scene,camera);
    })();
  }

  // ── VECTOR FIELD ─────────────────────────────────────────
  function initField() {
    const R=48,C=48;
    const geo=new THREE.BufferGeometry();
    const pos=new Float32Array(R*C*3);
    const col=new Float32Array(R*C*3);
    for(let r=0;r<R;r++) for(let c=0;c<C;c++){
      const i=(r*C+c)*3; pos[i]=(c-C/2)*2.4; pos[i+1]=(r-R/2)*2.4; pos[i+2]=0;
    }
    geo.setAttribute('position',new THREE.BufferAttribute(pos,3));
    geo.setAttribute('color',   new THREE.BufferAttribute(col,3));
    const pts=new THREE.Points(geo,new THREE.PointsMaterial({
      vertexColors:true, size:0.30, transparent:true, opacity:.72, sizeAttenuation:true,
    }));
    scene.add(pts);
    let t=0;
    (function loop(){
      animId=requestAnimationFrame(loop); t+=.004;
      const p=pts.geometry.attributes.position;
      const cv=pts.geometry.attributes.color;
      for(let r=0;r<R;r++) for(let c=0;c<C;c++){
        const i=r*C+c, bx=(c-C/2)*2.4, by=(r-R/2)*2.4;
        const angle=Math.atan2(by,bx)+t+Math.sin(Math.sqrt(bx*bx+by*by)*.15-t*2)*.8;
        const mag=0.4; const z=Math.sin(bx*.07-t)*Math.cos(by*.07+t*.6)*10;
        p.setXYZ(i, bx+Math.cos(angle)*mag, by+Math.sin(angle)*mag, z);
        // monochrome angle field: bright where flow is coherent, dim where chaotic
        const norm = ((angle % (Math.PI*2)) + Math.PI*2) % (Math.PI*2) / (Math.PI*2);
        const v = 0.22 + norm * 0.68;
        cv.setXYZ(i, v, v, v);
      }
      p.needsUpdate=true;
      cv.needsUpdate=true;
      camera.position.x=Math.sin(t*.2)*15; camera.position.y=Math.cos(t*.15)*8; camera.lookAt(0,0,0);
      renderer.render(scene,camera);
    })();
  }

  // ── WAVE MESH ────────────────────────────────────────────
  function initWave() {
    const W=90,H=90;
    const geo=new THREE.PlaneGeometry(120,120,W-1,H-1);
    const mat=new THREE.MeshBasicMaterial({color:0xffffff,wireframe:true,transparent:true,opacity:.15});
    scene.add(new THREE.Mesh(geo,mat));
    camera.position.set(0,65,90); camera.lookAt(0,0,0);
    let t=0;
    (function loop(){
      animId=requestAnimationFrame(loop); t+=.013;
      const pos=geo.attributes.position;
      for(let i=0;i<pos.count;i++){
        const x=pos.getX(i),y=pos.getY(i);
        pos.setZ(i, Math.sin(x*.12+t)*Math.cos(y*.1+t*.8)*5 + Math.sin(x*.05-t*.5)*Math.cos(y*.06+t*.3)*3);
      }
      pos.needsUpdate=true; geo.computeVertexNormals();
      renderer.render(scene,camera);
    })();
  }

  // ── TOPOLOGY — organic neural mesh ──────────────────────
  function initTopology() {
    const N = 55;
    const nodes = Array.from({length:N}, () => ({
      x:(Math.random()-.5)*90, y:(Math.random()-.5)*70, z:(Math.random()-.5)*35,
      vx:(Math.random()-.5)*0.10, vy:(Math.random()-.5)*0.10, vz:(Math.random()-.5)*0.04,
      pulse: Math.random() * Math.PI * 2,   // individual phase offset
      conn: [],
    }));

    // connect nodes within proximity — organic dendritic branching
    for (let i=0; i<N; i++) {
      for (let j=i+1; j<N; j++) {
        const dx=nodes[j].x-nodes[i].x, dy=nodes[j].y-nodes[i].y;
        const d=Math.sqrt(dx*dx+dy*dy);
        if (d < 28 && nodes[i].conn.length < 5 && nodes[j].conn.length < 5) {
          nodes[i].conn.push(j);
        }
      }
    }

    // node points
    const nGeo = new THREE.BufferGeometry();
    const nPos = new Float32Array(N*3);
    const nCol = new Float32Array(N*3);
    nodes.forEach((n,i)=>{ nPos[i*3]=n.x; nPos[i*3+1]=n.y; nPos[i*3+2]=n.z; nCol[i*3]=nCol[i*3+1]=nCol[i*3+2]=0.9; });
    nGeo.setAttribute('position', new THREE.BufferAttribute(nPos,3));
    nGeo.setAttribute('color',    new THREE.BufferAttribute(nCol,3));
    const nPts = new THREE.Points(nGeo, new THREE.PointsMaterial({
      vertexColors:true, size:1.1, transparent:true, opacity:0.95, sizeAttenuation:true,
    }));
    scene.add(nPts);

    // edge lines — rebuilt each frame (cheap for N=55)
    const lineGroup = new THREE.Group();
    scene.add(lineGroup);

    let t = 0;
    (function loop() {
      animId = requestAnimationFrame(loop);
      t += 0.007;

      // update node positions & colors
      const p = nPts.geometry.attributes.position;
      const c = nPts.geometry.attributes.color;
      for (let i=0; i<N; i++) {
        const n = nodes[i];
        n.x += n.vx; n.y += n.vy; n.z += n.vz;
        if (Math.abs(n.x)>52) n.vx*=-1;
        if (Math.abs(n.y)>40) n.vy*=-1;
        if (Math.abs(n.z)>22) n.vz*=-1;
        p.setXYZ(i, n.x, n.y, n.z);
        // organic heartbeat per node
        const beat = (Math.sin(t*1.1 + n.pulse) + 1) / 2;   // 0..1
        const isRed = beat > 0.88;   // rare red flash — like a synapse firing
        if (isRed) {
          c.setXYZ(i, 0.75, 0.08, 0.08);
        } else {
          const v = 0.30 + beat * 0.65;
          c.setXYZ(i, v, v, v);
        }
      }
      p.needsUpdate = true;
      c.needsUpdate = true;

      // rebuild edge lines — propagating signal
      lineGroup.clear();
      for (let i=0; i<N; i++) {
        const a = nodes[i];
        const aBeat = (Math.sin(t*1.1 + a.pulse) + 1) / 2;
        for (const j of a.conn) {
          const b = nodes[j];
          const bBeat = (Math.sin(t*1.1 + b.pulse) + 1) / 2;
          const avgBeat = (aBeat + bBeat) / 2;
          const isFiring = avgBeat > 0.82;
          const op = 0.06 + avgBeat * 0.28;
          const clr = isFiring ? 0x8b1a1a : 0xffffff;
          const geo = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(a.x, a.y, a.z),
            new THREE.Vector3(b.x, b.y, b.z),
          ]);
          lineGroup.add(new THREE.Line(geo, new THREE.LineBasicMaterial({
            color: clr, transparent: true, opacity: op,
          })));
        }
      }

      scene.rotation.y += 0.0018;
      scene.rotation.x = Math.sin(t * 0.18) * 0.12;
      renderer.render(scene, camera);
    })();
  }

  // ── STRANGE ATTRACTOR ────────────────────────────────────
  function initStrange() {
    const N=7000;
    const pos=new Float32Array(N*3);
    const col=new Float32Array(N*3);
    // Lorenz attractor
    let x=0.1,y=0,z=0; const s=10,r=28,b=8/3,dt=0.005;
    let zMin=Infinity, zMax=-Infinity;
    const raw=[];
    for(let i=0;i<N;i++){
      const dx=s*(y-x), dy=x*(r-z)-y, dz=x*y-b*z;
      x+=dx*dt; y+=dy*dt; z+=dz*dt;
      raw.push(x*1.4, y*1.4, (z-25)*1.4);
      if(z<zMin)zMin=z; if(z>zMax)zMax=z;
    }
    for(let i=0;i<N;i++){
      pos[i*3]=raw[i*3]; pos[i*3+1]=raw[i*3+1]; pos[i*3+2]=raw[i*3+2];
      // monochrome Lorenz: white outer lobe, blood-red inner transitions
      const zNorm=(raw[i*3+2]/1.4+25-zMin)/(zMax-zMin);
      // fade white → dark red at lobe crossings
      const inCrossing = zNorm > 0.40 && zNorm < 0.60;
      if (inCrossing) {
        const ct = Math.abs(zNorm - 0.5) / 0.10; // 0=center crossing, 1=edge
        col[i*3]   = 0.55 + ct * 0.40;
        col[i*3+1] = ct * 0.20;
        col[i*3+2] = ct * 0.20;
      } else {
        const v = 0.45 + zNorm * 0.50;
        col[i*3] = col[i*3+1] = col[i*3+2] = v;
      }
    }
    const geo=new THREE.BufferGeometry();
    geo.setAttribute('position',new THREE.BufferAttribute(pos,3));
    geo.setAttribute('color',   new THREE.BufferAttribute(col,3));
    scene.add(new THREE.Points(geo,new THREE.PointsMaterial({
      vertexColors:true, size:0.28, transparent:true, opacity:.72, sizeAttenuation:true,
    })));
    let t=0;
    (function loop(){
      animId=requestAnimationFrame(loop); t+=.003;
      scene.rotation.y=t*.4; scene.rotation.x=Math.sin(t*.3)*.3;
      renderer.render(scene,camera);
    })();
  }

  function onActivate() {
    render();
    if (!renderer) { initScene(); initParticles(); }
    else { setMode(currentMode); }
    Terminal.sys('VISUAL_LAB online');
  }

  function onDeactivate() { if (animId) cancelAnimationFrame(animId); }

  function getActions() {
    return [
      { label:'[ PARTICLES ]', fn:()=>setMode('particles') },
      { label:'[ A-LIFE ]',    fn:()=>setMode('alife') },
      { label:'[ FIELD ]',     fn:()=>setMode('field') },
      { label:'[ WAVE ]',      fn:()=>setMode('wave') },
      { label:'[ STRANGE ]',   fn:()=>setMode('strange') },
    ];
  }

  return { onActivate, onDeactivate, setMode, getActions };
})());

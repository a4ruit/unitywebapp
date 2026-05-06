// pack3d.js — Three.js interactive pack + pixel scatter particles
// Exposes: Pack3D.init(), Pack3D.throwPack(dir, cb), Pack3D.resetPack(), Pack3D.isReady

const Pack3D = (() => {

  // ─── State ─────────────────────────────────────────────────────────────────

  let renderer, scene, camera, packMesh, rimLight, symbolMesh, textMesh;
  let flyMeshes    = [];
  let flyStates    = [];
  let cloudMeshes  = [];
  let cloudStates  = [];
  let circleGroup  = null;
  let circleMesh   = null;
  let circleAngle  = 0;
  let animFrame;
  let isReady = false;

  // Interaction
  let isDragging   = false;
  let dragStartX   = 0;
  let dragStartY   = 0;
  let dragCurrentX = 0;
  let dragCurrentY = 0;
  let velocityX    = 0;
  let velocityY    = 0;
  let rotX         = 0.08;
  let rotY         = 0;
  let targetRotX   = 0.08;
  let targetRotY   = 0;

  // Throw state
  let isThrowing      = false;
  let throwDirX       = 0;
  let throwProgress   = 0;
  let onThrowComplete = null;

  // Particles
  let particles = [];

  // Idle bob
  let idleT = 0;
  let borderAnimFrame = 0;

  const SWIPE_THRESHOLD = 45;

  // ─── Preloaded pack art ────────────────────────────────────────────────────
  let _fleshPackImg = null;
  const _fleshPackImgLoader = new Image();
  _fleshPackImgLoader.src = 'assets/flesh-pack.png';
  _fleshPackImgLoader.onload = () => {
    _fleshPackImg = _fleshPackImgLoader;
    // If pack already rendered before image loaded, rebuild face texture now
    if (packMesh && _packTheme === 'garbage') {
      const prev = packMesh.material[4]?.map;
      const next = buildFaceTexture();
      if (packMesh.material[4]) { packMesh.material[4].map = next; packMesh.material[4].needsUpdate = true; }
      if (prev) prev.dispose();
    }
  };

  // ─── Preloaded flesh symbol ────────────────────────────────────────────────
  let _fleshSymbolImg = null;
  const _fleshSymbolImgLoader = new Image();
  _fleshSymbolImgLoader.src = 'assets/flesh-symbol.png';
  _fleshSymbolImgLoader.onload = () => {
    _fleshSymbolImg = _fleshSymbolImgLoader;
    if (packMesh && _packTheme === 'garbage') { rebuildSymbolMesh(); rebuildTextMesh(); rebuildFlyMeshes(); }
  };

  // ─── Preloaded flesh text ──────────────────────────────────────────────────
  let _fleshTextImg = null;
  const _fleshTextImgLoader = new Image();
  _fleshTextImgLoader.src = 'assets/flesh-text.png';
  _fleshTextImgLoader.onload = () => {
    _fleshTextImg = _fleshTextImgLoader;
    if (packMesh && _packTheme === 'garbage') rebuildTextMesh();
  };

  // ─── Preloaded scourge art ─────────────────────────────────────────────────
  let _scourgePackImg = null;
  const _scourgePackImgLoader = new Image();
  _scourgePackImgLoader.src = 'assets/scourge-bg.png';
  _scourgePackImgLoader.onload = () => {
    _scourgePackImg = _scourgePackImgLoader;
    if (packMesh && _packTheme === 'ewaste') {
      const prev = packMesh.material[4]?.map;
      const next = buildFaceTexture();
      if (packMesh.material[4]) { packMesh.material[4].map = next; packMesh.material[4].needsUpdate = true; }
      if (prev) prev.dispose();
    }
  };

  let _scourgeSymbolImg = null;
  const _scourgeSymbolImgLoader = new Image();
  _scourgeSymbolImgLoader.src = 'assets/scourge-symbol.png';
  _scourgeSymbolImgLoader.onload = () => {
    _scourgeSymbolImg = _scourgeSymbolImgLoader;
    if (packMesh && _packTheme === 'ewaste') { rebuildSymbolMesh(); rebuildTextMesh(); }
  };

  let _scourgeTextImg = null;
  const _scourgeTextImgLoader = new Image();
  _scourgeTextImgLoader.src = 'assets/scourge-text.png';
  _scourgeTextImgLoader.onload = () => {
    _scourgeTextImg = _scourgeTextImgLoader;
    if (packMesh && _packTheme === 'ewaste') rebuildTextMesh();
  };

  // ─── Preloaded ritual art ──────────────────────────────────────────────────
  let _ritualPackImg = null;
  const _ritualPackImgLoader = new Image();
  _ritualPackImgLoader.src = 'assets/ritual-bg.png';
  _ritualPackImgLoader.onload = () => {
    _ritualPackImg = _ritualPackImgLoader;
    if (packMesh && _packTheme === 'adpack') {
      const prev = packMesh.material[4]?.map;
      const next = buildFaceTexture();
      if (packMesh.material[4]) { packMesh.material[4].map = next; packMesh.material[4].needsUpdate = true; }
      if (prev) prev.dispose();
    }
  };

  let _ritualSymbolImg = null;
  const _ritualSymbolImgLoader = new Image();
  _ritualSymbolImgLoader.src = 'assets/ritual-symbol.png';
  _ritualSymbolImgLoader.onload = () => {
    _ritualSymbolImg = _ritualSymbolImgLoader;
    if (packMesh && _packTheme === 'adpack') rebuildSymbolMesh();
  };

  let _ritualTextImg = null;
  const _ritualTextImgLoader = new Image();
  _ritualTextImgLoader.src = 'assets/ritual-text.png';
  _ritualTextImgLoader.onload = () => {
    _ritualTextImg = _ritualTextImgLoader;
    if (packMesh && _packTheme === 'adpack') rebuildTextMesh();
  };

  function rebuildSymbolMesh() {
    if (symbolMesh) { packMesh.remove(symbolMesh); symbolMesh.geometry.dispose(); symbolMesh.material.map?.dispose(); symbolMesh.material.dispose(); symbolMesh = null; }

    let img = null, emissiveCol = 0xcc1515;
    if      (_packTheme === 'garbage' && _fleshSymbolImg)   { img = _fleshSymbolImg;   emissiveCol = 0xcc1515; }
    else if (_packTheme === 'ewaste'  && _scourgeSymbolImg) { img = _scourgeSymbolImg;  emissiveCol = 0x50c010; }
    else if (_packTheme === 'adpack'  && _ritualSymbolImg)  { img = _ritualSymbolImg;   emissiveCol = 0xc8a028; }
    if (!img) return;

    const c = document.createElement('canvas');
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const tex = new THREE.CanvasTexture(c);
    tex.needsUpdate = true;

    // Preserve natural aspect ratio so the symbol isn't squished
    const aspect = img.naturalWidth / img.naturalHeight;
    const symH = _packTheme === 'ewaste' ? 0.88 : _packTheme === 'adpack' ? 1.00 : 0.72, symW = symH * aspect;
    const geo = new THREE.PlaneGeometry(symW, symH);
    const mat = new THREE.MeshStandardMaterial({
      map: tex,
      transparent: true,
      alphaTest: 0.02,
      emissive: new THREE.Color(emissiveCol),
      emissiveIntensity: 0.35,
      roughness: 0.3,
      metalness: 0.15,
    });
    symbolMesh = new THREE.Mesh(geo, mat);
    const symY = _packTheme === 'adpack' ? 0.28 : 0.12;
    symbolMesh.position.set(0, symY, 0.09);
    packMesh.add(symbolMesh);
  }

  function rebuildTextMesh() {
    if (textMesh) { packMesh.remove(textMesh); textMesh.geometry.dispose(); textMesh.material.map?.dispose(); textMesh.material.dispose(); textMesh = null; }
    if (_packTheme !== 'garbage' && _packTheme !== 'ewaste' && _packTheme !== 'adpack') return;

    if (_packTheme === 'adpack') {
      if (!_ritualTextImg) return;

      const c = document.createElement('canvas');
      c.width = 900; c.height = 320;
      const ctx = c.getContext('2d');
      ctx.imageSmoothingEnabled = false;

      const ih = 240;
      const iw = Math.round(_ritualTextImg.naturalWidth * (ih / _ritualTextImg.naturalHeight));
      const ix = Math.round((900 - iw) / 2);
      const iy = Math.round((320 - ih) / 2);

      // Dark outline
      const tmp = document.createElement('canvas');
      tmp.width = c.width; tmp.height = c.height;
      const tCtx = tmp.getContext('2d');
      tCtx.imageSmoothingEnabled = false;
      tCtx.drawImage(_ritualTextImg, ix, iy, iw, ih);
      tCtx.globalCompositeOperation = 'source-in';
      tCtx.fillStyle = 'rgba(0,0,0,0.88)';
      tCtx.fillRect(0, 0, tmp.width, tmp.height);
      const r = 4;
      for (let dx = -r; dx <= r; dx++) {
        for (let dy = -r; dy <= r; dy++) {
          if (dx * dx + dy * dy > r * r) continue;
          ctx.drawImage(tmp, dx, dy);
        }
      }

      // Orange-tinted pass
      const tinted = document.createElement('canvas');
      tinted.width = c.width; tinted.height = c.height;
      const tCtx2 = tinted.getContext('2d');
      tCtx2.imageSmoothingEnabled = false;
      tCtx2.drawImage(_ritualTextImg, ix, iy, iw, ih);
      tCtx2.globalCompositeOperation = 'source-in';
      tCtx2.fillStyle = '#e8a040';
      tCtx2.fillRect(0, 0, tinted.width, tinted.height);

      // Glow pass
      ctx.shadowColor = 'rgba(200,80,10,0.95)'; ctx.shadowBlur = 28;
      ctx.globalAlpha = 0.6;
      ctx.drawImage(tinted, -6, -6);
      ctx.shadowBlur = 0; ctx.globalAlpha = 1;

      // Crisp tinted pass
      ctx.drawImage(tinted, 0, 0);

      const tex = new THREE.CanvasTexture(c);
      tex.needsUpdate = true;
      const geo = new THREE.PlaneGeometry(1.68, 0.60);
      const mat = new THREE.MeshStandardMaterial({
        map: tex, transparent: true, alphaTest: 0.02,
        emissive: new THREE.Color(0xc85820), emissiveIntensity: 0.25,
        roughness: 0.3, metalness: 0.1,
      });
      textMesh = new THREE.Mesh(geo, mat);
      textMesh.position.set(0, -0.92, 0.12);
      packMesh.add(textMesh);
      return;
    }

    if (_packTheme === 'ewaste') {
      if (!_scourgeTextImg) return; // wait for image

      const c = document.createElement('canvas');
      c.width = 900; c.height = 320;
      const ctx = c.getContext('2d');
      ctx.imageSmoothingEnabled = false;

      const ih = 240;
      const iw = Math.round(_scourgeTextImg.naturalWidth * (ih / _scourgeTextImg.naturalHeight));
      const ix = Math.round((900 - iw) / 2);
      const iy = Math.round((320 - ih) / 2);

      // Dark outline tracing the text shape
      const tmp = document.createElement('canvas');
      tmp.width = c.width; tmp.height = c.height;
      const tCtx = tmp.getContext('2d');
      tCtx.imageSmoothingEnabled = false;
      tCtx.drawImage(_scourgeTextImg, ix, iy, iw, ih);
      tCtx.globalCompositeOperation = 'source-in';
      tCtx.fillStyle = 'rgba(0,0,0,0.88)';
      tCtx.fillRect(0, 0, tmp.width, tmp.height);
      const r = 4;
      for (let dx = -r; dx <= r; dx++) {
        for (let dy = -r; dy <= r; dy++) {
          if (dx * dx + dy * dy > r * r) continue;
          ctx.drawImage(tmp, dx, dy);
        }
      }

      // Lime-tinted image pass
      const tinted = document.createElement('canvas');
      tinted.width = c.width; tinted.height = c.height;
      const tCtx2 = tinted.getContext('2d');
      tCtx2.imageSmoothingEnabled = false;
      tCtx2.drawImage(_scourgeTextImg, ix, iy, iw, ih);
      tCtx2.globalCompositeOperation = 'source-in';
      tCtx2.fillStyle = '#c8e840';
      tCtx2.fillRect(0, 0, tinted.width, tinted.height);

      // Glow pass
      ctx.shadowColor = 'rgba(80,200,20,0.95)'; ctx.shadowBlur = 28;
      ctx.globalAlpha = 0.6;
      ctx.drawImage(tinted, -6, -6);
      ctx.shadowBlur = 0; ctx.globalAlpha = 1;

      // Crisp tinted pass
      ctx.drawImage(tinted, 0, 0);

      const tex = new THREE.CanvasTexture(c);
      tex.needsUpdate = true;
      const geo = new THREE.PlaneGeometry(1.68, 0.60);
      const mat = new THREE.MeshStandardMaterial({
        map: tex, transparent: true, alphaTest: 0.02,
        emissive: new THREE.Color(0x50c010), emissiveIntensity: 0.25,
        roughness: 0.3, metalness: 0.1,
      });
      textMesh = new THREE.Mesh(geo, mat);
      textMesh.position.set(0, -0.50, 0.12);
      packMesh.add(textMesh);
      return;
    }

    if (!_fleshTextImg) return; // wait for image

    const c = document.createElement('canvas');
    c.width = 900; c.height = 320;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false;

    // Scale image to fill most of the canvas, centred, with red glow
    const ih = 240;
    const iw = Math.round(_fleshTextImg.naturalWidth * (ih / _fleshTextImg.naturalHeight));
    const ix = Math.round((900 - iw) / 2);
    const iy = Math.round((320 - ih) / 2);

    // Build a dark silhouette of the text on a temp canvas
    const tmp = document.createElement('canvas');
    tmp.width = c.width; tmp.height = c.height;
    const tCtx = tmp.getContext('2d');
    tCtx.imageSmoothingEnabled = false;
    tCtx.drawImage(_fleshTextImg, ix, iy, iw, ih);
    tCtx.globalCompositeOperation = 'source-in';
    tCtx.fillStyle = 'rgba(0,0,0,0.88)';
    tCtx.fillRect(0, 0, tmp.width, tmp.height);

    // Stamp silhouette at every offset within radius to trace the outline
    const r = 4;
    for (let dx = -r; dx <= r; dx++) {
      for (let dy = -r; dy <= r; dy++) {
        if (dx * dx + dy * dy > r * r) continue;
        ctx.drawImage(tmp, dx, dy);
      }
    }

    // Build bone-tinted version of the text
    const tinted = document.createElement('canvas');
    tinted.width = c.width; tinted.height = c.height;
    const tCtx2 = tinted.getContext('2d');
    tCtx2.imageSmoothingEnabled = false;
    tCtx2.drawImage(_fleshTextImg, ix, iy, iw, ih);
    tCtx2.globalCompositeOperation = 'source-in';
    tCtx2.fillStyle = '#ede0c8';
    tCtx2.fillRect(0, 0, tinted.width, tinted.height);

    // Glow pass
    ctx.shadowColor = 'rgba(200,20,20,0.95)'; ctx.shadowBlur = 28;
    ctx.globalAlpha = 0.6;
    ctx.drawImage(tinted, -6, -6);
    ctx.shadowBlur = 0; ctx.globalAlpha = 1;

    // Crisp bone-coloured pass
    ctx.drawImage(tinted, 0, 0);

    const tex = new THREE.CanvasTexture(c);
    tex.needsUpdate = true;

    // Geometry aspect 900:320 = 2.81:1
    const geo = new THREE.PlaneGeometry(1.55, 0.55);
    const mat = new THREE.MeshStandardMaterial({
      map: tex,
      transparent: true,
      alphaTest: 0.02,
      emissive: new THREE.Color(0xcc1515),
      emissiveIntensity: 0.25,
      roughness: 0.3,
      metalness: 0.1,
    });
    textMesh = new THREE.Mesh(geo, mat);
    textMesh.position.set(0, -0.38, 0.12);
    packMesh.add(textMesh);
  }

  function buildFlyTexture(wingFlap) {
    // Draw on a tiny canvas — NearestFilter keeps it blocky
    const c = document.createElement('canvas');
    c.width = 7; c.height = 7;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false;

    const p = (x, y, col) => { ctx.fillStyle = col; ctx.fillRect(x, y, 1, 1); };

    // Wings: up when flap=true, down when false
    const wy = wingFlap ? 1 : 2;
    p(0, wy,   'rgba(210,225,210,0.7)'); // left wing outer
    p(1, wy,   'rgba(210,225,210,0.9)'); // left wing inner
    p(5, wy,   'rgba(210,225,210,0.9)'); // right wing inner
    p(6, wy,   'rgba(210,225,210,0.7)'); // right wing outer

    // Head
    p(2, 1, '#1a0800');
    p(3, 1, '#1a0800');
    p(4, 1, '#1a0800');
    p(3, 0, '#1a0800');

    // Eyes
    p(2, 1, '#cc1010');
    p(4, 1, '#cc1010');

    // Body
    p(3, 2, '#0f0500');
    p(3, 3, '#0f0500');
    p(2, 3, '#0f0500');
    p(3, 4, '#0f0500');
    p(3, 5, '#150800');

    const tex = new THREE.CanvasTexture(c);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.needsUpdate = true;
    return tex;
  }

  function rebuildFlyMeshes() {
    flyMeshes.forEach(m => { packMesh.remove(m); m.geometry.dispose(); m.material.map?.dispose(); m.material.dispose(); });
    flyMeshes = []; flyStates = [];
    if (_packTheme !== 'garbage') return;

    const count = 6;
    for (let i = 0; i < count; i++) {
      const geo = new THREE.PlaneGeometry(0.11, 0.11);
      const mat = new THREE.MeshStandardMaterial({
        map: buildFlyTexture(true),
        transparent: true, alphaTest: 0.05,
        emissive: new THREE.Color(0x331100), emissiveIntensity: 0.3,
      });
      const mesh = new THREE.Mesh(geo, mat);
      const bx = (Math.random() - 0.5) * 1.1;
      const by = (Math.random() - 0.5) * 1.8;
      const bz = 0.10 + Math.random() * 0.08;
      mesh.position.set(bx, by, bz);
      packMesh.add(mesh);
      flyMeshes.push(mesh);
      flyStates.push({
        bx, by, bz,
        angle:  Math.random() * Math.PI * 2,
        speed:  0.6 + Math.random() * 1.0,
        radius: 0.04 + Math.random() * 0.10,
        phase:  Math.random() * Math.PI * 2,
        flapT:  Math.random() * Math.PI * 2,
      });
    }
  }

  // ─── Pestilence cloud meshes (scourge pack) ───────────────────────────────

  function buildCloudTexture(seed) {
    const W = 20, H = 13;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false;

    // Seeded-ish random so each cloud looks distinct
    let r = seed * 9301 + 49297;
    const rnd = () => { r = (r * 9301 + 49297) % 233280; return r / 233280; };

    const p = (x, y, a) => {
      const g = 160 + Math.floor(rnd() * 60);
      const gr = Math.floor(rnd() * 30);
      ctx.fillStyle = `rgba(${gr},${g},${Math.floor(rnd() * 20)},${a.toFixed(2)})`;
      ctx.fillRect(x, y, 1, 1);
    };

    // Cloud shape: diamond-ish blob centred at (10,6)
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const dx = (x - 10) / 9, dy = (y - 6) / 5;
        const dist = Math.sqrt(dx*dx + dy*dy);
        if (dist > 1.0) continue;
        // Core is denser, edges wispy
        const base = dist < 0.45 ? 0.55 + rnd() * 0.25
                   : dist < 0.75 ? 0.30 + rnd() * 0.25
                   :                0.08 + rnd() * 0.18;
        p(x, y, base);
      }
    }

    // Scatter a few bright highlight pixels
    for (let i = 0; i < 6; i++) {
      const hx = 4 + Math.floor(rnd() * 12);
      const hy = 2 + Math.floor(rnd() * 8);
      ctx.fillStyle = `rgba(180,255,80,${(0.15 + rnd()*0.15).toFixed(2)})`;
      ctx.fillRect(hx, hy, 1, 1);
    }

    const tex = new THREE.CanvasTexture(c);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.needsUpdate = true;
    return tex;
  }

  function rebuildCloudMeshes() {
    cloudMeshes.forEach(m => { packMesh.remove(m); m.geometry.dispose(); m.material.map?.dispose(); m.material.dispose(); });
    cloudMeshes = []; cloudStates = [];
    if (_packTheme !== 'ewaste') return;

    const configs = [
      // [bx,   by,    bz,   w,    baseOpacity]
      [ 0.50,  0.65,  0.14, 1.40, 0.58 ],  // large, top-right
      [-0.70,  0.25,  0.16, 0.60, 0.52 ],  // small, left
      [ 0.75, -0.30,  0.13, 1.10, 0.50 ],  // wide, right
      [-0.45, -0.60,  0.15, 1.60, 0.55 ],  // very large, bottom-left
      [ 0.05,  0.90,  0.17, 0.75, 0.48 ],  // medium, top-centre
      [-0.20, -0.85,  0.14, 1.20, 0.52 ],  // large, bottom
      [ 0.85,  0.10,  0.12, 0.45, 0.44 ],  // small, far right
      [-0.80,  0.70,  0.18, 0.90, 0.50 ],  // medium, top-left
      [ 0.30, -0.50,  0.16, 1.80, 0.46 ],  // very wide, bottom-centre
    ];

    configs.forEach(([bx, by, bz, w, baseOpacity], i) => {
      const geo = new THREE.PlaneGeometry(w, w * (13 / 20));
      const mat = new THREE.MeshBasicMaterial({
        map: buildCloudTexture(i + 1),
        transparent: true,
        depthWrite: false,
        opacity: baseOpacity,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(bx, by, bz);
      packMesh.add(mesh);
      cloudMeshes.push(mesh);
      cloudStates.push({
        bx, by, bz,
        pulsePhase: Math.random() * Math.PI * 2,
        pulseSpeed: 0.006 + Math.random() * 0.006,
        driftX:     (Math.random() - 0.5) * 0.0018,
        driftY:     (Math.random() - 0.5) * 0.0008,
        offsetX: 0, offsetY: 0,
        baseOpacity,
      });
    });
  }

  // ─── Ritual circle ────────────────────────────────────────────────────────

  function buildRitualCircleTexture() {
    // Small canvas + NearestFilter = chunky pixels when scaled up
    const S = 128;
    const c = document.createElement('canvas');
    c.width = S; c.height = S;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false;

    const cx = 64, cy = 64;

    // Helper: pixel-perfect circle outline via midpoint algorithm
    function pixelCircle(r, col) {
      ctx.fillStyle = col;
      let x = 0, y = r, d = 1 - r;
      while (x <= y) {
        for (const [px, py] of [
          [cx+x,cy+y],[cx-x,cy+y],[cx+x,cy-y],[cx-x,cy-y],
          [cx+y,cy+x],[cx-y,cy+x],[cx+y,cy-x],[cx-y,cy-x],
        ]) ctx.fillRect(px, py, 1, 1);
        x++;
        d += x * 2 + 1 <= 0 ? x * 2 + 1 : (d += x * 2 + 1 - y * 2 + 1, y--, x * 2 + 1 - y * 2 + 1);
        if (d <= 0) d += 2 * x + 3;
        else { d += 2 * (x - y) + 5; y--; }
      }
    }

    // Glow blooms — draw rings with heavy shadow at low opacity first
    ctx.shadowColor = 'rgba(220,80,10,1)';
    ctx.shadowBlur = 14;

    // Outer ring
    ctx.strokeStyle = '#ff6010';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(cx, cy, 60, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, 60, 0, Math.PI * 2); ctx.stroke(); // double for glow intensity

    // Inner ring
    ctx.shadowBlur = 8;
    ctx.strokeStyle = '#e8a040';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(cx, cy, 50, 0, Math.PI * 2); ctx.stroke();

    ctx.shadowBlur = 0;

    // ── Demonic symbols at 5 pentagram points on outer ring ──────────────────
    ctx.fillStyle = '#ff8030';
    ctx.shadowColor = 'rgba(255,80,0,0.9)';
    ctx.shadowBlur = 6;
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
      const mx = Math.round(cx + Math.cos(a) * 50);
      const my = Math.round(cy + Math.sin(a) * 50);
      ctx.fillRect(mx - 3, my - 2, 7, 1);
      ctx.fillRect(mx - 2, my - 1, 5, 1);
      ctx.fillRect(mx - 1, my,     3, 1);
      ctx.fillRect(mx,     my + 1, 1, 1);
    }

    // ── Dagger/cross marks at 5 inter-pentagram points ────────────────────────
    ctx.fillStyle = '#e8a040';
    ctx.shadowBlur = 4;
    for (let i = 0; i < 5; i++) {
      const a = ((i + 0.5) / 5) * Math.PI * 2 - Math.PI / 2;
      const mx = Math.round(cx + Math.cos(a) * 50);
      const my = Math.round(cy + Math.sin(a) * 50);
      ctx.fillRect(mx,     my - 3, 1, 6);
      ctx.fillRect(mx - 2, my - 1, 5, 1);
      ctx.fillRect(mx,     my + 2, 1, 2);
    }

    // ── Small eye sigils on inner ring ────────────────────────────────────────
    ctx.fillStyle = '#ff6010';
    ctx.shadowBlur = 5;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const mx = Math.round(cx + Math.cos(a) * 38);
      const my = Math.round(cy + Math.sin(a) * 38);
      ctx.fillRect(mx - 1, my,     3, 1);
      ctx.fillRect(mx,     my + 1, 1, 1);
    }

    // ── Dot ring between the two rings ────────────────────────────────────────
    ctx.fillStyle = '#c85820';
    ctx.shadowBlur = 3;
    for (let i = 0; i < 20; i++) {
      const a = (i / 20) * Math.PI * 2;
      const mx = Math.round(cx + Math.cos(a) * 44);
      const my = Math.round(cy + Math.sin(a) * 44);
      ctx.fillRect(mx, my, 1, 1);
    }

    ctx.shadowBlur = 0;
    return c;
  }

  function rebuildCircleMesh() {
    if (circleGroup) {
      packMesh.remove(circleGroup);
      if (circleMesh) { circleMesh.geometry.dispose(); circleMesh.material.map?.dispose(); circleMesh.material.dispose(); circleMesh = null; }
      circleGroup = null;
    }
    if (_packTheme !== 'adpack') return;

    const canvas = buildRitualCircleTexture();
    const tex = new THREE.CanvasTexture(canvas);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.needsUpdate = true;

    // RingGeometry avoids corner triangles that frustum-clip through the ring
    const geo = new THREE.RingGeometry(0.60, 1.26, 72);
    { // remap radial UVs → planar so the square canvas maps correctly
      const uv = geo.attributes.uv, pos = geo.attributes.position;
      for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / 2.6 + 0.5, pos.getY(i) / 2.6 + 0.5);
      uv.needsUpdate = true;
    }
    const mat = new THREE.MeshBasicMaterial({
      map: tex, transparent: true, alphaTest: 0.01,
      depthWrite: false, side: THREE.DoubleSide, opacity: 0.92,
    });
    circleMesh = new THREE.Mesh(geo, mat);
    circleMesh.rotation.x = Math.PI * 0.72;

    circleGroup = new THREE.Group();
    circleGroup.position.set(0, -0.30, 0);
    circleGroup.add(circleMesh);
    packMesh.add(circleGroup);
  }

  // ─── Scanline shard texture ────────────────────────────────────────────────

  function buildShardTexture(rarityColor) {
    const c   = document.createElement('canvas');
    c.width   = 64;
    c.height  = 96;
    const ctx = c.getContext('2d');

    // Base — dark panel
    ctx.fillStyle = '#0f160f';
    ctx.fillRect(0, 0, 64, 96);

    // Orange border
    ctx.strokeStyle = rarityColor || '#e85c1a';
    ctx.lineWidth = 2;
    ctx.strokeRect(2, 2, 60, 92);

    // Scanlines baked in
    for (let y = 0; y < 96; y += 4) {
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(0, y + 2, 64, 2);
    }

    // Diagonal grid lines — like the pack face
    ctx.strokeStyle = 'rgba(42,122,42,0.3)';
    ctx.lineWidth = 1;
    for (let x = -96; x < 128; x += 16) {
      ctx.beginPath();
      ctx.moveTo(x, 0); ctx.lineTo(x + 96, 96);
      ctx.stroke();
    }

    // Small corner brackets
    ctx.strokeStyle = rarityColor || '#e85c1a';
    ctx.lineWidth = 1.5;
    const b = 8;
    [[4,4,1,1],[60,4,-1,1],[4,92,1,-1],[60,92,-1,-1]].forEach(([x,y,sx,sy]) => {
      ctx.beginPath();
      ctx.moveTo(x, y + sy*b); ctx.lineTo(x, y); ctx.lineTo(x + sx*b, y);
      ctx.stroke();
    });

    const tex = new THREE.CanvasTexture(c);
    tex.needsUpdate = true;
    return tex;
  }

  // ─── Particle system ───────────────────────────────────────────────────────

  const RARITY_COLORS = ['#e85c1a', '#607060', '#4a8aaa', '#9a6ab8', '#c89030'];

  function spawnParticles() {
    const count = 18;

    for (let i = 0; i < count; i++) {
      const color  = RARITY_COLORS[Math.floor(Math.random() * RARITY_COLORS.length)];
      const tex    = buildShardTexture(color);

      // Thin card-like shard
      const w   = 0.18 + Math.random() * 0.22;
      const h   = w * 1.5;
      const geo = new THREE.PlaneGeometry(w, h);
      const mat = new THREE.MeshStandardMaterial({
        map: tex,
        transparent: true,
        opacity: 1,
        roughness: 0.7,
        metalness: 0.1,
        side: THREE.DoubleSide,
      });

      const mesh = new THREE.Mesh(geo, mat);

      // Start at pack position — slight z spread
      mesh.position.set(
        (Math.random() - 0.5) * 0.4,
        (Math.random() - 0.5) * 0.4,
        (Math.random() - 0.5) * 0.2
      );

      // Random velocity — outward burst
      const angle = Math.random() * Math.PI * 2;
      const speed = 0.04 + Math.random() * 0.06;
      const vx    = Math.cos(angle) * speed;
      const vy    = Math.sin(angle) * speed + 0.01; // slight upward bias
      const vz    = (Math.random() - 0.5) * 0.03;

      // Random spin
      const rx = (Math.random() - 0.5) * 0.18;
      const ry = (Math.random() - 0.5) * 0.18;
      const rz = (Math.random() - 0.5) * 0.12;

      scene.add(mesh);

      particles.push({ mesh, mat, vx, vy, vz, rx, ry, rz, life: 1.0, decay: 0.022 + Math.random() * 0.018 });
    }
  }

  function updateParticles() {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life -= p.decay;

      if (p.life <= 0) {
        scene.remove(p.mesh);
        p.mesh.geometry.dispose();
        p.mat.dispose();
        particles.splice(i, 1);
        continue;
      }

      // Move
      p.mesh.position.x += p.vx;
      p.mesh.position.y += p.vy;
      p.mesh.position.z += p.vz;

      // Gravity
      p.vy -= 0.003;

      // Spin
      p.mesh.rotation.x += p.rx;
      p.mesh.rotation.y += p.ry;
      p.mesh.rotation.z += p.rz;

      // Fade — step function for pixel feel
      const stepped = Math.floor(p.life * 8) / 8;
      p.mat.opacity  = stepped;
    }
  }

  function clearParticles() {
    particles.forEach(p => {
      scene.remove(p.mesh);
      p.mesh.geometry.dispose();
      p.mat.dispose();
    });
    particles = [];
  }

  // ─── Pack blood drips ─────────────────────────────────────────────────────
  // 32×48 canvas (PIXEL=5 aesthetic) rendered as a transparent child mesh so
  // drips rotate with the pack. Flesh pack only. Temporary — no staining.

  const PBW = 32, PBH = 48;
  let pbCanvas, pbCtx, pbTex, pbMesh;
  let pbDrips = [];
  let pbTimer = null;

  function pbBlob(cx, cy) {
    cx = Math.floor(cx); cy = Math.floor(cy);
    pbCtx.fillRect(cx, cy, 1, 1);
    if (Math.random() > 0.55) pbCtx.fillRect(cx + (Math.random() > 0.5 ? 1 : -1), cy, 1, 1);
  }

  function pbGetX(d, y) {
    return Math.floor(d.bx + Math.sin(y * d.bendFreq + d.phase) * d.bendAmp);
  }

  function pbGetW(d, y) {
    return Math.max(1, Math.round(1 + d.widthAmp * (0.5 + 0.5 * Math.sin(y * d.widthFreq + d.widthPhase))));
  }

  function spawnPackBloodDrip() {
    if (!pbCtx) return;
    const sy = 2 + Math.floor(Math.random() * 18);
    pbDrips.push({
      bx:         3 + Math.floor(Math.random() * (PBW - 6)),
      startY:     sy,
      y:          sy,
      vy:         0.007 + Math.random() * 0.010,
      phase:      Math.random() * Math.PI * 2,
      bendFreq:   0.20  + Math.random() * 0.12,
      bendAmp:    0.25  + Math.random() * 0.40,
      widthPhase: Math.random() * Math.PI * 2,
      widthFreq:  0.28  + Math.random() * 0.14,
      widthAmp:   0.15  + Math.random() * 0.25,
      maxLen:     7     + Math.floor(Math.random() * 9),
    });
  }

  function initPackBlood() {
    pbCanvas = document.createElement('canvas');
    pbCanvas.width = PBW; pbCanvas.height = PBH;
    pbCtx = pbCanvas.getContext('2d');
    pbCtx.imageSmoothingEnabled = false;

    pbTex = new THREE.CanvasTexture(pbCanvas);
    pbTex.magFilter = THREE.NearestFilter;
    pbTex.minFilter = THREE.NearestFilter;

    const geo = new THREE.PlaneGeometry(1.6, 2.4);
    const mat = new THREE.MeshBasicMaterial({ map: pbTex, transparent: true, depthWrite: false });
    pbMesh = new THREE.Mesh(geo, mat);
    pbMesh.position.z = 0.065;
    packMesh.add(pbMesh);

    rebuildPackBlood();
  }

  function rebuildPackBlood() {
    pbDrips = [];
    if (pbCtx) pbCtx.clearRect(0, 0, PBW, PBH);
    if (pbTex) pbTex.needsUpdate = true;
    clearTimeout(pbTimer);
    pbTimer = null;
    if (_packTheme !== 'garbage') return;
    function schedNext() {
      pbTimer = setTimeout(() => { spawnPackBloodDrip(); schedNext(); }, 5000 + Math.random() * 8000);
    }
    pbTimer = setTimeout(() => { spawnPackBloodDrip(); schedNext(); }, 1500 + Math.random() * 3000);
  }

  function updatePackBlood() {
    if (!pbCtx || (!pbDrips.length && _packTheme === 'garbage')) {
      if (pbTex && !pbDrips.length) { pbCtx?.clearRect(0, 0, PBW, PBH); pbTex.needsUpdate = true; }
      if (!pbDrips.length) return;
    }
    if (!pbDrips.length) return;

    pbCtx.clearRect(0, 0, PBW, PBH);

    pbDrips = pbDrips.filter(d => {
      d.y += d.vy;
      const progress = (d.y - d.startY) / d.maxLen;
      if (progress >= 1 || d.y >= PBH) return false;

      const alpha = progress > 0.6 ? 1 - (progress - 0.6) / 0.4 : 1;
      pbCtx.globalAlpha = alpha;
      pbCtx.fillStyle = `rgb(${110 + Math.floor(progress * 20)},4,4)`;

      pbBlob(pbGetX(d, d.startY), d.startY);

      const ya = Math.max(0, Math.floor(d.startY + 1));
      const yb = Math.min(PBH - 1, Math.floor(d.y - 1));
      for (let y = ya; y <= yb; y++) {
        const cx = pbGetX(d, y);
        const w  = pbGetW(d, y);
        pbCtx.fillRect(cx - Math.floor(w / 2), y, w, 1);
      }

      pbBlob(pbGetX(d, d.y), Math.floor(d.y));
      pbCtx.globalAlpha = 1;
      return true;
    });

    pbTex.needsUpdate = true;
  }

  // ─── Canvas textures ───────────────────────────────────────────────────────

  // Theme: 'garbage' = flesh/red, 'ewaste' = scourge/green, 'adpack' = gold
  let _packTheme = 'garbage';
  function setPackTheme(theme) { _packTheme = theme; }

  function themeCol(alpha = 1) {
    if (_packTheme === 'ewaste')  return `rgba(100,200,30,${alpha})`;
    if (_packTheme === 'adpack')  return `rgba(190,80,10,${alpha})`;
    return `rgba(232,92,26,${alpha})`;
  }
  function themeBg() {
    if (_packTheme === 'ewaste') return '#0a140a';
    if (_packTheme === 'adpack') return '#100804';
    return '#0f160f';
  }
  function themeGrid() {
    if (_packTheme === 'ewaste') return 'rgba(80,180,20,0.15)';
    if (_packTheme === 'adpack') return 'rgba(190,80,10,0.18)';
    return 'rgba(42,122,42,0.18)';
  }
  function themeHex() {
    if (_packTheme === 'ewaste') return '#8bc820';
    if (_packTheme === 'adpack') return '#c85820';
    return '#e85c1a';
  }
  function themeGlow() {
    if (_packTheme === 'ewaste') return 'rgba(100,200,20,0.6)';
    if (_packTheme === 'adpack') return 'rgba(190,80,10,0.85)';
    return 'rgba(232,92,26,0.6)';
  }
  function themeAccent() {
    if (_packTheme === 'ewaste') return 'rgba(140,220,40,0.5)';
    if (_packTheme === 'adpack') return 'rgba(200,90,20,0.7)';
    return 'rgba(58,170,58,0.6)';
  }

  // ─── Shared helpers ─────────────────────────────────────────────────────────

  // Draw a full-card prismatic rainbow gradient (like holo Pokémon cards)
  function drawPrismatic(ctx, w, h, alpha = 0.18, offset = 0) {
    for (let i = 0; i < 7; i++) {
      const hue  = (i / 7) * 360 + offset;
      const x0   = w * (i / 7);
      const x1   = w * ((i + 1) / 7);
      const grad = ctx.createLinearGradient(x0, 0, x1, h);
      grad.addColorStop(0,   `hsla(${hue},100%,60%,${alpha})`);
      grad.addColorStop(0.5, `hsla(${(hue+30)%360},100%,75%,${alpha * 1.3})`);
      grad.addColorStop(1,   `hsla(${(hue+60)%360},100%,60%,${alpha})`);
      ctx.fillStyle = grad;
      ctx.fillRect(x0, 0, x1 - x0 + 1, h);
    }
  }

  // Draw starburst / crystal sparkle at cx,cy
  function drawSparkle(ctx, cx, cy, r, col, alpha) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.globalAlpha = alpha;
    const arms = 4;
    for (let i = 0; i < arms; i++) {
      ctx.save();
      ctx.rotate((i / arms) * Math.PI * 2);
      const g = ctx.createLinearGradient(0, -r, 0, r);
      g.addColorStop(0,   `rgba(255,255,255,0)`);
      g.addColorStop(0.5, col);
      g.addColorStop(1,   `rgba(255,255,255,0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(-r*0.06, 0); ctx.lineTo(0, -r);
      ctx.lineTo(r*0.06, 0);  ctx.lineTo(0, r);
      ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    // Hot centre
    ctx.beginPath(); ctx.arc(0, 0, r * 0.12, 0, Math.PI*2);
    ctx.fillStyle = 'white'; ctx.fill();
    ctx.restore();
  }

  // Multi-layer glow border
  function drawGlowBorder(ctx, x, y, w, h, col, glowCol) {
    // Outer glow layers
    [12, 8, 4].forEach((blur, i) => {
      ctx.save();
      ctx.shadowColor = glowCol; ctx.shadowBlur = blur;
      ctx.strokeStyle = col; ctx.lineWidth = 2 - i * 0.4;
      ctx.strokeRect(x, y, w, h);
      ctx.restore();
    });
    // Solid border
    ctx.strokeStyle = col; ctx.lineWidth = 3;
    ctx.shadowColor = glowCol; ctx.shadowBlur = 6;
    ctx.strokeRect(x, y, w, h);
    ctx.shadowBlur = 0;
  }

  function buildFaceTexture(animT = 0) {
    const W = 256, H = 384;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const ctx = c.getContext('2d');

    // ── BASE BACKGROUND ───────────────────────────────────────────────────────

    if (_packTheme === 'garbage') {
      // Flesh pack art base
      if (_fleshPackImg) {
        ctx.drawImage(_fleshPackImg, 0, 0, W, H);
      } else {
        ctx.fillStyle = '#0d0505';
        ctx.fillRect(0, 0, W, H);
      }
      // Blood-red prismatic sheen over the art
      drawPrismatic(ctx, W, H, 0.06, 0);

    } else if (_packTheme === 'ewaste') {
      // Scourge bg art
      if (_scourgePackImg) {
        ctx.drawImage(_scourgePackImg, 0, 0, W, H);
      } else {
        ctx.fillStyle = '#0a140a';
        ctx.fillRect(0, 0, W, H);
      }

    } else if (_packTheme === 'adpack') {
      if (_ritualPackImg) {
        ctx.drawImage(_ritualPackImg, 0, 0, W, H);
      } else {
        ctx.fillStyle = '#12100a';
        ctx.fillRect(0, 0, W, H);
      }
    }

    // ── SCANLINES ─────────────────────────────────────────────────────────────
    for (let y = 0; y < H; y += 4) {
      ctx.fillStyle = 'rgba(0,0,0,0.1)';
      ctx.fillRect(0, y+2, W, 2);
    }

    // ── OUTER GLOW BORDER ─────────────────────────────────────────────────────
    if (_packTheme === 'adpack') {
      drawGlowBorder(ctx, 4, 4, W-8, H-8, '#c85820', 'rgba(190,80,10,0.8)');
      ctx.strokeStyle = 'rgba(190,80,10,0.3)'; ctx.lineWidth = 1;
      ctx.strokeRect(10, 10, W-20, H-20);

    } else if (_packTheme === 'ewaste') {
      drawGlowBorder(ctx, 4, 4, W-8, H-8, '#8bc820', 'rgba(100,200,20,0.8)');
      ctx.strokeStyle = 'rgba(140,220,40,0.3)'; ctx.lineWidth = 1;
      ctx.strokeRect(10, 10, W-20, H-20);
      drawPrismatic(ctx, W, H, 0.05, 100);

    } else {
      drawGlowBorder(ctx, 4, 4, W-8, H-8, '#cc1515', 'rgba(200,20,20,0.7)');
      ctx.strokeStyle = 'rgba(200,20,20,0.3)'; ctx.lineWidth = 1;
      ctx.strokeRect(10, 10, W-20, H-20);
    }

    // ── CORNER BRACKETS ───────────────────────────────────────────────────────
    const bPad = 16, bSize = 20, bW = 3;
    const bracketCol = _packTheme === 'adpack' ? '#c85820' : _packTheme === 'ewaste' ? '#8bc820' : '#cc1515';
    ctx.strokeStyle = bracketCol; ctx.lineWidth = bW;
    ctx.shadowColor = bracketCol; ctx.shadowBlur = 8;
    [[bPad,bPad,1,1],[W-bPad,bPad,-1,1],[bPad,H-bPad,1,-1],[W-bPad,H-bPad,-1,-1]].forEach(([x,y,sx,sy]) => {
      ctx.beginPath(); ctx.moveTo(x, y+sy*bSize); ctx.lineTo(x,y); ctx.lineTo(x+sx*bSize,y); ctx.stroke();
    });
    ctx.shadowBlur = 0;

    // ── SPARKLES ──────────────────────────────────────────────────────────────
    // Flesh, scourge + ritual use meshes instead of canvas sparkles
    if (_packTheme === 'garbage' || _packTheme === 'ewaste' || _packTheme === 'adpack') { /* skipped */ }
    else {
      const sparkleCount = _packTheme === 'adpack' ? 12 : 8;
    const sparklePositions = [
      [40,60],[216,60],[40,324],[216,324],
      [128,40],[128,344],[20,192],[236,192],
      [70,120],[186,120],[70,264],[186,264],
      [128,192],[55,192],
    ].slice(0, sparkleCount);
    const sparkleColors = _packTheme === 'adpack'
      ? ['rgba(255,220,80,0.9)','rgba(255,255,255,0.95)','rgba(255,180,0,0.8)','rgba(200,255,100,0.7)','rgba(100,200,255,0.7)','rgba(255,100,200,0.7)']
      : _packTheme === 'ewaste'
      ? ['rgba(140,220,40,0.9)','rgba(255,255,255,0.9)','rgba(80,200,20,0.8)','rgba(200,240,60,0.7)']
      : ['rgba(200,20,20,0.85)','rgba(255,255,255,0.9)','rgba(160,10,10,0.7)'];
    sparklePositions.forEach(([sx,sy], i) => {
      const col   = sparkleColors[i % sparkleColors.length];
      const size  = _packTheme === 'adpack' ? 16 + (i%3)*5 : 12 + (i%3)*4;
      const alpha = _packTheme === 'adpack' ? 0.55 + (i%3)*0.08 : 0.7 + (i%3)*0.1;
      drawSparkle(ctx, sx, sy, size, col, alpha);
    });
    } // end non-garbage sparkles

    // ── CENTRAL ICON ──────────────────────────────────────────────────────────
    const iconY = 196;
    const ringY = iconY - 26;
    const icon  = _packTheme === 'ewaste' ? '⬡' : _packTheme === 'adpack' ? '★' : '◈';

    // Ritual uses symbol mesh — skip canvas icon entirely
    if (_packTheme !== 'garbage' && _packTheme !== 'ewaste' && _packTheme !== 'adpack') {
      ctx.font = 'bold 72px "VT323", monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = themeHex();
      ctx.shadowColor = themeGlow(); ctx.shadowBlur = 20;
      ctx.fillText(_packTheme === 'ewaste' ? '⬡' : '◈', 128, 196);
      ctx.shadowBlur = 0;
    }

    // Ritual: no title text for now; other non-flesh/scourge packs get text
    if (_packTheme !== 'garbage' && _packTheme !== 'ewaste' && _packTheme !== 'adpack') {
      const packName = 'PACK';
      ctx.font = '22px "lo-res", sans-serif'; ctx.textAlign = 'center';
      ctx.fillStyle = '#e8e0c8';
      ctx.shadowColor = themeGlow(); ctx.shadowBlur = 6;
      ctx.fillText(packName, 128, 222);
      ctx.shadowBlur = 0;
    }

    if (_packTheme !== 'garbage' && _packTheme !== 'ewaste' && _packTheme !== 'adpack') {
      ctx.font = '11px "lo-res", sans-serif';
      ctx.fillStyle = 'rgba(232,224,200,0.35)';
      ctx.fillText('4 cards inside', 128, 264);

      ctx.font = '11px "lo-res", sans-serif';
      ctx.fillStyle = themeAccent();
      ctx.fillText('← swipe to open →', 128, 352);
    }

    const tex = new THREE.CanvasTexture(c);
    tex.needsUpdate = true;
    return tex;
  }

  function buildBackTexture() {
    const W = 256, H = 384;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const ctx = c.getContext('2d');

    // Background
    const bgCol = _packTheme === 'ewaste' ? '#060c18' : _packTheme === 'adpack' ? '#0a0702' : '#080e08';
    ctx.fillStyle = bgCol; ctx.fillRect(0, 0, W, H);

    // Prismatic sheen on back too
    if (_packTheme === 'adpack') {
      ctx.strokeStyle = 'rgba(190,80,10,0.1)'; ctx.lineWidth = 2;
      for (let x = -H; x < W+H; x += 16) {
        ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x+H,H); ctx.stroke();
      }
    } else if (_packTheme === 'ewaste') {
      drawPrismatic(ctx, W, H, 0.05, 200);
      ctx.strokeStyle = 'rgba(40,100,220,0.1)'; ctx.lineWidth = 1;
      for (let y = 16; y < H; y += 24) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke(); }
      for (let x = 16; x < W; x += 24) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,H); ctx.stroke(); }
    } else {
      ctx.strokeStyle = 'rgba(42,122,42,0.1)'; ctx.lineWidth = 1;
      for (let x = -H; x < W+H; x += 24) {
        ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x+H,H); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x+H,0); ctx.lineTo(x,H); ctx.stroke();
      }
    }

    // Scanlines
    for (let y = 0; y < H; y += 4) {
      ctx.fillStyle = 'rgba(0,0,0,0.1)'; ctx.fillRect(0, y+2, W, 2);
    }

    // Border
    if (_packTheme === 'adpack') {
      ctx.strokeStyle = '#c85820'; ctx.lineWidth = 4;
      ctx.shadowColor = 'rgba(190,80,10,0.6)'; ctx.shadowBlur = 8;
      ctx.strokeRect(6, 6, W-12, H-12);
      ctx.shadowBlur = 0;
      ctx.strokeStyle = 'rgba(190,80,10,0.25)'; ctx.lineWidth = 1;
      ctx.strokeRect(12, 12, W-24, H-24);
    } else {
      ctx.strokeStyle = themeHex(); ctx.lineWidth = 4;
      ctx.shadowColor = themeGlow(); ctx.shadowBlur = 10;
      ctx.strokeRect(6, 6, W-12, H-12);
      ctx.shadowBlur = 0;
    }

    // Corner sparkles on back
    const bkSparkleCol = _packTheme === 'adpack' ? 'rgba(190,80,10,0.8)' : _packTheme === 'ewaste' ? 'rgba(0,200,255,0.8)' : 'rgba(232,92,26,0.7)';
    [[30,40],[226,40],[30,344],[226,344]].forEach(([sx,sy]) => {
      drawSparkle(ctx, sx, sy, 14, bkSparkleCol, 0.6);
    });

    // Centre text
    ctx.font = '44px "VT323", monospace';
    ctx.textAlign = 'center';
    if (_packTheme === 'adpack') {
      ctx.fillStyle = 'rgba(190,80,10,0.3)';
    } else {
      ctx.fillStyle = themeCol(0.22);
    }
    ctx.fillText(_packTheme === 'ewaste' ? 'SCOURGE' : _packTheme === 'adpack' ? 'RITUAL' : 'FLESH', 128, 200);

    const tex = new THREE.CanvasTexture(c);
    tex.needsUpdate = true;
    return tex;
  }

  // ─── Init ──────────────────────────────────────────────────────────────────

  function init() {
    const wrap = document.getElementById('packCanvas');
    if (!wrap) return;

    const W = wrap.clientWidth  || 240;
    const H = wrap.clientHeight || 320;

    renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(W, H);
    renderer.setClearColor(0x000000, 0);
    wrap.appendChild(renderer.domElement);

    scene  = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(35, W / H, 0.1, 100);
    camera.position.set(0, 0, 5.5);

    const ambient = new THREE.AmbientLight(0x1a2a1a, 0.8);
    scene.add(ambient);

    rimLight = new THREE.PointLight(0xe85c1a, 2.5, 10);
    rimLight.position.set(0, -2.5, 1.5);
    scene.add(rimLight);
    // Second fill light for premium sheen
    const fillLight = new THREE.PointLight(0xffffff, 0.8, 8);
    fillLight.position.set(0, 3, 2);
    scene.add(fillLight);

    const topLight = new THREE.DirectionalLight(0x3aaa3a, 0.4);
    topLight.position.set(0, 3, 2);
    scene.add(topLight);

    const frontLight = new THREE.DirectionalLight(0xffffff, 0.3);
    frontLight.position.set(0, 0, 5);
    scene.add(frontLight);

    const W_pack = 1.6, H_pack = 2.4, D_pack = 0.12;
    const geo = new THREE.BoxGeometry(W_pack, H_pack, D_pack);

    const faceTex = buildFaceTexture();
    const backTex = buildBackTexture();

    const edgeMat = new THREE.MeshStandardMaterial({
      color: 0x0f160f, emissive: 0xe85c1a, emissiveIntensity: 0.15,
      roughness: 0.8, metalness: 0.1,
    });
    const frontMat = new THREE.MeshStandardMaterial({ map: faceTex, roughness: 0.75, metalness: 0.05 });
    const backMat  = new THREE.MeshStandardMaterial({ map: backTex,  roughness: 0.8,  metalness: 0.05 });

    packMesh = new THREE.Mesh(geo, [edgeMat, edgeMat, edgeMat, edgeMat, frontMat, backMat]);
    scene.add(packMesh);

    rebuildSymbolMesh();
    rebuildTextMesh();
    rebuildFlyMeshes();
    rebuildCloudMeshes();
    rebuildCircleMesh();
    initPackBlood();
    attachEvents(wrap);
    isReady = true;
    animate();
  }

  // ─── Animation loop ────────────────────────────────────────────────────────

  function animate() {
    animFrame = requestAnimationFrame(animate);
    idleT += 0.012;
    borderAnimFrame++;

    if (isThrowing) {
      throwProgress += 0.045;
      const t  = throwProgress;
      packMesh.position.x = throwDirX * t * 4.5;
      packMesh.position.y = Math.sin(t * Math.PI) * 0.4 - t * 1.2;
      packMesh.rotation.z += throwDirX * 0.06;
      packMesh.rotation.x += 0.02;

      const fade = Math.max(0, 1 - throwProgress * 1.4);
      packMesh.material?.forEach?.(m => {
        if (m.emissiveIntensity !== undefined) m.emissiveIntensity = 0.15 * fade;
      });

      // Spawn particles at the moment of throw
      if (throwProgress > 0.1 && throwProgress < 0.15 && particles.length === 0) {
        spawnParticles();
      }

      if (throwProgress >= 0.85 && onThrowComplete) {
        isThrowing = false;
        onThrowComplete();
        onThrowComplete = null;
      }

    } else if (!isDragging) {
      const idleRotY = Math.sin(idleT * 0.7) * 0.06;
      const idleRotX = 0.08 + Math.cos(idleT * 0.5) * 0.02;
      targetRotY = idleRotY;
      targetRotX = idleRotX;
      packMesh.position.y = Math.sin(idleT * 0.9) * 0.04;

      rotX = lerp(rotX, targetRotX, 0.06);
      rotY = lerp(rotY, targetRotY, 0.06);
      packMesh.rotation.x = rotX;
      packMesh.rotation.y = rotY;

    } else {
      rotX = lerp(rotX, targetRotX, 0.18);
      rotY = lerp(rotY, targetRotY, 0.18);
      packMesh.rotation.x = rotX;
      packMesh.rotation.y = rotY;
    }

    // Float symbol and text meshes independently above the pack face
    if (symbolMesh) {
      symbolMesh.position.y = 0.12 + Math.sin(idleT * 1.5) * 0.055;
      symbolMesh.position.z = 0.09 + Math.sin(idleT * 0.9) * 0.018;
      symbolMesh.rotation.z = Math.sin(idleT * 0.55) * 0.06;
    }
    if (textMesh) {
      textMesh.position.y = -0.38 + Math.sin(idleT * 1.5 + 0.4) * 0.04;
      textMesh.position.z = 0.12 + Math.sin(idleT * 0.9 + 0.3) * 0.012;
    }

    // Fly swarm animation
    flyMeshes.forEach((m, i) => {
      const s = flyStates[i];
      s.angle += s.speed * 0.02;
      s.flapT += 0.18;
      m.position.x = s.bx + Math.cos(s.angle) * s.radius;
      m.position.y = s.by + Math.sin(s.angle * 1.3 + s.phase) * s.radius * 0.7;
      m.position.z = s.bz + Math.sin(s.angle * 0.6 + s.phase) * 0.02;
      // Wing flap — rebuild texture at low frequency to avoid GPU thrash
      if (Math.floor(s.flapT) % 4 === 0 && Math.floor(s.flapT) !== m._lastFlap) {
        m._lastFlap = Math.floor(s.flapT);
        const prev = m.material.map;
        m.material.map = buildFlyTexture(Math.floor(s.flapT / 2) % 2 === 0);
        m.material.needsUpdate = true;
        if (prev) prev.dispose();
      }
    });

    // Ritual circle spin
    if (circleGroup && _packTheme === 'adpack') {
      circleAngle += 0.004;
      circleGroup.rotation.y = circleAngle;
      circleGroup.position.y = -0.30 + Math.sin(idleT * 0.5) * 0.06;
    }

    // Pestilence cloud animation
    cloudMeshes.forEach((m, i) => {
      const s = cloudStates[i];
      s.pulsePhase += s.pulseSpeed;
      s.offsetX    += s.driftX;
      s.offsetY    += s.driftY;
      // Soft bounce at edges so clouds stay near the pack
      if (Math.abs(s.bx + s.offsetX) > 0.9) s.driftX *= -1;
      if (Math.abs(s.by + s.offsetY) > 1.2) s.driftY *= -1;
      m.position.x = s.bx + s.offsetX;
      m.position.y = s.by + s.offsetY;
      m.material.opacity = s.baseOpacity * (0.55 + 0.45 * Math.sin(s.pulsePhase));
    });

    updateParticles();
    updatePackBlood();

    const baseIntensity = _packTheme === 'adpack' ? 3.1 : _packTheme === 'ewaste' ? 2.8 : 2.5;
    rimLight.intensity = baseIntensity + Math.sin(idleT * 1.2) * (baseIntensity * 0.15);

    if (packMesh) {
      packMesh.scale.set(1, 1, 1);
    }
    renderer.render(scene, camera);
  }

  function lerp(a, b, t) { return a + (b - a) * t; }

  // ─── Interaction ───────────────────────────────────────────────────────────

  function attachEvents(el) {
    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove',  onTouchMove,  { passive: true });
    el.addEventListener('touchend',   onTouchEnd,   { passive: true });
    el.addEventListener('mousedown',  onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup',   onMouseUp);
  }

  function onTouchStart(e) { if (isThrowing) return; const t = e.touches[0]; startDrag(t.clientX, t.clientY); }
  function onTouchMove(e)  { if (!isDragging) return; const t = e.touches[0]; moveDrag(t.clientX, t.clientY); }
  function onTouchEnd(e)   { if (!isDragging) return; const t = e.changedTouches[0]; endDrag(t.clientX, t.clientY); }
  function onMouseDown(e)  { if (isThrowing) return; startDrag(e.clientX, e.clientY); }
  function onMouseMove(e)  { if (!isDragging) return; moveDrag(e.clientX, e.clientY); }
  function onMouseUp(e)    { if (!isDragging) return; endDrag(e.clientX, e.clientY); }

  function startDrag(x, y) {
    isDragging = true; dragStartX = x; dragStartY = y;
    dragCurrentX = x; dragCurrentY = y; velocityX = 0; velocityY = 0;
  }

  function moveDrag(x, y) {
    const prevX = dragCurrentX; const prevY = dragCurrentY;
    dragCurrentX = x; dragCurrentY = y;
    velocityX = x - prevX; velocityY = y - prevY;
    const dx = x - dragStartX; const dy = y - dragStartY;
    targetRotY = Math.max(-0.5, Math.min(0.5, dx * 0.012));
    targetRotX = Math.max(-0.2, Math.min(0.35, 0.08 - dy * 0.008));
  }

  function endDrag(x, y) {
    isDragging = false;
    const totalDX = x - dragStartX;
    const totalDY = y - dragStartY;
    const isHorizontal = Math.abs(totalDX) > Math.abs(totalDY) * 1.5;
    const isFast = Math.abs(velocityX) > 4;

    if (isHorizontal && (Math.abs(totalDX) > SWIPE_THRESHOLD || isFast)) {
      document.dispatchEvent(new CustomEvent('pack3d:swipe', { detail: { dir: totalDX < 0 ? -1 : 1 } }));
    } else {
      targetRotY = 0; targetRotX = 0.08;
    }
  }

  // ─── Public API ────────────────────────────────────────────────────────────

  function throwPack(dir, callback) {
    isThrowing    = true;
    throwDirX     = dir;
    throwProgress = 0;
    onThrowComplete = callback;
  }

  function resetPack() {
    if (!packMesh) return;
    isThrowing = false; throwProgress = 0;
    packMesh.position.set(0, 0, 0);
    packMesh.rotation.set(0.08, 0, 0);
    rotX = 0.08; rotY = 0; targetRotX = 0.08; targetRotY = 0;
    // Rebuild textures with current theme
    const faceTex = buildFaceTexture();
    const backTex = buildBackTexture();
    if (packMesh.material[4]) packMesh.material[4].map = faceTex;
    if (packMesh.material[5]) packMesh.material[5].map = backTex;
    packMesh.material.forEach(m => {
      if (m.emissiveIntensity !== undefined) m.emissiveIntensity = 0.15;
      m.needsUpdate = true;
    });
    // Update rim light colour
    if (rimLight) {
      if (_packTheme === 'adpack') {
        rimLight.color.setStyle('#c85820');
        rimLight.intensity = 3.1;
      } else if (_packTheme === 'ewaste') {
        rimLight.color.setStyle('#8bc820');
        rimLight.intensity = 3.0;
      } else {
        rimLight.color.setStyle('#e85c1a');
        rimLight.intensity = 2.5;
      }
    }
    rebuildSymbolMesh();
    rebuildTextMesh();
    rebuildFlyMeshes();
    rebuildCloudMeshes();
    rebuildCircleMesh();
    rebuildPackBlood();
    clearParticles();
  }

  function destroy() {
    cancelAnimationFrame(animFrame);
    if (symbolMesh) { packMesh?.remove(symbolMesh); symbolMesh.geometry.dispose(); symbolMesh.material.map?.dispose(); symbolMesh.material.dispose(); symbolMesh = null; }
    if (textMesh)   { packMesh?.remove(textMesh);   textMesh.geometry.dispose();   textMesh.material.map?.dispose();   textMesh.material.dispose();   textMesh = null; }
    flyMeshes.forEach(m => { packMesh?.remove(m); m.geometry.dispose(); m.material.map?.dispose(); m.material.dispose(); });
    flyMeshes = []; flyStates = [];
    cloudMeshes.forEach(m => { packMesh?.remove(m); m.geometry.dispose(); m.material.map?.dispose(); m.material.dispose(); });
    cloudMeshes = []; cloudStates = [];
    if (circleGroup) { packMesh?.remove(circleGroup); if (circleMesh) { circleMesh.geometry.dispose(); circleMesh.material.map?.dispose(); circleMesh.material.dispose(); } circleGroup = null; circleMesh = null; }
    clearTimeout(pbTimer); pbTimer = null; pbDrips = [];
    if (pbMesh) { packMesh?.remove(pbMesh); pbMesh.geometry.dispose(); pbMesh.material.map?.dispose(); pbMesh.material.dispose(); pbMesh = null; }
    pbTex = null; pbCtx = null; pbCanvas = null;
    clearParticles();
    renderer?.dispose();
  }

  return { init, throwPack, resetPack, destroy, setPackTheme, get isReady() { return isReady; } };
})();
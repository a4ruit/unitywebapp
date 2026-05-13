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

  // ─── Glitch transition: nature → flesh ─────────────────────────────────────
  let glitchActive   = false;
  let glitchStart    = 0;
  let glitchFlipDone = false;
  let glitchOverlay  = null;
  let glitchOvCtx    = null;
  const GLITCH_DUR   = 3000; // ms total

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

  // ─── Preloaded critter art (ewaste phase, corruption < 6) ────────────────────
  let _critterPackImg = null;
  const _critterPackImgLoader = new Image();
  _critterPackImgLoader.src = 'assets/critter-pack.png';
  _critterPackImgLoader.onload = () => {
    _critterPackImg = _critterPackImgLoader;
    if (packMesh && _packTheme === 'ewaste' && isCritterPhase()) {
      const prev = packMesh.material[4]?.map;
      const next = buildFaceTexture();
      if (packMesh.material[4]) { packMesh.material[4].map = next; packMesh.material[4].needsUpdate = true; }
      if (prev) prev.dispose();
    }
  };

  let _critterSymbolImg = null;
  const _critterSymbolImgLoader = new Image();
  _critterSymbolImgLoader.src = 'assets/critter-symbol.png';
  _critterSymbolImgLoader.onload = () => {
    _critterSymbolImg = _critterSymbolImgLoader;
    if (packMesh && _packTheme === 'ewaste' && isCritterPhase()) { rebuildSymbolMesh(); rebuildTextMesh(); }
  };

  let _critterTextImg = null;
  const _critterTextImgLoader = new Image();
  _critterTextImgLoader.src = 'assets/critter-text.png';
  _critterTextImgLoader.onload = () => {
    _critterTextImg = _critterTextImgLoader;
    if (packMesh && _packTheme === 'ewaste' && isCritterPhase()) rebuildTextMesh();
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

  // ─── Preloaded nature art ──────────────────────────────────────────────────
  let _naturePackImg = null;
  const _naturePackImgLoader = new Image();
  _naturePackImgLoader.src = 'assets/nature-bg.png';
  _naturePackImgLoader.onload = () => {
    _naturePackImg = _naturePackImgLoader;
    if (packMesh && _packTheme === 'garbage' && isNaturePhase()) {
      const prev = packMesh.material[4]?.map;
      const next = buildFaceTexture();
      if (packMesh.material[4]) { packMesh.material[4].map = next; packMesh.material[4].needsUpdate = true; }
      if (prev) prev.dispose();
    }
  };

  let _natureSymbolImg = null;
  const _natureSymbolImgLoader = new Image();
  _natureSymbolImgLoader.src = 'assets/nature-symbol.png';
  _natureSymbolImgLoader.onload = () => {
    _natureSymbolImg = _natureSymbolImgLoader;
    if (packMesh && _packTheme === 'garbage' && isNaturePhase()) rebuildSymbolMesh();
  };

  let _natureTextImg = null;
  const _natureTextImgLoader = new Image();
  _natureTextImgLoader.src = 'assets/nature-text.png';
  _natureTextImgLoader.onload = () => {
    _natureTextImg = _natureTextImgLoader;
    if (packMesh && _packTheme === 'garbage' && isNaturePhase()) rebuildTextMesh();
  };

  // ─── Preloaded fungi art (adpack phase, corruption < 6) ──────────────────
  let _fungiPackImg = null;
  const _fungiPackImgLoader = new Image();
  _fungiPackImgLoader.src = 'assets/fungi-pack.png';
  _fungiPackImgLoader.onload = () => {
    _fungiPackImg = _fungiPackImgLoader;
    if (packMesh && _packTheme === 'adpack' && isFungiPhase()) {
      const prev = packMesh.material[4]?.map;
      const next = buildFaceTexture();
      if (packMesh.material[4]) { packMesh.material[4].map = next; packMesh.material[4].needsUpdate = true; }
      if (prev) prev.dispose();
    }
  };

  let _fungiSymbolImg = null;
  const _fungiSymbolImgLoader = new Image();
  _fungiSymbolImgLoader.src = 'assets/fungi-symbol.png';
  _fungiSymbolImgLoader.onload = () => {
    _fungiSymbolImg = _fungiSymbolImgLoader;
    if (packMesh && _packTheme === 'adpack' && isFungiPhase()) { rebuildSymbolMesh(); rebuildTextMesh(); }
  };

  let _fungiTextImg = null;
  const _fungiTextImgLoader = new Image();
  _fungiTextImgLoader.src = 'assets/fungi-text.png';
  _fungiTextImgLoader.onload = () => {
    _fungiTextImg = _fungiTextImgLoader;
    if (packMesh && _packTheme === 'adpack' && isFungiPhase()) rebuildTextMesh();
  };

  // ─── Preloaded ritual art ──────────────────────────────────────────────────
  let _ritualPackImg = null;
  const _ritualPackImgLoader = new Image();
  _ritualPackImgLoader.src = 'assets/ritual-bg-purp.png';
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
    if (_packTheme === 'garbage') {
      if      (isNaturePhase() && _natureSymbolImg) { img = _natureSymbolImg; emissiveCol = 0x81d4fa; }
      else if (_fleshSymbolImg)                      { img = _fleshSymbolImg;  emissiveCol = 0xcc1515; }
    }
    else if (_packTheme === 'ewaste') {
      if (isCritterPhase() && _critterSymbolImg) { img = _critterSymbolImg; emissiveCol = 0xf0b8d0; }
      else if (_scourgeSymbolImg)                 { img = _scourgeSymbolImg; emissiveCol = 0x50c010; }
    }
    else if (_packTheme === 'adpack') {
      if (isFungiPhase() && _fungiSymbolImg)  { img = _fungiSymbolImg;  emissiveCol = 0xd4a870; }
      else if (_ritualSymbolImg)               { img = _ritualSymbolImg; emissiveCol = 0x8030c0; }
    }
    if (!img) return;

    const c = document.createElement('canvas');
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const tex = new THREE.CanvasTexture(c);
    tex.needsUpdate = true;

    // Preserve natural aspect ratio so the symbol isn't squished
    const aspect = img.naturalWidth / img.naturalHeight;
    const symH = isCritterPhase() ? 0.80 : isFungiPhase() ? 0.85 : _packTheme === 'ewaste' ? 0.88 : _packTheme === 'adpack' ? 1.00 : isNaturePhase() ? 0.80 : 0.72, symW = symH * aspect;
    const geo = new THREE.PlaneGeometry(symW, symH);
    const mat = new THREE.MeshStandardMaterial({
      map: tex,
      transparent: true,
      alphaTest: 0.02,
      emissive: new THREE.Color(emissiveCol),
      emissiveIntensity: (isCritterPhase() || isFungiPhase()) ? 0.08 : 0.35,
      roughness:         (isCritterPhase() || isFungiPhase()) ? 0.85 : 0.3,
      metalness:         (isCritterPhase() || isFungiPhase()) ? 0.0  : 0.15,
    });
    symbolMesh = new THREE.Mesh(geo, mat);
    const symY = _packTheme === 'adpack' ? 0.28 : 0.12;
    symbolMesh.position.set(0, symY, 0.09);
    packMesh.add(symbolMesh);
  }

  function rebuildTextMesh() {
    if (textMesh) { packMesh.remove(textMesh); textMesh.geometry.dispose(); textMesh.material.map?.dispose(); textMesh.material.dispose(); textMesh = null; }
    if (_packTheme !== 'garbage' && _packTheme !== 'ewaste' && _packTheme !== 'adpack') return;

    if (_packTheme === 'adpack' && isFungiPhase()) {
      if (!_fungiTextImg) return;
      const c = document.createElement('canvas'); c.width = 900; c.height = 320;
      const ctx = c.getContext('2d'); ctx.imageSmoothingEnabled = false;
      const ih = 240;
      const iw = Math.round(_fungiTextImg.naturalWidth * (ih / _fungiTextImg.naturalHeight));
      const ix = Math.round((900 - iw) / 2), iy = Math.round((320 - ih) / 2);
      // Fully-opaque black silhouette for thick outline
      const tmp = document.createElement('canvas'); tmp.width = 900; tmp.height = 320;
      const tCtx = tmp.getContext('2d'); tCtx.imageSmoothingEnabled = false;
      tCtx.drawImage(_fungiTextImg, ix, iy, iw, ih);
      tCtx.globalCompositeOperation = 'source-in';
      tCtx.fillStyle = 'rgba(0,0,0,1)'; tCtx.fillRect(0, 0, 900, 320);
      const r = 7;
      for (let pass = 0; pass < 2; pass++)
        for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) {
          if (dx*dx + dy*dy > r*r) continue; ctx.drawImage(tmp, dx, dy);
        }
      // Warm earthy-tinted text
      const tinted = document.createElement('canvas'); tinted.width = 900; tinted.height = 320;
      const tCtx2 = tinted.getContext('2d'); tCtx2.imageSmoothingEnabled = false;
      tCtx2.drawImage(_fungiTextImg, ix, iy, iw, ih);
      tCtx2.globalCompositeOperation = 'source-in';
      tCtx2.fillStyle = '#d4a870'; tCtx2.fillRect(0, 0, 900, 320);
      ctx.shadowColor = 'rgba(212,168,112,0.95)'; ctx.shadowBlur = 32; ctx.globalAlpha = 0.65;
      ctx.drawImage(tinted, 0, 0); ctx.shadowBlur = 0; ctx.globalAlpha = 1;
      ctx.drawImage(tinted, 0, 0);
      const tex = new THREE.CanvasTexture(c); tex.needsUpdate = true;
      const geo = new THREE.PlaneGeometry(1.68, 0.60);
      const mat = new THREE.MeshStandardMaterial({ map: tex, transparent: true, alphaTest: 0.02,
        emissive: new THREE.Color(0xd4a870), emissiveIntensity: 0.25, roughness: 0.3, metalness: 0.1 });
      textMesh = new THREE.Mesh(geo, mat);
      textMesh.position.set(0, -0.92, 0.12); packMesh.add(textMesh);
      return;
    }

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
      tCtx2.fillStyle = '#c080ff';
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
        emissive: new THREE.Color(0x8030c0), emissiveIntensity: 0.25,
        roughness: 0.3, metalness: 0.1,
      });
      textMesh = new THREE.Mesh(geo, mat);
      textMesh.position.set(0, -0.92, 0.12);
      packMesh.add(textMesh);
      return;
    }

    if (_packTheme === 'ewaste' && isCritterPhase()) {
      if (!_critterTextImg) return;
      const c = document.createElement('canvas'); c.width = 900; c.height = 320;
      const ctx = c.getContext('2d'); ctx.imageSmoothingEnabled = false;
      const ih = 240;
      const iw = Math.round(_critterTextImg.naturalWidth * (ih / _critterTextImg.naturalHeight));
      const ix = Math.round((900 - iw) / 2), iy = Math.round((320 - ih) / 2);

      // Build fully-opaque black silhouette for the outline stamp
      const tmp = document.createElement('canvas'); tmp.width = 900; tmp.height = 320;
      const tCtx = tmp.getContext('2d'); tCtx.imageSmoothingEnabled = false;
      tCtx.drawImage(_critterTextImg, ix, iy, iw, ih);
      tCtx.globalCompositeOperation = 'source-in';
      tCtx.fillStyle = 'rgba(0,0,0,1)'; tCtx.fillRect(0, 0, 900, 320);

      // Thick outline: radius 7, two passes for density
      const r = 7;
      for (let pass = 0; pass < 2; pass++) {
        for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) {
          if (dx*dx + dy*dy > r*r) continue; ctx.drawImage(tmp, dx, dy);
        }
      }

      // Pastel-pink tinted text
      const tinted = document.createElement('canvas'); tinted.width = 900; tinted.height = 320;
      const tCtx2 = tinted.getContext('2d'); tCtx2.imageSmoothingEnabled = false;
      tCtx2.drawImage(_critterTextImg, ix, iy, iw, ih);
      tCtx2.globalCompositeOperation = 'source-in';
      tCtx2.fillStyle = '#f0b8d0'; tCtx2.fillRect(0, 0, 900, 320);

      // Glow pass then solid pass
      ctx.shadowColor = 'rgba(240,184,208,0.95)'; ctx.shadowBlur = 32; ctx.globalAlpha = 0.65;
      ctx.drawImage(tinted, 0, 0); ctx.shadowBlur = 0; ctx.globalAlpha = 1;
      ctx.drawImage(tinted, 0, 0);

      const tex = new THREE.CanvasTexture(c); tex.needsUpdate = true;
      const geo = new THREE.PlaneGeometry(1.68, 0.60);
      const mat = new THREE.MeshStandardMaterial({ map: tex, transparent: true, alphaTest: 0.02,
        emissive: new THREE.Color(0xf0b8d0), emissiveIntensity: 0.25, roughness: 0.3, metalness: 0.1 });
      textMesh = new THREE.Mesh(geo, mat);
      textMesh.position.set(0, -0.92, 0.12); packMesh.add(textMesh);
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

    // ── GARBAGE PACK: nature phase (pristine) or flesh phase (corrupted) ──────
    if (isNaturePhase()) {
      if (!_natureTextImg) return;
      const c = document.createElement('canvas');
      c.width = 900; c.height = 320;
      const ctx = c.getContext('2d');
      ctx.imageSmoothingEnabled = false;
      const ih = 240;
      const iw = Math.round(_natureTextImg.naturalWidth * (ih / _natureTextImg.naturalHeight));
      const ix = Math.round((900 - iw) / 2);
      const iy = Math.round((320 - ih) / 2);

      // Dark outline — stamp silhouette in a radius loop (same technique as flesh/ewaste/ritual)
      const tmp = document.createElement('canvas');
      tmp.width = c.width; tmp.height = c.height;
      const tCtx = tmp.getContext('2d');
      tCtx.imageSmoothingEnabled = false;
      tCtx.drawImage(_natureTextImg, ix, iy, iw, ih);
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

      // Sky-blue tinted pass
      const tinted = document.createElement('canvas');
      tinted.width = c.width; tinted.height = c.height;
      const tCtx2 = tinted.getContext('2d');
      tCtx2.imageSmoothingEnabled = false;
      tCtx2.drawImage(_natureTextImg, ix, iy, iw, ih);
      tCtx2.globalCompositeOperation = 'source-in';
      tCtx2.fillStyle = '#81d4fa';
      tCtx2.fillRect(0, 0, tinted.width, tinted.height);

      // Glow pass
      ctx.shadowColor = 'rgba(129,212,250,0.95)'; ctx.shadowBlur = 28;
      ctx.globalAlpha = 0.6;
      ctx.drawImage(tinted, -6, -6);
      ctx.shadowBlur = 0; ctx.globalAlpha = 1;

      // Crisp tinted pass
      ctx.drawImage(tinted, 0, 0);

      const tex = new THREE.CanvasTexture(c); tex.needsUpdate = true;
      const geo = new THREE.PlaneGeometry(1.68, 0.60);
      const mat = new THREE.MeshStandardMaterial({ map: tex, transparent: true, alphaTest: 0.02, emissive: new THREE.Color(0x81d4fa), emissiveIntensity: 0.25, roughness: 0.3, metalness: 0.1 });
      textMesh = new THREE.Mesh(geo, mat);
      textMesh.position.set(0, -0.92, 0.12);
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

  function buildLeafTexture() {
    // Flower petal — teardrop shape in #ee8375 salmon-pink
    const c = document.createElement('canvas');
    c.width = 7; c.height = 6;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    const p = (x, y, col) => { ctx.fillStyle = col; ctx.fillRect(x, y, 1, 1); };
    // Tip
    p(3, 0, '#ee8375');
    // Upper body
    p(2, 1, '#ee8375'); p(3, 1, '#f5a498'); p(4, 1, '#ee8375');
    // Widest point
    p(1, 2, '#d46555'); p(2, 2, '#ee8375'); p(3, 2, '#f9bbb0'); p(4, 2, '#ee8375'); p(5, 2, '#d46555');
    p(1, 3, '#d46555'); p(2, 3, '#ee8375'); p(3, 3, '#f5a498'); p(4, 3, '#ee8375'); p(5, 3, '#d46555');
    // Lower body, tapering
    p(2, 4, '#ee8375'); p(3, 4, '#f5a498'); p(4, 4, '#ee8375');
    p(2, 5, '#d46555'); p(3, 5, '#ee8375'); p(4, 5, '#d46555');
    const tex = new THREE.CanvasTexture(c);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.needsUpdate = true;
    return tex;
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

    const leaf = isNaturePhase();
    const count = leaf ? 18 : 6;
    for (let i = 0; i < count; i++) {
      const size = leaf ? (0.10 + Math.random() * 0.08) : 0.11;
      const geo = new THREE.PlaneGeometry(size, size);
      const mat = new THREE.MeshStandardMaterial({
        map: leaf ? buildLeafTexture() : buildFlyTexture(true),
        transparent: true, alphaTest: 0.05,
        emissive: new THREE.Color(leaf ? 0x662010 : 0x331100), emissiveIntensity: 0.3,
      });
      const mesh = new THREE.Mesh(geo, mat);
      // For petals: bias spawn positions toward the card edges
      let bx, by;
      if (leaf) {
        // Spread across full card face with extra weight at left/right edges
        const edgeBias = Math.random() < 0.55;
        bx = edgeBias
          ? (Math.random() < 0.5 ? -1 : 1) * (0.55 + Math.random() * 0.35)  // edge column
          : (Math.random() - 0.5) * 1.6;                                       // scattered centre
        by = (Math.random() - 0.5) * 2.4;
      } else {
        bx = (Math.random() - 0.5) * 1.1;
        by = (Math.random() - 0.5) * 1.8;
      }
      const bz = 0.10 + Math.random() * 0.08;
      mesh.position.set(bx, by, bz);
      packMesh.add(mesh);
      flyMeshes.push(mesh);
      flyStates.push({
        bx, by, bz,
        angle:  Math.random() * Math.PI * 2,
        speed:  leaf ? (0.12 + Math.random() * 0.22) : (0.6 + Math.random() * 1.0),
        radius: leaf ? (0.12 + Math.random() * 0.22) : (0.04 + Math.random() * 0.10),
        phase:  Math.random() * Math.PI * 2,
        flapT:  Math.random() * Math.PI * 2,
        isLeaf: leaf,
      });
    }
  }

  // ─── Fluffy cloud meshes (critter pack) ──────────────────────────────────

  function buildFluffyCloudTexture(seed) {
    const W = 32, H = 18;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false;

    let r = seed * 9301 + 49297;
    const rnd = () => { r = (r * 9301 + 49297) % 233280; return r / 233280; };

    // Three overlapping blobs: main body + two bumps on top
    const blobs = [
      { cx: 16, cy: 12, rx: 11, ry: 5.5 }, // main wide body
      { cx: 10, cy:  8, rx:  6, ry: 5.0 }, // left bump
      { cx: 19, cy:  7, rx:  6, ry: 5.0 }, // right bump
      { cx: 14, cy:  5, rx:  4, ry: 3.5 }, // centre top knob
    ];

    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        let minDist = Infinity;
        for (const b of blobs) {
          const dx = (x - b.cx) / b.rx, dy = (y - b.cy) / b.ry;
          const d = Math.sqrt(dx*dx + dy*dy);
          if (d < minDist) minDist = d;
        }
        if (minDist > 1.0) continue;
        // White core, soft wispy edges with faint pink tint
        const base = minDist < 0.35 ? 0.82 + rnd() * 0.15
                   : minDist < 0.65 ? 0.52 + rnd() * 0.25
                   :                   0.12 + rnd() * 0.18;
        const v  = 230 + Math.floor(rnd() * 25);
        const rv = Math.min(255, v + 10);           // slight warm-pink push
        const gv = Math.max(180, v - 15);
        const bv = Math.min(255, v + 5);
        ctx.fillStyle = `rgba(${rv},${gv},${bv},${base.toFixed(2)})`;
        ctx.fillRect(x, y, 1, 1);
      }
    }

    const tex = new THREE.CanvasTexture(c);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.needsUpdate = true;
    return tex;
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

  // ─── Spore puff texture (fungi pack) — tiny, misty, pixelly ──────────────
  function buildSporeTexture(seed) {
    const S = 5; // very small canvas → chunky pixels when scaled up
    const c = document.createElement('canvas'); c.width = S; c.height = S;
    const ctx = c.getContext('2d'); ctx.imageSmoothingEnabled = false;
    let r = seed * 9301 + 49297;
    const rnd = () => { r = (r * 9301 + 49297) % 233280; return r / 233280; };
    const cx = (S - 1) / 2, cy = (S - 1) / 2;
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const dx = (x - cx) / (S * 0.45), dy = (y - cy) / (S * 0.45);
        const dist = Math.sqrt(dx*dx + dy*dy);
        if (dist > 1.0) continue;
        // Misty falloff — visible but soft at edges
        const base = dist < 0.25 ? 0.78 + rnd() * 0.18
                   : dist < 0.60 ? 0.42 + rnd() * 0.28
                   :                0.08 + rnd() * 0.16;
        // Pale warm spore colour — near-white with faint amber tint
        const rv = Math.floor(220 + rnd() * 35);
        const gv = Math.floor(195 + rnd() * 30);
        const bv = Math.floor(150 + rnd() * 30);
        ctx.fillStyle = `rgba(${rv},${gv},${bv},${base.toFixed(2)})`;
        ctx.fillRect(x, y, 1, 1);
      }
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

    // ── Critter phase: fluffy clouds in front of + behind the pack ──────────
    if (isCritterPhase()) {
      const cfgs = [
        // [bx,    by,    bz,    w,    baseOpacity]
        // ── front clump A (top-right) ────────────────────────────────────────
        [ 0.60,  1.10,  0.44,  1.60, 0.54 ],  // large anchor
        [ 0.30,  0.95,  0.40,  0.90, 0.48 ],  // small neighbour
        [ 0.85,  0.85,  0.42,  1.10, 0.45 ],  // offset right
        // ── front clump B (left) ─────────────────────────────────────────────
        [-0.65,  0.65,  0.46,  1.45, 0.52 ],  // large anchor
        [-0.40,  0.50,  0.50,  0.70, 0.44 ],  // tucked close
        [-0.80,  0.40,  0.43,  1.00, 0.46 ],  // spread left
        // ── front stray (lower centre) ───────────────────────────────────────
        [ 0.10,  0.05,  0.48,  1.80, 0.50 ],  // large, low
        // ── back clump (top-left) ─────────────────────────────────────────────
        [-0.45,  1.25, -0.24,  1.50, 0.38 ],  // large anchor
        [-0.20,  1.10, -0.20,  0.85, 0.32 ],  // close neighbour
        [ 0.55,  0.20, -0.28,  1.20, 0.34 ],  // back right stray
        [-0.10,  0.30, -0.26,  1.70, 0.36 ],  // back wide
      ];
      cfgs.forEach(([bx, by, bz, w, baseOpacity], i) => {
        const geo = new THREE.PlaneGeometry(w, w * (18 / 32));
        const mat = new THREE.MeshBasicMaterial({
          map: buildFluffyCloudTexture(i + 1),
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
          pulseSpeed: 0.004 + Math.random() * 0.004,  // slower, lazier drift
          driftX:     (Math.random() - 0.5) * 0.0012,
          driftY:     (Math.random() - 0.5) * 0.0006,
          offsetX: 0, offsetY: 0,
          baseOpacity,
        });
      });
      return;
    }

    // ── Fungi phase: tiny misty spores clustered around the pack ─────────────
    if (isFungiPhase()) {
      // Define cluster centres [cx, cy, cz, count, spread, baseZ spread]
      const clusters = [
        [ 0.55,  0.85,  0.30, 14, 0.20 ],  // front top-right
        [-0.55,  0.60,  0.34, 12, 0.18 ],  // front top-left
        [ 0.65, -0.20,  0.32, 12, 0.16 ],  // front right-mid
        [-0.60, -0.30,  0.36, 10, 0.18 ],  // front left-mid
        [ 0.10,  0.20,  0.38, 10, 0.14 ],  // front centre
        [-0.40,  1.00, -0.18, 10, 0.16 ],  // back top-left
        [ 0.50, -0.60, -0.22,  8, 0.14 ],  // back bottom-right
      ];
      let seed = 1;
      clusters.forEach(([ccx, ccy, ccz, count, spread]) => {
        for (let i = 0; i < count; i++) {
          const bx = ccx + (Math.random() - 0.5) * spread * 2;
          const by = ccy + (Math.random() - 0.5) * spread * 2;
          const bz = ccz + (Math.random() - 0.5) * 0.08;
          const w  = 0.07 + Math.random() * 0.10;  // tiny: 0.07–0.17
          const baseOpacity = 0.55 + Math.random() * 0.30;
          const geo = new THREE.PlaneGeometry(w, w);
          const mat = new THREE.MeshStandardMaterial({
            map: buildSporeTexture(seed++),
            transparent: true, depthWrite: false, opacity: baseOpacity,
            emissive: new THREE.Color(0xd4a870), emissiveIntensity: 0.6,
            roughness: 1.0, metalness: 0.0,
          });
          const mesh = new THREE.Mesh(geo, mat);
          mesh.position.set(bx, by, bz);
          packMesh.add(mesh);
          cloudMeshes.push(mesh);
          cloudStates.push({
            bx, by, bz,
            pulsePhase: Math.random() * Math.PI * 2,
            pulseSpeed: 0.003 + Math.random() * 0.004,
            driftX: (Math.random() - 0.5) * 0.0008,
            driftY: (Math.random() - 0.5) * 0.0010,
            offsetX: 0, offsetY: 0, baseOpacity,
          });
        }
      });
      return;
    }

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
    ctx.shadowColor = 'rgba(120,30,200,1)';
    ctx.shadowBlur = 22;

    // Outer ring — draw 3× to stack glow
    ctx.strokeStyle = '#b040f0';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(cx, cy, 60, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, 60, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, 60, 0, Math.PI * 2); ctx.stroke();

    // Inner ring — draw 3× to stack glow
    ctx.shadowBlur = 16;
    ctx.strokeStyle = '#d080ff';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(cx, cy, 50, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, 50, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, 50, 0, Math.PI * 2); ctx.stroke();

    ctx.shadowBlur = 0;

    // ── Demonic symbols at 5 pentagram points on outer ring ──────────────────
    ctx.fillStyle = '#c060f0';
    ctx.shadowColor = 'rgba(160,40,240,0.9)';
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
    ctx.fillStyle = '#d080ff';
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
    ctx.fillStyle = '#b040f0';
    ctx.shadowBlur = 5;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const mx = Math.round(cx + Math.cos(a) * 38);
      const my = Math.round(cy + Math.sin(a) * 38);
      ctx.fillRect(mx - 1, my,     3, 1);
      ctx.fillRect(mx,     my + 1, 1, 1);
    }

    // ── Dot ring between the two rings ────────────────────────────────────────
    ctx.fillStyle = '#8030c0';
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
    if (isFungiPhase()) return;  // spores only during pre-horror; circle appears on corruption flip

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
    if (_packTheme !== 'garbage' || isNaturePhase()) return;
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

  // Theme: 'garbage' = flesh (starts pristine at low corruption, corrupts into flesh), 'ewaste' = scourge/green, 'adpack' = ritual/purple
  let _packTheme = 'garbage';
  function setPackTheme(theme) { _packTheme = theme; }

  // Corruption helpers — garbage pack IS the nature pack at low corruption
  //                     ewaste pack IS the critter pack at low corruption
  function getCorruptionLevel() { return parseInt(document.body.dataset.corruption) || 0; }
  function isNaturePhase()      { return _packTheme === 'garbage' && getCorruptionLevel() < (window.HORROR_THRESHOLD ?? 15); }
  function isCritterPhase()     { return _packTheme === 'ewaste'  && getCorruptionLevel() < (window.HORROR_THRESHOLD ?? 15); }
  function isFungiPhase()       { return _packTheme === 'adpack'  && getCorruptionLevel() < (window.HORROR_THRESHOLD ?? 15); }

  function themeCol(alpha = 1) {
    if (_packTheme === 'garbage') return isNaturePhase() ? `rgba(129,212,250,${alpha})` : `rgba(232,92,26,${alpha})`;
    if (_packTheme === 'ewaste')  return `rgba(100,200,30,${alpha})`;
    if (_packTheme === 'adpack')  return `rgba(120,30,180,${alpha})`;
    return `rgba(232,92,26,${alpha})`;
  }
  function themeBg() {
    if (_packTheme === 'garbage') return isNaturePhase() ? '#040c14' : '#0f160f';
    if (_packTheme === 'ewaste')  return '#0a140a';
    if (_packTheme === 'adpack')  return '#08020e';
    return '#0f160f';
  }
  function themeGrid() {
    if (_packTheme === 'garbage') return isNaturePhase() ? 'rgba(129,212,250,0.10)' : 'rgba(42,122,42,0.18)';
    if (_packTheme === 'ewaste')  return 'rgba(80,180,20,0.15)';
    if (_packTheme === 'adpack')  return 'rgba(120,30,180,0.18)';
    return 'rgba(42,122,42,0.18)';
  }
  function themeHex() {
    if (_packTheme === 'garbage') return isNaturePhase() ? '#81d4fa' : '#e85c1a';
    if (_packTheme === 'ewaste')  return '#8bc820';
    if (_packTheme === 'adpack')  return '#8030c0';
    return '#e85c1a';
  }
  function themeGlow() {
    if (_packTheme === 'garbage') return isNaturePhase() ? 'rgba(129,212,250,0.65)' : 'rgba(232,92,26,0.6)';
    if (_packTheme === 'ewaste')  return 'rgba(100,200,20,0.6)';
    if (_packTheme === 'adpack')  return 'rgba(120,30,180,0.85)';
    return 'rgba(232,92,26,0.6)';
  }
  function themeAccent() {
    if (_packTheme === 'garbage') return isNaturePhase() ? 'rgba(129,212,250,0.45)' : 'rgba(58,170,58,0.6)';
    if (_packTheme === 'ewaste')  return 'rgba(140,220,40,0.5)';
    if (_packTheme === 'adpack')  return 'rgba(120,30,180,0.7)';
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
      if (isNaturePhase()) {
        // Pristine nature art
        if (_naturePackImg) { ctx.drawImage(_naturePackImg, 0, 0, W, H); }
        else { ctx.fillStyle = '#040c14'; ctx.fillRect(0, 0, W, H); }
      } else {
        // Corrupted flesh art
        if (_fleshPackImg) { ctx.drawImage(_fleshPackImg, 0, 0, W, H); }
        else { ctx.fillStyle = '#0d0505'; ctx.fillRect(0, 0, W, H); }
        // Blood-red prismatic sheen over the art
        drawPrismatic(ctx, W, H, 0.06, 0);
      }

    } else if (_packTheme === 'ewaste') {
      if (isCritterPhase()) {
        if (_critterPackImg) {
          ctx.drawImage(_critterPackImg, 0, 0, W, H);
          // Tamp down neon brightness from the PNG so scene lights don't oversaturate it
          ctx.fillStyle = 'rgba(0,0,0,0.28)';
          ctx.fillRect(0, 0, W, H);
        }
        else { ctx.fillStyle = '#120a10'; ctx.fillRect(0, 0, W, H); }
      } else {
        if (_scourgePackImg) { ctx.drawImage(_scourgePackImg, 0, 0, W, H); }
        else { ctx.fillStyle = '#0a140a'; ctx.fillRect(0, 0, W, H); }
      }

    } else if (_packTheme === 'adpack') {
      if (isFungiPhase()) {
        if (_fungiPackImg) {
          ctx.drawImage(_fungiPackImg, 0, 0, W, H);
          ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.fillRect(0, 0, W, H);
        } else { ctx.fillStyle = '#0e0d08'; ctx.fillRect(0, 0, W, H); }
      } else {
        if (_ritualPackImg) { ctx.drawImage(_ritualPackImg, 0, 0, W, H); }
        else { ctx.fillStyle = '#12100a'; ctx.fillRect(0, 0, W, H); }
      }
    }

    // ── SCANLINES ─────────────────────────────────────────────────────────────
    for (let y = 0; y < H; y += 4) {
      ctx.fillStyle = 'rgba(0,0,0,0.1)';
      ctx.fillRect(0, y+2, W, 2);
    }

    // ── OUTER GLOW BORDER ─────────────────────────────────────────────────────
    if (_packTheme === 'adpack') {
      if (isFungiPhase()) {
        // fungi-pack.png has its own border baked in — skip extra glow border
      } else {
        drawGlowBorder(ctx, 4, 4, W-8, H-8, '#8030c0', 'rgba(120,30,180,0.8)');
        ctx.strokeStyle = 'rgba(120,30,180,0.3)'; ctx.lineWidth = 1;
        ctx.strokeRect(10, 10, W-20, H-20);
      }

    } else if (_packTheme === 'ewaste') {
      if (isCritterPhase()) {
        // critter-pack.png has its own border baked in — skip extra glow border
      } else {
        drawGlowBorder(ctx, 4, 4, W-8, H-8, '#8bc820', 'rgba(100,200,20,0.8)');
        ctx.strokeStyle = 'rgba(140,220,40,0.3)'; ctx.lineWidth = 1;
        ctx.strokeRect(10, 10, W-20, H-20);
        drawPrismatic(ctx, W, H, 0.05, 100);
      }

    } else if (isNaturePhase()) {
      drawGlowBorder(ctx, 4, 4, W-8, H-8, '#81d4fa', 'rgba(129,212,250,0.8)');
      ctx.strokeStyle = 'rgba(129,212,250,0.25)'; ctx.lineWidth = 1;
      ctx.strokeRect(10, 10, W-20, H-20);

    } else {
      drawGlowBorder(ctx, 4, 4, W-8, H-8, '#cc1515', 'rgba(200,20,20,0.7)');
      ctx.strokeStyle = 'rgba(200,20,20,0.3)'; ctx.lineWidth = 1;
      ctx.strokeRect(10, 10, W-20, H-20);
    }

    // ── CORNER BRACKETS ───────────────────────────────────────────────────────
    const bPad = 16, bSize = 20, bW = 3;
    const bracketCol = isNaturePhase() ? '#81d4fa' : isCritterPhase() ? '#f0b8d0' : isFungiPhase() ? '#d4a870' : _packTheme === 'adpack' ? '#8030c0' : _packTheme === 'ewaste' ? '#8bc820' : '#cc1515';
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
    const bgCol = _packTheme === 'ewaste' ? '#060c18' : _packTheme === 'adpack' ? '#08020e' : '#080e08';
    ctx.fillStyle = bgCol; ctx.fillRect(0, 0, W, H);

    // Prismatic sheen on back too
    if (_packTheme === 'adpack') {
      ctx.strokeStyle = 'rgba(120,30,180,0.1)'; ctx.lineWidth = 2;
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
      ctx.strokeStyle = '#8030c0'; ctx.lineWidth = 4;
      ctx.shadowColor = 'rgba(120,30,180,0.6)'; ctx.shadowBlur = 8;
      ctx.strokeRect(6, 6, W-12, H-12);
      ctx.shadowBlur = 0;
      ctx.strokeStyle = 'rgba(120,30,180,0.25)'; ctx.lineWidth = 1;
      ctx.strokeRect(12, 12, W-24, H-24);
    } else {
      ctx.strokeStyle = themeHex(); ctx.lineWidth = 4;
      ctx.shadowColor = themeGlow(); ctx.shadowBlur = 10;
      ctx.strokeRect(6, 6, W-12, H-12);
      ctx.shadowBlur = 0;
    }

    // Corner sparkles on back
    const bkSparkleCol = _packTheme === 'adpack' ? 'rgba(120,30,180,0.8)' : _packTheme === 'ewaste' ? 'rgba(0,200,255,0.8)' : 'rgba(232,92,26,0.7)';
    [[30,40],[226,40],[30,344],[226,344]].forEach(([sx,sy]) => {
      drawSparkle(ctx, sx, sy, 14, bkSparkleCol, 0.6);
    });

    // Centre text
    ctx.font = '44px "VT323", monospace';
    ctx.textAlign = 'center';
    if (_packTheme === 'adpack') {
      ctx.fillStyle = 'rgba(120,30,180,0.3)';
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

    const ambient = new THREE.AmbientLight(isNaturePhase() ? 0x1a2a3a : 0x1a2a1a, 0.8);
    scene.add(ambient);

    rimLight = new THREE.PointLight(0xe85c1a, 2.5, 10);
    rimLight.position.set(0, -2.5, 1.5);
    scene.add(rimLight);
    // Set correct rim colour immediately based on current theme/phase
    if (isNaturePhase())       { rimLight.color.setStyle('#81d4fa'); rimLight.intensity = 2.2; }
    else if (isCritterPhase()) { rimLight.color.setStyle('#f0b8d0'); rimLight.intensity = 0.4; }
    else if (isFungiPhase())   { rimLight.color.setStyle('#d4a870'); rimLight.intensity = 1.8; }
    else if (_packTheme === 'adpack') { rimLight.color.setStyle('#8030c0'); rimLight.intensity = 3.1; }
    else if (_packTheme === 'ewaste') { rimLight.color.setStyle('#8bc820'); rimLight.intensity = 3.0; }
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

    // Fly / leaf swarm animation
    flyMeshes.forEach((m, i) => {
      const s = flyStates[i];
      s.angle += s.speed * 0.02;
      s.flapT += s.isLeaf ? 0.03 : 0.18;
      m.position.x = s.bx + Math.cos(s.angle) * s.radius;
      m.position.y = s.by + Math.sin(s.angle * 1.3 + s.phase) * s.radius * 0.7;
      m.position.z = s.bz + Math.sin(s.angle * 0.6 + s.phase) * 0.02;
      if (s.isLeaf) {
        // Leaves gently rock back and forth
        m.rotation.z = Math.sin(s.flapT + s.phase) * 0.45;
      } else {
        // Wing flap — rebuild texture at low frequency to avoid GPU thrash
        if (Math.floor(s.flapT) % 4 === 0 && Math.floor(s.flapT) !== m._lastFlap) {
          m._lastFlap = Math.floor(s.flapT);
          const prev = m.material.map;
          m.material.map = buildFlyTexture(Math.floor(s.flapT / 2) % 2 === 0);
          m.material.needsUpdate = true;
          if (prev) prev.dispose();
        }
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

    if (glitchActive) {
      tickGlitch(); // overrides rim light during transition
    } else {
      const baseIntensity = _packTheme === 'adpack' ? 3.1 : _packTheme === 'ewaste' ? 2.8 : 2.5;
      rimLight.intensity = baseIntensity + Math.sin(idleT * 1.2) * (baseIntensity * 0.15);
    }

    if (packMesh) {
      packMesh.scale.set(1, 1, 1);
    }
    renderer.render(scene, camera);
  }

  function lerp(a, b, t) { return a + (b - a) * t; }

  // ─── Interaction ───────────────────────────────────────────────────────────

  function attachEvents(el) {
    el.addEventListener('touchstart',  onTouchStart,  { passive: true });
    el.addEventListener('touchmove',   onTouchMove,   { passive: true });
    el.addEventListener('touchend',    onTouchEnd,    { passive: true });
    el.addEventListener('touchcancel', onTouchCancel, { passive: true });
    el.addEventListener('mousedown',  onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup',   onMouseUp);
  }

  function onTouchStart(e)  { if (isThrowing) return; const t = e.touches[0]; startDrag(t.clientX, t.clientY); }
  function onTouchMove(e)   { if (!isDragging) return; const t = e.touches[0]; moveDrag(t.clientX, t.clientY); }
  function onTouchEnd(e)    { if (!isDragging) return; const t = e.changedTouches[0]; endDrag(t.clientX, t.clientY); }
  function onTouchCancel()  { isDragging = false; targetRotY = 0; targetRotX = 0.08; }
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
      if (_packTheme === 'garbage' && isNaturePhase()) {
        rimLight.color.setStyle('#81d4fa');
        rimLight.intensity = 2.2;
      } else if (_packTheme === 'adpack' && isFungiPhase()) {
        rimLight.color.setStyle('#d4a870');
        rimLight.intensity = 1.8;
      } else if (_packTheme === 'adpack') {
        rimLight.color.setStyle('#8030c0');
        rimLight.intensity = 3.1;
      } else if (_packTheme === 'ewaste' && isCritterPhase()) {
        rimLight.color.setStyle('#f0b8d0');
        rimLight.intensity = 1.4;
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

  // ─── Glitch transition helpers ─────────────────────────────────────────────
  // Full-screen pixel-grid canvas — same pixelated rendering technique as bloodDrip.js
  const GLITCH_PIXEL = 5; // each grid unit = 5×5 screen pixels

  function createGlitchOverlay() {
    if (glitchOverlay) glitchOverlay.remove();
    const GW = Math.ceil(window.innerWidth  / GLITCH_PIXEL);
    const GH = Math.ceil(window.innerHeight / GLITCH_PIXEL);
    glitchOverlay = document.createElement('canvas');
    glitchOverlay.width  = GW;
    glitchOverlay.height = GH;
    Object.assign(glitchOverlay.style, {
      position: 'fixed', top: '0', left: '0',
      width: '100%', height: '100%',
      pointerEvents: 'none',
      imageRendering: 'pixelated',
      zIndex: '300', // above everything including blood drip (z:150)
    });
    document.body.appendChild(glitchOverlay);
    glitchOvCtx = glitchOverlay.getContext('2d');
    glitchOvCtx.imageSmoothingEnabled = false;
  }

  function drawGlitchFrame(progress, intensity) {
    if (!glitchOvCtx || !glitchOverlay) return;
    const GW  = glitchOverlay.width;
    const GH  = glitchOverlay.height;
    const ctx = glitchOvCtx;
    ctx.clearRect(0, 0, GW, GH);
    const rng = Math.random;

    // Pixel-art palette — reds only
    const PALETTE = [
      [60,  0,   0  ], // deep red
      [110, 5,   5  ], // dark red
      [160, 10,  10 ], // mid red
      [210, 18,  18 ], // red
      [240, 30,  30 ], // bright red
      [210, 18,  18 ], // red (weighted heavier)
      [160, 10,  10 ], // mid red (weighted heavier)
    ];

    function pickCol() {
      return PALETTE[Math.floor(rng() * PALETTE.length)];
    }
    function fill(col, a) {
      ctx.fillStyle = `rgba(${col[0]},${col[1]},${col[2]},${a ?? 1})`;
    }

    // 1. Full-width horizontal scan strips — the core pixel-glitch look
    //    These cross the entire viewport, corrupting the whole UI
    const scanCount = Math.floor(1 + intensity * 10);
    for (let i = 0; i < scanCount; i++) {
      const gy = Math.floor(rng() * GH);
      const gh = 1 + Math.floor(rng() * 3); // 1–3 grid rows
      fill(pickCol(), 0.55 + rng() * 0.45);
      ctx.fillRect(0, gy, GW, gh);
    }

    // 2. Displaced strip segments — same row, but offset horizontally,
    //    simulating screen-tear without needing to read back pixels
    const dispCount = Math.floor(intensity * 7);
    for (let i = 0; i < dispCount; i++) {
      const gy   = Math.floor(rng() * GH);
      const gh   = 1 + Math.floor(rng() * 2);
      const gOff = Math.round((rng() - 0.5) * intensity * GW * 0.28);
      fill(pickCol(), 0.7 + rng() * 0.3);
      // Fill the "gap" left by the displaced region
      if (gOff > 0) ctx.fillRect(0, gy, gOff, gh);
      else           ctx.fillRect(GW + gOff, gy, -gOff, gh);
    }

    // 3. Scatter blocks — solid pixel rectangles, larger = more blocky/readable
    const blockCount = Math.floor(intensity * 18);
    for (let i = 0; i < blockCount; i++) {
      fill(pickCol(), 0.65 + rng() * 0.35);
      ctx.fillRect(
        Math.floor(rng() * GW),
        Math.floor(rng() * GH),
        2 + Math.floor(rng() * 14),
        1 + Math.floor(rng() * 3)
      );
    }

    // 4. Pixel static — single-pixel noise scattered across the whole screen
    const staticCount = Math.floor(intensity * 55);
    for (let i = 0; i < staticCount; i++) {
      fill(pickCol(), 0.85 + rng() * 0.15);
      ctx.fillRect(Math.floor(rng() * GW), Math.floor(rng() * GH), 1, 1);
    }

    // 5. Dither corruption patch — checkerboard of two palette colours
    //    Appears when intensity is high; very "8-bit error" feeling
    if (intensity > 0.42 && rng() < intensity * 0.40) {
      const dx = Math.floor(rng() * (GW - 28));
      const dy = Math.floor(rng() * (GH - 12));
      const dw = 10 + Math.floor(rng() * 22);
      const dh =  3 + Math.floor(rng() * 6);
      const colA = pickCol();
      const colB = pickCol();
      for (let y = dy; y < dy + dh; y++) {
        for (let x = dx; x < dx + dw; x++) {
          fill((x + y) % 2 === 0 ? colA : colB, 1);
          ctx.fillRect(x, y, 1, 1);
        }
      }
    }

    // 6. Large flash block — occasional big opaque rectangle (screen blowout)
    if (rng() < intensity * 0.10) {
      const fw = Math.floor(GW * (0.25 + rng() * 0.55));
      const fh = Math.floor(GH * (0.04 + rng() * 0.14));
      fill(rng() < 0.45 ? [0,0,0] : [255,255,255], 0.22 + rng() * 0.32);
      ctx.fillRect(Math.floor(rng() * (GW - fw)), Math.floor(rng() * (GH - fh)), fw, fh);
    }
  }

  function tickGlitch() {
    if (!glitchActive || !packMesh) return;
    const elapsed  = Date.now() - glitchStart;
    const progress = Math.min(elapsed / GLITCH_DUR, 1.0);

    // Intensity envelope: ramp up → plateau → fade out
    const envelope =
      progress < 0.35 ? progress / 0.35 :
      progress < 0.70 ? 1.0 :
      1.0 - (progress - 0.70) / 0.30;
    const intensity = Math.max(0, envelope * (0.75 + Math.sin(elapsed * 0.025) * 0.25));

    // 3D pack shake — integer-ish pixel nudge matching the grid aesthetic
    if (!isThrowing) {
      packMesh.position.x += (Math.random() - 0.5) * intensity * 0.11;
      packMesh.position.y += (Math.random() - 0.5) * intensity * 0.06;
    }

    // Rim light flickers blue→red as corruption takes hold
    if (rimLight) {
      const snapRed = Math.random() < progress * 0.78;
      rimLight.color.setStyle(snapRed ? '#e85c1a' : '#81d4fa');
      rimLight.intensity = 1.8 + Math.random() * intensity * 3.2;
    }

    // Draw full-screen pixel glitch overlay
    drawGlitchFrame(progress, intensity);

    // At ~45%: snap face/symbol/text to flesh, swap petals→flies
    if (!glitchFlipDone && progress >= 0.45) {
      glitchFlipDone = true;
      onCorruptionUpdate();  // isNaturePhase() is false → builds flesh
      rebuildFlyMeshes();    // petals → flies
    }

    // End of transition — clean up everything
    if (progress >= 1.0) {
      glitchActive = false;
      if (glitchOverlay) { glitchOverlay.remove(); glitchOverlay = null; glitchOvCtx = null; }
      if (rimLight) { rimLight.color.setStyle('#e85c1a'); rimLight.intensity = 2.5; }
      document.body.classList.remove('glitch-active');
    }
  }

  function startGlitchTransition() {
    if (glitchActive) return;
    glitchActive   = true;
    glitchStart    = Date.now();
    glitchFlipDone = false;
    createGlitchOverlay();
    document.body.classList.add('glitch-active');
  }

  // Called by main.js whenever packsOpened changes — redraws active pack with new corruption level
  function onCorruptionUpdate() {
    if (!packMesh) return;
    if (_packTheme !== 'garbage' && _packTheme !== 'adpack') return;
    const prev = packMesh.material[4]?.map;
    const next = buildFaceTexture();
    if (packMesh.material[4]) { packMesh.material[4].map = next; packMesh.material[4].needsUpdate = true; }
    if (prev) prev.dispose();
    rebuildSymbolMesh();
    rebuildTextMesh();
    rebuildCloudMeshes();
    rebuildCircleMesh();
    if (rimLight) {
      if (isNaturePhase())       { rimLight.color.setStyle('#81d4fa'); rimLight.intensity = 2.2; }
      else if (isFungiPhase())   { rimLight.color.setStyle('#d4a870'); rimLight.intensity = 1.8; }
      else if (_packTheme === 'adpack') { rimLight.color.setStyle('#8030c0'); rimLight.intensity = 3.1; }
      else                       { rimLight.color.setStyle('#e85c1a'); rimLight.intensity = 2.5; }
    }
  }

  return { init, throwPack, resetPack, destroy, setPackTheme, onCorruptionUpdate, startGlitchTransition, get isReady() { return isReady; } };
})();
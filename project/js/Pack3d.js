// pack3d.js — Three.js interactive pack + pixel scatter particles
// Exposes: Pack3D.init(), Pack3D.throwPack(dir, cb), Pack3D.resetPack(), Pack3D.isReady

const Pack3D = (() => {

  // ─── State ─────────────────────────────────────────────────────────────────

  let renderer, scene, camera, packMesh, rimLight;
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

  const SWIPE_THRESHOLD = 45;

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

  // ─── Canvas textures ───────────────────────────────────────────────────────

  function buildFaceTexture() {
    const c   = document.createElement('canvas');
    c.width   = 256;
    c.height  = 384;
    const ctx = c.getContext('2d');

    ctx.fillStyle = '#0f160f';
    ctx.fillRect(0, 0, 256, 384);

    ctx.strokeStyle = 'rgba(42,122,42,0.18)';
    ctx.lineWidth = 1;
    for (let x = -384; x < 512; x += 24) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + 384, 384); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x + 384, 0); ctx.lineTo(x, 384); ctx.stroke();
    }

    ctx.strokeStyle = '#e85c1a';
    ctx.lineWidth = 6;
    ctx.strokeRect(6, 6, 244, 372);
    ctx.strokeStyle = 'rgba(232,92,26,0.3)';
    ctx.lineWidth = 2;
    ctx.strokeRect(12, 12, 232, 360);

    for (let y = 0; y < 384; y += 4) {
      ctx.fillStyle = 'rgba(0,0,0,0.15)';
      ctx.fillRect(0, y + 2, 256, 2);
    }

    const bSize = 18, bW = 3, bPad = 18;
    ctx.strokeStyle = '#e85c1a'; ctx.lineWidth = bW;
    [[bPad,bPad,1,1],[256-bPad,bPad,-1,1],[bPad,384-bPad,1,-1],[256-bPad,384-bPad,-1,-1]].forEach(([x,y,sx,sy]) => {
      ctx.beginPath(); ctx.moveTo(x, y+sy*bSize); ctx.lineTo(x,y); ctx.lineTo(x+sx*bSize,y); ctx.stroke();
    });

    ctx.font = 'bold 72px "VT323", monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#e85c1a';
    ctx.shadowColor = 'rgba(232,92,26,0.6)'; ctx.shadowBlur = 16;
    ctx.fillText('◈', 128, 188);
    ctx.shadowBlur = 0;

    ctx.font = '22px "VT323", monospace';
    ctx.fillStyle = '#e8e0c8';
    ctx.fillText('RESOURCE PACK', 128, 224);

    ctx.font = '14px "Share Tech Mono", monospace';
    ctx.fillStyle = 'rgba(232,224,200,0.4)';
    ctx.fillText('4 cards inside', 128, 248);

    ctx.font = '12px "Share Tech Mono", monospace';
    ctx.fillStyle = 'rgba(58,170,58,0.6)';
    ctx.fillText('← swipe to open →', 128, 350);

    [[40,56],[216,56],[40,328],[216,328]].forEach(([x,y]) => {
      ctx.beginPath(); ctx.arc(x,y,4,0,Math.PI*2);
      ctx.fillStyle = 'rgba(232,92,26,0.4)'; ctx.fill();
    });

    const tex = new THREE.CanvasTexture(c);
    tex.needsUpdate = true;
    return tex;
  }

  function buildBackTexture() {
    const c   = document.createElement('canvas');
    c.width   = 256;
    c.height  = 384;
    const ctx = c.getContext('2d');

    ctx.fillStyle = '#0a100a';
    ctx.fillRect(0, 0, 256, 384);

    ctx.strokeStyle = 'rgba(42,122,42,0.12)'; ctx.lineWidth = 1;
    for (let x = -384; x < 512; x += 24) {
      ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x+384,384); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x+384,0); ctx.lineTo(x,384); ctx.stroke();
    }

    ctx.strokeStyle = '#e85c1a'; ctx.lineWidth = 4;
    ctx.strokeRect(8, 8, 240, 368);

    for (let y = 0; y < 384; y += 4) {
      ctx.fillStyle = 'rgba(0,0,0,0.12)';
      ctx.fillRect(0, y+2, 256, 2);
    }

    ctx.font = '40px "VT323", monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(232,92,26,0.2)';
    ctx.fillText('COLONY', 128, 200);

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

    rimLight = new THREE.PointLight(0xe85c1a, 2.5, 8);
    rimLight.position.set(0, -2.5, 1.5);
    scene.add(rimLight);

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

    attachEvents(wrap);
    isReady = true;
    animate();
  }

  // ─── Animation loop ────────────────────────────────────────────────────────

  function animate() {
    animFrame = requestAnimationFrame(animate);
    idleT += 0.012;

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

    updateParticles();

    rimLight.intensity = 2.5 + Math.sin(idleT * 1.2) * 0.4;
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
    packMesh.material?.forEach?.(m => {
      if (m.emissiveIntensity !== undefined) m.emissiveIntensity = 0.15;
    });
    clearParticles();
  }

  function destroy() {
    cancelAnimationFrame(animFrame);
    clearParticles();
    renderer?.dispose();
  }

  return { init, throwPack, resetPack, destroy, get isReady() { return isReady; } };
})();
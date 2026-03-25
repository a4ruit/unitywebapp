// pack3d.js — Three.js interactive pack
// Exposes: Pack3D.init(), Pack3D.throw(dir), Pack3D.reset(), Pack3D.isReady

const Pack3D = (() => {

  // ─── State ─────────────────────────────────────────────────────────────────

  let renderer, scene, camera, packMesh, rimLight;
  let animFrame;
  let isReady = false;

  // Interaction
  let isDragging  = false;
  let dragStartX  = 0;
  let dragStartY  = 0;
  let dragCurrentX = 0;
  let dragCurrentY = 0;
  let velocityX   = 0;
  let velocityY   = 0;
  let rotX        = 0.08;  // slight tilt toward viewer
  let rotY        = 0;
  let targetRotX  = 0.08;
  let targetRotY  = 0;

  // Throw state
  let isThrowing  = false;
  let throwDirX   = 0;
  let throwProgress = 0;
  let onThrowComplete = null;

  // Idle bob
  let idleT = 0;

  const SWIPE_THRESHOLD = 45;
  const TOP_ZONE = 0.6;   // top 60% of element registers swipe

  // ─── Canvas texture for pack face ──────────────────────────────────────────

  function buildFaceTexture() {
    const c   = document.createElement('canvas');
    c.width   = 256;
    c.height  = 384;
    const ctx = c.getContext('2d');

    // Background — dark green-black
    ctx.fillStyle = '#0f160f';
    ctx.fillRect(0, 0, 256, 384);

    // Diamond grid pattern
    ctx.strokeStyle = 'rgba(42,122,42,0.18)';
    ctx.lineWidth = 1;
    for (let x = -384; x < 512; x += 24) {
      ctx.beginPath();
      ctx.moveTo(x, 0); ctx.lineTo(x + 384, 384);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x + 384, 0); ctx.lineTo(x, 384);
      ctx.stroke();
    }

    // Outer orange border — double line
    ctx.strokeStyle = '#e85c1a';
    ctx.lineWidth = 6;
    ctx.strokeRect(6, 6, 244, 372);
    ctx.strokeStyle = 'rgba(232,92,26,0.3)';
    ctx.lineWidth = 2;
    ctx.strokeRect(12, 12, 232, 360);

    // Scanlines baked in
    for (let y = 0; y < 384; y += 4) {
      ctx.fillStyle = 'rgba(0,0,0,0.15)';
      ctx.fillRect(0, y + 2, 256, 2);
    }

    // Corner brackets
    const bSize = 18, bW = 3, bPad = 18;
    ctx.strokeStyle = '#e85c1a';
    ctx.lineWidth = bW;
    const corners = [
      [bPad, bPad, 1, 1], [256 - bPad, bPad, -1, 1],
      [bPad, 384 - bPad, 1, -1], [256 - bPad, 384 - bPad, -1, -1]
    ];
    corners.forEach(([x, y, sx, sy]) => {
      ctx.beginPath();
      ctx.moveTo(x, y + sy * bSize); ctx.lineTo(x, y); ctx.lineTo(x + sx * bSize, y);
      ctx.stroke();
    });

    // Central logo — pixelated ◈ character
    ctx.font = 'bold 72px "VT323", monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#e85c1a';
    ctx.shadowColor = 'rgba(232,92,26,0.6)';
    ctx.shadowBlur = 16;
    ctx.fillText('◈', 128, 188);
    ctx.shadowBlur = 0;

    // Title text
    ctx.font = '22px "VT323", monospace';
    ctx.fillStyle = '#e8e0c8';
    ctx.letterSpacing = '4px';
    ctx.fillText('RESOURCE PACK', 128, 224);

    // Subtitle
    ctx.font = '14px "Share Tech Mono", monospace';
    ctx.fillStyle = 'rgba(232,224,200,0.4)';
    ctx.fillText('4 cards inside', 128, 248);

    // Bottom swipe indicator
    ctx.font = '12px "Share Tech Mono", monospace';
    ctx.fillStyle = 'rgba(58,170,58,0.6)';
    ctx.fillText('← swipe to open →', 128, 350);

    // Small dots in the corners — like the poster globe icons simplified
    [[40, 56], [216, 56], [40, 328], [216, 328]].forEach(([x, y]) => {
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(232,92,26,0.4)';
      ctx.fill();
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

    // Grid
    ctx.strokeStyle = 'rgba(42,122,42,0.12)';
    ctx.lineWidth = 1;
    for (let x = -384; x < 512; x += 24) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + 384, 384); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x + 384, 0); ctx.lineTo(x, 384); ctx.stroke();
    }

    ctx.strokeStyle = '#e85c1a';
    ctx.lineWidth = 4;
    ctx.strokeRect(8, 8, 240, 368);

    // Scanlines
    for (let y = 0; y < 384; y += 4) {
      ctx.fillStyle = 'rgba(0,0,0,0.12)';
      ctx.fillRect(0, y + 2, 256, 2);
    }

    // Colony symbol on back
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

    const W = wrap.clientWidth;
    const H = wrap.clientHeight;

    // Renderer
    renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(W, H);
    renderer.setClearColor(0x000000, 0);
    wrap.appendChild(renderer.domElement);

    // Scene
    scene = new THREE.Scene();

    // Camera — orthographic-ish perspective to feel more like a product shot
    camera = new THREE.PerspectiveCamera(35, W / H, 0.1, 100);
    camera.position.set(0, 0, 5.5);

    // Lights
    const ambient = new THREE.AmbientLight(0x1a2a1a, 0.8);
    scene.add(ambient);

    // Orange rim from below — the poster lighting
    rimLight = new THREE.PointLight(0xe85c1a, 2.5, 8);
    rimLight.position.set(0, -2.5, 1.5);
    scene.add(rimLight);

    // Cool top fill
    const topLight = new THREE.DirectionalLight(0x3aaa3a, 0.4);
    topLight.position.set(0, 3, 2);
    scene.add(topLight);

    // Front fill so the face is readable
    const frontLight = new THREE.DirectionalLight(0xffffff, 0.3);
    frontLight.position.set(0, 0, 5);
    scene.add(frontLight);

    // Pack geometry — portrait card proportions, slightly thick
    const W_pack = 1.6, H_pack = 2.4, D_pack = 0.12;
    const geo = new THREE.BoxGeometry(W_pack, H_pack, D_pack);

    const faceTex  = buildFaceTexture();
    const backTex  = buildBackTexture();

    // Six face materials — right, left, top, bottom, front, back
    const edgeMat = new THREE.MeshStandardMaterial({
      color: 0x0f160f,
      emissive: 0xe85c1a,
      emissiveIntensity: 0.15,
      roughness: 0.8,
      metalness: 0.1,
    });

    const frontMat = new THREE.MeshStandardMaterial({
      map: faceTex,
      roughness: 0.75,
      metalness: 0.05,
    });

    const backMat = new THREE.MeshStandardMaterial({
      map: backTex,
      roughness: 0.8,
      metalness: 0.05,
    });

    // BoxGeometry face order: +X, -X, +Y, -Y, +Z (front), -Z (back)
    const materials = [edgeMat, edgeMat, edgeMat, edgeMat, frontMat, backMat];

    packMesh = new THREE.Mesh(geo, materials);
    scene.add(packMesh);

    // Events
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
      const cx = throwDirX * t * 4.5;
      const cy = Math.sin(t * Math.PI) * 0.4;     // arc
      packMesh.position.x = cx;
      packMesh.position.y = cy - t * 1.2;          // fall slightly
      packMesh.rotation.z += throwDirX * 0.06;     // spin on Z
      packMesh.rotation.x += 0.02;
      packMesh.material; // no-op, just tick

      // Fade opacity via emissive
      const fade = Math.max(0, 1 - throwProgress * 1.4);
      packMesh.material.forEach?.(m => {
        if (m.emissiveIntensity !== undefined) m.emissiveIntensity = 0.15 * fade;
        if (m.opacity !== undefined) m.opacity = fade;
      });

      if (throwProgress >= 0.85 && onThrowComplete) {
        isThrowing = false;
        onThrowComplete();
        onThrowComplete = null;
      }

    } else if (!isDragging) {
      // Idle: gentle float and slight rotation
      const idleRotY  = Math.sin(idleT * 0.7) * 0.06;
      const idleRotX  = 0.08 + Math.cos(idleT * 0.5) * 0.02;
      const idlePosY  = Math.sin(idleT * 0.9) * 0.04;

      targetRotY = idleRotY;
      targetRotX = idleRotX;
      packMesh.position.y = idlePosY;

      rotX = lerp(rotX, targetRotX, 0.06);
      rotY = lerp(rotY, targetRotY, 0.06);
      packMesh.rotation.x = rotX;
      packMesh.rotation.y = rotY;

    } else {
      // Drag follow
      rotX = lerp(rotX, targetRotX, 0.18);
      rotY = lerp(rotY, targetRotY, 0.18);
      packMesh.rotation.x = rotX;
      packMesh.rotation.y = rotY;
    }

    // Rim light pulse matching CRT glow
    rimLight.intensity = 2.5 + Math.sin(idleT * 1.2) * 0.4;

    renderer.render(scene, camera);
  }

  function lerp(a, b, t) { return a + (b - a) * t; }

  // ─── Interaction ───────────────────────────────────────────────────────────

  function attachEvents(el) {
    // Touch
    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove',  onTouchMove,  { passive: true });
    el.addEventListener('touchend',   onTouchEnd,   { passive: true });

    // Mouse
    el.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup',   onMouseUp);
  }

  function onTouchStart(e) {
    if (isThrowing) return;
    const t = e.touches[0];
    startDrag(t.clientX, t.clientY);
  }

  function onTouchMove(e) {
    if (!isDragging) return;
    const t = e.touches[0];
    moveDrag(t.clientX, t.clientY);
  }

  function onTouchEnd(e) {
    if (!isDragging) return;
    const t = e.changedTouches[0];
    endDrag(t.clientX, t.clientY);
  }

  function onMouseDown(e) {
    if (isThrowing) return;
    startDrag(e.clientX, e.clientY);
  }
  function onMouseMove(e) {
    if (!isDragging) return;
    moveDrag(e.clientX, e.clientY);
  }
  function onMouseUp(e) {
    if (!isDragging) return;
    endDrag(e.clientX, e.clientY);
  }

  function startDrag(x, y) {
    isDragging   = true;
    dragStartX   = x;
    dragStartY   = y;
    dragCurrentX = x;
    dragCurrentY = y;
    velocityX    = 0;
    velocityY    = 0;
  }

  function moveDrag(x, y) {
    const prevX  = dragCurrentX;
    const prevY  = dragCurrentY;
    dragCurrentX = x;
    dragCurrentY = y;

    velocityX = x - prevX;
    velocityY = y - prevY;

    const dx = x - dragStartX;
    const dy = y - dragStartY;

    // Horizontal drag → Y rotation (turning the card)
    // Vertical drag → X rotation (tilting)
    targetRotY = dx * 0.012;
    targetRotX = 0.08 - dy * 0.008;

    // Clamp so it doesn't flip too far
    targetRotY = Math.max(-0.5, Math.min(0.5, targetRotY));
    targetRotX = Math.max(-0.2, Math.min(0.35, targetRotX));
  }

  function endDrag(x, y) {
    isDragging = false;

    const totalDX = x - dragStartX;
    const totalDY = y - dragStartY;

    // Check for throw gesture — fast horizontal swipe
    const isHorizontal = Math.abs(totalDX) > Math.abs(totalDY) * 1.5;
    const isFast = Math.abs(velocityX) > 4;

    if (isHorizontal && (Math.abs(totalDX) > SWIPE_THRESHOLD || isFast)) {
      const dir = totalDX < 0 ? -1 : 1;
      // Dispatch custom event so main.js can catch it
      document.dispatchEvent(new CustomEvent('pack3d:swipe', { detail: { dir } }));
    } else {
      // Snap back to idle
      targetRotY = 0;
      targetRotX = 0.08;
    }
  }

  // ─── Public: throw animation ───────────────────────────────────────────────

  function throwPack(dir, callback) {
    isThrowing      = true;
    throwDirX       = dir;
    throwProgress   = 0;
    onThrowComplete = callback;
  }

  function resetPack() {
    if (!packMesh) return;
    isThrowing = false;
    throwProgress = 0;
    packMesh.position.set(0, 0, 0);
    packMesh.rotation.set(0.08, 0, 0);
    rotX = 0.08; rotY = 0;
    targetRotX = 0.08; targetRotY = 0;

    // Reset opacity
    packMesh.material?.forEach?.(m => {
      if (m.emissiveIntensity !== undefined) m.emissiveIntensity = 0.15;
    });
  }

  function destroy() {
    cancelAnimationFrame(animFrame);
    renderer?.dispose();
  }

  return { init, throwPack, resetPack, destroy, get isReady() { return isReady; } };
})();
// pack3d.js — Three.js pack, Safari/iOS safe

const Pack3D = (() => {

  // Fixed canvas dimensions — never measure the DOM
  const CW = 200;
  const CH = 280;

  let renderer, scene, camera, packMesh, rimLight;
  let animFrame;
  let isReady = false;

  let isDragging = false;
  let dragStartX = 0, dragStartY = 0;
  let dragCurrentX = 0, dragCurrentY = 0;
  let velocityX = 0;
  let rotX = 0.08, rotY = 0;
  let targetRotX = 0.08, targetRotY = 0;

  let isThrowing = false;
  let throwDirX = 0, throwProgress = 0;
  let onThrowComplete = null;

  let idleT = 0;
  const SWIPE_THRESHOLD = 40;

  // ─── Textures ───────────────────────────────────────────────────────────────

  function makeFaceTex() {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 384;
    const ctx = c.getContext('2d');

    // BG
    ctx.fillStyle = '#0f160f';
    ctx.fillRect(0, 0, 256, 384);

    // Grid
    ctx.strokeStyle = 'rgba(42,122,42,0.2)';
    ctx.lineWidth = 1;
    for (let x = -256; x < 512; x += 24) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + 384, 384); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x + 384, 0); ctx.lineTo(x, 384); ctx.stroke();
    }

    // Border
    ctx.strokeStyle = '#e85c1a'; ctx.lineWidth = 6;
    ctx.strokeRect(5, 5, 246, 374);
    ctx.strokeStyle = 'rgba(232,92,26,0.3)'; ctx.lineWidth = 2;
    ctx.strokeRect(11, 11, 234, 362);

    // Scanlines
    for (let y = 0; y < 384; y += 4) {
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.fillRect(0, y + 2, 256, 2);
    }

    // Corner brackets
    const b = 18, bw = 3, bp = 16;
    ctx.strokeStyle = '#e85c1a'; ctx.lineWidth = bw;
    [[bp,bp,1,1],[256-bp,bp,-1,1],[bp,384-bp,1,-1],[256-bp,384-bp,-1,-1]].forEach(([x,y,sx,sy]) => {
      ctx.beginPath(); ctx.moveTo(x, y + sy*b); ctx.lineTo(x, y); ctx.lineTo(x + sx*b, y); ctx.stroke();
    });

    // Logo glyph
    ctx.textAlign = 'center';
    ctx.fillStyle = '#e85c1a';
    ctx.shadowColor = 'rgba(232,92,26,0.7)';
    ctx.shadowBlur = 18;
    ctx.font = 'bold 60px sans-serif';
    ctx.fillText('◈', 128, 192);
    ctx.shadowBlur = 0;

    // Title
    ctx.font = 'bold 18px monospace';
    ctx.fillStyle = '#e8e0c8';
    ctx.fillText('RESOURCE PACK', 128, 224);

    // Subtitle
    ctx.font = '12px monospace';
    ctx.fillStyle = 'rgba(232,224,200,0.4)';
    ctx.fillText('4 cards inside', 128, 248);

    // Swipe hint
    ctx.font = '11px monospace';
    ctx.fillStyle = 'rgba(58,170,58,0.55)';
    ctx.fillText('<  swipe to open  >', 128, 352);

    // Dot corners
    [[38,52],[218,52],[38,332],[218,332]].forEach(([x,y]) => {
      ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(232,92,26,0.4)'; ctx.fill();
    });

    const t = new THREE.CanvasTexture(c);
    t.needsUpdate = true;
    return t;
  }

  function makeBackTex() {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 384;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#080f08'; ctx.fillRect(0, 0, 256, 384);
    ctx.strokeStyle = 'rgba(42,122,42,0.12)'; ctx.lineWidth = 1;
    for (let x = -256; x < 512; x += 24) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + 384, 384); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x + 384, 0); ctx.lineTo(x, 384); ctx.stroke();
    }
    ctx.strokeStyle = '#e85c1a'; ctx.lineWidth = 4;
    ctx.strokeRect(7, 7, 242, 370);
    for (let y = 0; y < 384; y += 4) {
      ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.fillRect(0, y + 2, 256, 2);
    }
    ctx.textAlign = 'center';
    ctx.font = 'bold 26px monospace';
    ctx.fillStyle = 'rgba(232,92,26,0.2)';
    ctx.fillText('COLONY', 128, 200);
    const t = new THREE.CanvasTexture(c);
    t.needsUpdate = true;
    return t;
  }

  // ─── Build scene ────────────────────────────────────────────────────────────

  function buildScene() {
    scene = new THREE.Scene();

    camera = new THREE.PerspectiveCamera(36, CW / CH, 0.1, 100);
    camera.position.set(0, 0, 5.2);

    scene.add(new THREE.AmbientLight(0x1a2a1a, 1.0));

    rimLight = new THREE.PointLight(0xe85c1a, 3.0, 10);
    rimLight.position.set(0, -2.5, 1.5);
    scene.add(rimLight);

    const top = new THREE.DirectionalLight(0x3aaa3a, 0.5);
    top.position.set(0, 3, 2);
    scene.add(top);

    const front = new THREE.DirectionalLight(0xffffff, 0.3);
    front.position.set(0, 0, 5);
    scene.add(front);

    const geo = new THREE.BoxGeometry(1.55, 2.3, 0.11);

    const edge = new THREE.MeshStandardMaterial({
      color: 0x0f160f,
      emissive: 0xe85c1a,
      emissiveIntensity: 0.18,
      roughness: 0.8,
      metalness: 0.1,
    });

    const front_m = new THREE.MeshStandardMaterial({
      map: makeFaceTex(),
      roughness: 0.75,
      metalness: 0.05,
    });

    const back_m = new THREE.MeshStandardMaterial({
      map: makeBackTex(),
      roughness: 0.8,
      metalness: 0.05,
    });

    // BoxGeometry face order: +X,-X,+Y,-Y,+Z(front),-Z(back)
    packMesh = new THREE.Mesh(geo, [edge, edge, edge, edge, front_m, back_m]);
    scene.add(packMesh);
  }

  // ─── Init ───────────────────────────────────────────────────────────────────

  function init() {
    const wrap = document.getElementById('packCanvas');
    if (!wrap || renderer) return;

    // Use fixed dimensions — never trust Safari's layout at call time
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);

    try {
      renderer = new THREE.WebGLRenderer({
        antialias: false,
        alpha: true,
        powerPreference: 'low-power',  // iOS prefers this
        failIfMajorPerformanceCaveat: false,
      });
    } catch (e) {
      console.warn('[Pack3D] WebGL init failed:', e);
      return;
    }

    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(CW, CH, false); // false = don't set canvas style size
    renderer.setClearColor(0x000000, 0);

    // Explicitly set canvas pixel dimensions
    const canvas = renderer.domElement;
    canvas.width  = CW * pixelRatio;
    canvas.height = CH * pixelRatio;
    canvas.style.width  = CW + 'px';
    canvas.style.height = CH + 'px';
    canvas.style.display = 'block';
    canvas.style.imageRendering = 'pixelated';
    canvas.style.webkitTransform = 'translateZ(0)';

    wrap.appendChild(canvas);

    buildScene();
    attachEvents(wrap);

    isReady = true;
    animate();
  }

  // ─── Animation ──────────────────────────────────────────────────────────────

  function animate() {
    animFrame = requestAnimationFrame(animate);
    idleT += 0.012;

    if (isThrowing) {
      throwProgress += 0.042;
      const t = throwProgress;
      packMesh.position.x = throwDirX * t * 5;
      packMesh.position.y = Math.sin(t * Math.PI) * 0.3 - t * 1.4;
      packMesh.rotation.z += throwDirX * 0.055;
      packMesh.rotation.x += 0.018;

      if (throwProgress >= 0.9 && onThrowComplete) {
        isThrowing = false;
        const cb = onThrowComplete;
        onThrowComplete = null;
        cb();
      }

    } else if (!isDragging) {
      targetRotY = Math.sin(idleT * 0.7) * 0.055;
      targetRotX = 0.08 + Math.cos(idleT * 0.5) * 0.018;
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

    rimLight.intensity = 3.0 + Math.sin(idleT * 1.2) * 0.5;
    renderer.render(scene, camera);
  }

  function lerp(a, b, t) { return a + (b - a) * t; }

  // ─── Events ─────────────────────────────────────────────────────────────────

  function attachEvents(el) {
    el.addEventListener('touchstart', e => {
      if (isThrowing) return;
      e.preventDefault();
      const t = e.touches[0];
      startDrag(t.clientX, t.clientY);
    }, { passive: false });

    el.addEventListener('touchmove', e => {
      if (!isDragging) return;
      e.preventDefault();
      const t = e.touches[0];
      moveDrag(t.clientX, t.clientY);
    }, { passive: false });

    el.addEventListener('touchend', e => {
      if (!isDragging) return;
      const t = e.changedTouches[0];
      endDrag(t.clientX, t.clientY);
    }, { passive: true });

    el.addEventListener('mousedown', e => { if (!isThrowing) startDrag(e.clientX, e.clientY); });
    window.addEventListener('mousemove', e => { if (isDragging) moveDrag(e.clientX, e.clientY); });
    window.addEventListener('mouseup',   e => { if (isDragging) endDrag(e.clientX, e.clientY); });
  }

  function startDrag(x, y) {
    isDragging = true;
    dragStartX = dragCurrentX = x;
    dragStartY = dragCurrentY = y;
    velocityX = 0;
  }

  function moveDrag(x, y) {
    velocityX = x - dragCurrentX;
    dragCurrentX = x; dragCurrentY = y;
    const dx = x - dragStartX;
    const dy = y - dragStartY;
    targetRotY = Math.max(-0.55, Math.min(0.55, dx * 0.013));
    targetRotX = Math.max(-0.2, Math.min(0.35, 0.08 - dy * 0.009));
  }

  function endDrag(x, y) {
    isDragging = false;
    const dx = x - dragStartX;
    const dy = Math.abs(y - dragStartY);
    const isH = Math.abs(dx) > dy * 1.4;
    const isFast = Math.abs(velocityX) > 3;

    if (isH && (Math.abs(dx) > SWIPE_THRESHOLD || isFast)) {
      document.dispatchEvent(new CustomEvent('pack3d:swipe', {
        detail: { dir: dx < 0 ? -1 : 1 }
      }));
    } else {
      targetRotY = 0; targetRotX = 0.08;
    }
  }

  // ─── Public ─────────────────────────────────────────────────────────────────

  function throwPack(dir, callback) {
    isThrowing = true;
    throwDirX = dir;
    throwProgress = 0;
    onThrowComplete = callback;
  }

  function resetPack() {
    if (!packMesh) return;
    isThrowing = false; throwProgress = 0;
    packMesh.position.set(0, 0, 0);
    packMesh.rotation.set(0.08, 0, 0);
    rotX = 0.08; rotY = 0;
    targetRotX = 0.08; targetRotY = 0;
  }

  function destroy() {
    cancelAnimationFrame(animFrame);
    renderer?.dispose();
  }

  return { init, throwPack, resetPack, destroy, get isReady() { return isReady; } };
})();
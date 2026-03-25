// pack3d.js — Three.js interactive pack with slot machine surround

const Pack3D = (() => {

  let renderer, scene, camera, packMesh, rimLight;
  let animFrame;
  let isReady = false;

  // Interaction
  let isDragging   = false;
  let dragStartX   = 0, dragStartY = 0;
  let dragCurrentX = 0, dragCurrentY = 0;
  let velocityX    = 0;
  let rotX = 0.08, rotY = 0;
  let targetRotX   = 0.08, targetRotY = 0;

  // Throw
  let isThrowing      = false;
  let throwDirX       = 0;
  let throwProgress   = 0;
  let onThrowComplete = null;

  // Idle
  let idleT = 0;

  const SWIPE_THRESHOLD = 42;

  // ─── Canvas texture ─────────────────────────────────────────────────────────

  function buildFaceTexture() {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 384;
    const ctx = c.getContext('2d');

    ctx.fillStyle = '#0f160f';
    ctx.fillRect(0, 0, 256, 384);

    // Diamond grid
    ctx.strokeStyle = 'rgba(42,122,42,0.2)';
    ctx.lineWidth = 1;
    for (let x = -384; x < 512; x += 24) {
      ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x+384,384); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x+384,0); ctx.lineTo(x,384); ctx.stroke();
    }

    // Double border
    ctx.strokeStyle = '#e85c1a'; ctx.lineWidth = 6;
    ctx.strokeRect(5, 5, 246, 374);
    ctx.strokeStyle = 'rgba(232,92,26,0.3)'; ctx.lineWidth = 2;
    ctx.strokeRect(11, 11, 234, 362);

    // Scanlines
    for (let y = 0; y < 384; y += 4) {
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.fillRect(0, y+2, 256, 2);
    }

    // Corner brackets
    const b = 18, bw = 3, bp = 16;
    ctx.strokeStyle = '#e85c1a'; ctx.lineWidth = bw;
    [[bp,bp,1,1],[256-bp,bp,-1,1],[bp,384-bp,1,-1],[256-bp,384-bp,-1,-1]].forEach(([x,y,sx,sy]) => {
      ctx.beginPath(); ctx.moveTo(x,y+sy*b); ctx.lineTo(x,y); ctx.lineTo(x+sx*b,y); ctx.stroke();
    });

    // Logo
    ctx.font = '900 64px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#e85c1a';
    ctx.shadowColor = 'rgba(232,92,26,0.7)';
    ctx.shadowBlur = 20;
    ctx.fillText('◈', 128, 192);
    ctx.shadowBlur = 0;

    // Title
    ctx.font = 'bold 19px monospace';
    ctx.fillStyle = '#e8e0c8';
    ctx.fillText('RESOURCE PACK', 128, 226);

    // Subtitle
    ctx.font = '12px monospace';
    ctx.fillStyle = 'rgba(232,224,200,0.4)';
    ctx.fillText('4 cards inside', 128, 250);

    // Swipe hint
    ctx.font = '11px monospace';
    ctx.fillStyle = 'rgba(58,170,58,0.55)';
    ctx.fillText('← swipe to open →', 128, 352);

    // Corner dots
    [[38,52],[218,52],[38,332],[218,332]].forEach(([x,y]) => {
      ctx.beginPath(); ctx.arc(x,y,4,0,Math.PI*2);
      ctx.fillStyle='rgba(232,92,26,0.4)'; ctx.fill();
    });

    const tex = new THREE.CanvasTexture(c);
    tex.needsUpdate = true;
    return tex;
  }

  function buildBackTexture() {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 384;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#080f08'; ctx.fillRect(0,0,256,384);
    ctx.strokeStyle='rgba(42,122,42,0.14)'; ctx.lineWidth=1;
    for (let x=-384;x<512;x+=24) {
      ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x+384,384);ctx.stroke();
      ctx.beginPath();ctx.moveTo(x+384,0);ctx.lineTo(x,384);ctx.stroke();
    }
    ctx.strokeStyle='#e85c1a'; ctx.lineWidth=4;
    ctx.strokeRect(7,7,242,370);
    for (let y=0;y<384;y+=4) { ctx.fillStyle='rgba(0,0,0,0.12)'; ctx.fillRect(0,y+2,256,2); }
    ctx.font='bold 28px monospace'; ctx.textAlign='center'; ctx.fillStyle='rgba(232,92,26,0.18)';
    ctx.fillText('COLONY', 128, 200);
    const tex = new THREE.CanvasTexture(c);
    tex.needsUpdate = true;
    return tex;
  }

  // ─── Init ───────────────────────────────────────────────────────────────────

  function init() {
    const wrap = document.getElementById('packCanvas');
    if (!wrap) return;

    // Force layout before measuring
    const doInit = () => {
      const W = wrap.offsetWidth  || 240;
      const H = wrap.offsetHeight || 320;

      renderer = new THREE.WebGLRenderer({ antialias:false, alpha:true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(W, H);
      renderer.setClearColor(0x000000, 0);
      wrap.appendChild(renderer.domElement);

      scene = new THREE.Scene();

      camera = new THREE.PerspectiveCamera(36, W/H, 0.1, 100);
      camera.position.set(0, 0, 5.2);

      // Lights
      scene.add(new THREE.AmbientLight(0x1a2a1a, 0.9));
      rimLight = new THREE.PointLight(0xe85c1a, 3.0, 10);
      rimLight.position.set(0, -2.5, 1.5);
      scene.add(rimLight);
      const top = new THREE.DirectionalLight(0x3aaa3a, 0.5);
      top.position.set(0, 3, 2); scene.add(top);
      const front = new THREE.DirectionalLight(0xffffff, 0.35);
      front.position.set(0, 0, 5); scene.add(front);

      // Geometry
      const geo = new THREE.BoxGeometry(1.6, 2.4, 0.12);
      const edgeMat = new THREE.MeshStandardMaterial({
        color:0x0f160f, emissive:0xe85c1a, emissiveIntensity:0.18, roughness:0.8, metalness:0.1
      });
      const frontMat = new THREE.MeshStandardMaterial({ map:buildFaceTexture(), roughness:0.75, metalness:0.05 });
      const backMat  = new THREE.MeshStandardMaterial({ map:buildBackTexture(),  roughness:0.8,  metalness:0.05 });

      packMesh = new THREE.Mesh(geo, [edgeMat,edgeMat,edgeMat,edgeMat,frontMat,backMat]);
      scene.add(packMesh);

      attachEvents(wrap);
      handleResize(wrap);
      window.addEventListener('resize', () => handleResize(wrap));

      isReady = true;
      animate();
    };

    // Small delay ensures DOM layout is complete on mobile
    if (wrap.offsetWidth === 0) {
      setTimeout(doInit, 80);
    } else {
      doInit();
    }
  }

  function handleResize(wrap) {
    if (!renderer) return;
    const W = wrap.offsetWidth || 240;
    const H = wrap.offsetHeight || 320;
    renderer.setSize(W, H);
    camera.aspect = W / H;
    camera.updateProjectionMatrix();
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
        onThrowComplete();
        onThrowComplete = null;
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

  function lerp(a,b,t){ return a+(b-a)*t; }

  // ─── Events ─────────────────────────────────────────────────────────────────

  function attachEvents(el) {
    el.addEventListener('touchstart', e => {
      if (isThrowing) return;
      const t = e.touches[0];
      startDrag(t.clientX, t.clientY);
    }, { passive:true });

    el.addEventListener('touchmove', e => {
      if (!isDragging) return;
      const t = e.touches[0];
      moveDrag(t.clientX, t.clientY);
    }, { passive:true });

    el.addEventListener('touchend', e => {
      if (!isDragging) return;
      const t = e.changedTouches[0];
      endDrag(t.clientX, t.clientY);
    }, { passive:true });

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
    targetRotX = Math.max(-0.2,  Math.min(0.35, 0.08 - dy * 0.009));
  }

  function endDrag(x, y) {
    isDragging = false;
    const dx = x - dragStartX;
    const dy = Math.abs(y - dragStartY);
    const isH = Math.abs(dx) > dy * 1.4;
    const isFast = Math.abs(velocityX) > 3.5;

    if (isH && (Math.abs(dx) > SWIPE_THRESHOLD || isFast)) {
      document.dispatchEvent(new CustomEvent('pack3d:swipe', { detail:{ dir: dx < 0 ? -1 : 1 } }));
    } else {
      targetRotY = 0; targetRotX = 0.08;
    }
  }

  // ─── Public ─────────────────────────────────────────────────────────────────

  function throwPack(dir, callback) {
    isThrowing = true; throwDirX = dir;
    throwProgress = 0; onThrowComplete = callback;
  }

  function resetPack() {
    if (!packMesh) return;
    isThrowing = false; throwProgress = 0;
    packMesh.position.set(0,0,0);
    packMesh.rotation.set(0.08,0,0);
    rotX = 0.08; rotY = 0; targetRotX = 0.08; targetRotY = 0;
  }

  function destroy() {
    cancelAnimationFrame(animFrame);
    renderer?.dispose();
  }

  return { init, throwPack, resetPack, destroy, get isReady(){ return isReady; } };
})();
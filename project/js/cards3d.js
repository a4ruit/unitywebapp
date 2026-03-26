// cards3d.js — Three.js 3D card reveal system
// Exposes: Cards3D.init(containerId), Cards3D.showCard(card, onComplete), Cards3D.destroy()

const Cards3D = (() => {

  let renderer, scene, camera, cardMesh;
  let animFrame;
  let isFlipping  = false;
  let flipProgress = 0;
  let flipDone    = false;
  let onFlipComplete = null;

  // Rarity config
  const RARITY = {
    common:    { border: '#607060', emissive: 0x101810, emissiveIntensity: 0.05, light: null },
    uncommon:  { border: '#4a8aaa', emissive: 0x0a1820, emissiveIntensity: 0.2,  light: { color: 0x4a8aaa, intensity: 1.2, dist: 5 } },
    rare:      { border: '#9a6ab8', emissive: 0x120a1a, emissiveIntensity: 0.3,  light: { color: 0x9a6ab8, intensity: 1.8, dist: 5 } },
    legendary: { border: '#c89030', emissive: 0x201000, emissiveIntensity: 0.5,  light: { color: 0xc89030, intensity: 2.5, dist: 6 } },
  };

  let rarityLight = null;
  let idleT       = 0;
  let currentRarity = 'common';

  // ─── Card face texture builder ─────────────────────────────────────────────

  function hexToRgb(hex) {
    const r = parseInt(hex.slice(1,3),16);
    const g = parseInt(hex.slice(3,5),16);
    const b = parseInt(hex.slice(5,7),16);
    return `${r},${g},${b}`;
  }

  function buildCardFace(card) {
    const c   = document.createElement('canvas');
    c.width   = 256;
    c.height  = 384;
    const ctx = c.getContext('2d');

    const cfg = RARITY[card.rarity] || RARITY.common;

    // Background
    ctx.fillStyle = '#0f160f';
    ctx.fillRect(0, 0, 256, 384);

    // Diagonal grid
    ctx.strokeStyle = `rgba(${hexToRgb(cfg.border)},0.12)`;
    ctx.lineWidth = 1;
    for (let x = -384; x < 512; x += 20) {
      ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x+384,384); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x+384,0); ctx.lineTo(x,384); ctx.stroke();
    }

    // Rarity glow bg for legendary
    if (card.rarity === 'legendary') {
      const grad = ctx.createRadialGradient(128,192,0,128,192,160);
      grad.addColorStop(0, 'rgba(200,144,48,0.12)');
      grad.addColorStop(1, 'transparent');
      ctx.fillStyle = grad;
      ctx.fillRect(0,0,256,384);
    }

    // Border
    ctx.strokeStyle = cfg.border;
    ctx.lineWidth = 5;
    ctx.strokeRect(5, 5, 246, 374);
    ctx.strokeStyle = `rgba(${hexToRgb(cfg.border)},0.3)`;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(10, 10, 236, 364);

    // Scanlines
    for (let y = 0; y < 384; y += 4) {
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.fillRect(0, y+2, 256, 2);
    }

    // Corner brackets
    ctx.strokeStyle = cfg.border;
    ctx.lineWidth = 2;
    const b = 14, bp = 14;
    [[bp,bp,1,1],[256-bp,bp,-1,1],[bp,384-bp,1,-1],[256-bp,384-bp,-1,-1]].forEach(([x,y,sx,sy]) => {
      ctx.beginPath(); ctx.moveTo(x, y+sy*b); ctx.lineTo(x,y); ctx.lineTo(x+sx*b,y); ctx.stroke();
    });

    // Shape area — centred in upper portion
    const shapeY = 140;
    const shapeX = 128;

    ctx.save();
    ctx.translate(shapeX, shapeY);

    if (card.rarity === 'common') {
      // Small cube
      ctx.fillStyle = cfg.border;
      ctx.fillRect(-18, -18, 36, 36);
      ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 2;
      ctx.strokeRect(-18,-18,36,36);
    } else if (card.rarity === 'uncommon') {
      // Large cube
      ctx.fillStyle = cfg.border;
      ctx.fillRect(-32, -32, 64, 64);
      ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 2;
      ctx.strokeRect(-32,-32,64,64);
    } else if (card.rarity === 'rare') {
      // Sphere (octagon)
      ctx.beginPath();
      const r = 34;
      const pts = 8;
      for (let i = 0; i < pts; i++) {
        const a = (i / pts) * Math.PI * 2 - Math.PI/8;
        i === 0 ? ctx.moveTo(Math.cos(a)*r, Math.sin(a)*r) : ctx.lineTo(Math.cos(a)*r, Math.sin(a)*r);
      }
      ctx.closePath();
      ctx.fillStyle = cfg.border;
      ctx.fill();
    } else if (card.rarity === 'legendary') {
      // Triangle / obelisk
      ctx.beginPath();
      ctx.moveTo(0, -44);
      ctx.lineTo(36, 36);
      ctx.lineTo(-36, 36);
      ctx.closePath();
      ctx.fillStyle = cfg.border;
      ctx.fill();
      // Inner glow
      const igrad = ctx.createLinearGradient(0,-44,0,36);
      igrad.addColorStop(0,'rgba(255,220,100,0.3)');
      igrad.addColorStop(1,'transparent');
      ctx.fillStyle = igrad;
      ctx.fill();
    }
    ctx.restore();

    // Rarity label — above name
    ctx.font = '11px "Share Tech Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = `rgba(${hexToRgb(cfg.border)},0.7)`;
    ctx.letterSpacing = '3px';
    ctx.fillText(card.rarity.toUpperCase(), 128, 218);

    // Card name
    ctx.font = 'bold 34px "VT323", monospace';
    ctx.fillStyle = cfg.border;
    ctx.shadowColor = cfg.border; ctx.shadowBlur = 8;
    ctx.fillText(card.name.toUpperCase(), 128, 256);
    ctx.shadowBlur = 0;

    // Divider
    ctx.strokeStyle = `rgba(${hexToRgb(cfg.border)},0.3)`;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(28,268); ctx.lineTo(228,268); ctx.stroke();

    // Description
    ctx.font = '13px "Share Tech Mono", monospace';
    ctx.fillStyle = 'rgba(232,224,200,0.5)';
    ctx.shadowBlur = 0;

    // Word-wrap description
    const words = card.desc.split(' ');
    let line = '', lineY = 292;
    const maxW = 210;
    words.forEach(word => {
      const test = line ? line + ' ' + word : word;
      if (ctx.measureText(test).width > maxW && line) {
        ctx.fillText(line, 128, lineY);
        line  = word;
        lineY += 18;
      } else {
        line = test;
      }
    });
    if (line) ctx.fillText(line, 128, lineY);

    // Legendary holo strip
    if (card.rarity === 'legendary') {
      const holo = ctx.createLinearGradient(0,0,256,0);
      holo.addColorStop(0,    'rgba(200,144,48,0.0)');
      holo.addColorStop(0.3,  'rgba(200,144,48,0.06)');
      holo.addColorStop(0.5,  'rgba(255,200,80,0.12)');
      holo.addColorStop(0.7,  'rgba(200,80,20,0.06)');
      holo.addColorStop(1,    'rgba(200,144,48,0.0)');
      ctx.fillStyle = holo;
      ctx.fillRect(0,0,256,384);
    }

    const tex = new THREE.CanvasTexture(c);
    tex.needsUpdate = true;
    return tex;
  }

  function buildCardBack() {
    const c   = document.createElement('canvas');
    c.width   = 256;
    c.height  = 384;
    const ctx = c.getContext('2d');

    ctx.fillStyle = '#0a100a';
    ctx.fillRect(0,0,256,384);

    ctx.strokeStyle = 'rgba(42,122,42,0.12)'; ctx.lineWidth = 1;
    for (let x = -384; x < 512; x += 20) {
      ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x+384,384); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x+384,0); ctx.lineTo(x,384); ctx.stroke();
    }

    ctx.strokeStyle = '#e85c1a'; ctx.lineWidth = 4;
    ctx.strokeRect(8,8,240,368);

    for (let y = 0; y < 384; y += 4) {
      ctx.fillStyle = 'rgba(0,0,0,0.14)';
      ctx.fillRect(0,y+2,256,2);
    }

    ctx.font = '52px "VT323", monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(232,92,26,0.18)';
    ctx.fillText('◈', 128, 210);

    ctx.font = '18px "VT323", monospace';
    ctx.fillStyle = 'rgba(232,92,26,0.12)';
    ctx.fillText('COLONY', 128, 240);

    const tex = new THREE.CanvasTexture(c);
    tex.needsUpdate = true;
    return tex;
  }

  // ─── Init ──────────────────────────────────────────────────────────────────

  function init(containerId) {
    const wrap = document.getElementById(containerId);
    if (!wrap) return;

    // Clear any previous instance
    destroy();

    const W = wrap.clientWidth  || 216;
    const H = wrap.clientHeight || 296;

    renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(W, H);
    renderer.setClearColor(0x000000, 0);

    // Replace inner content with canvas
    wrap.innerHTML = '';
    wrap.appendChild(renderer.domElement);
    renderer.domElement.style.cssText = 'display:block;width:100%!important;height:100%!important;image-rendering:pixelated;';

    scene  = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(38, W / H, 0.1, 100);
    camera.position.set(0, 0, 4.2);

    // Base lights
    scene.add(new THREE.AmbientLight(0x1a2a1a, 0.9));

    const front = new THREE.DirectionalLight(0xffffff, 0.4);
    front.position.set(0, 0, 5);
    scene.add(front);

    const top = new THREE.DirectionalLight(0x3aaa3a, 0.3);
    top.position.set(0, 4, 2);
    scene.add(top);

    animate();
  }

  // ─── Show card ─────────────────────────────────────────────────────────────

  function showCard(card, containerId, callback) {
    const wrap = document.getElementById(containerId);
    if (!wrap) return;

    // Init renderer into this container if not already there or size changed
    if (!renderer) {
      init(containerId);
    }

    // Remove old card mesh
    if (cardMesh) {
      scene.remove(cardMesh);
      cardMesh.geometry.dispose();
      cardMesh.material?.forEach?.(m => m.dispose());
      cardMesh = null;
    }

    // Remove old rarity light
    if (rarityLight) { scene.remove(rarityLight); rarityLight = null; }

    currentRarity = card.rarity;
    const cfg = RARITY[card.rarity] || RARITY.common;

    // Add rarity point light
    if (cfg.light) {
      rarityLight = new THREE.PointLight(cfg.light.color, cfg.light.intensity, cfg.light.dist);
      rarityLight.position.set(0, 0, 2);
      scene.add(rarityLight);
    }

    // Build textures
    const faceTex = buildCardFace(card);
    const backTex = buildCardBack();

    // Card geometry — same proportions as pack, thin
    const geo = new THREE.BoxGeometry(1.6, 2.4, 0.04);

    const edgeMat  = new THREE.MeshStandardMaterial({ color: 0x0f160f, roughness: 0.9 });
    const frontMat = new THREE.MeshStandardMaterial({
      map: faceTex,
      roughness: 0.7,
      metalness: card.rarity === 'legendary' ? 0.3 : 0.05,
      emissive: new THREE.Color(cfg.emissive),
      emissiveIntensity: cfg.emissiveIntensity,
    });
    const backMat  = new THREE.MeshStandardMaterial({ map: backTex, roughness: 0.8, metalness: 0.05 });

    // BoxGeometry face order: +X, -X, +Y, -Y, +Z (front), -Z (back)
    cardMesh = new THREE.Mesh(geo, [edgeMat, edgeMat, edgeMat, edgeMat, frontMat, backMat]);

    // Start face-down (rotated 180° on Y so back faces camera)
    cardMesh.rotation.y = Math.PI;
    scene.add(cardMesh);

    // Kick off flip
    isFlipping   = true;
    flipProgress = 0;
    flipDone     = false;
    onFlipComplete = callback || null;
    idleT = 0;
  }

  // ─── Animation ─────────────────────────────────────────────────────────────

  function animate() {
    animFrame = requestAnimationFrame(animate);
    if (!renderer || !scene || !camera) return;

    idleT += 0.014;

    if (isFlipping && cardMesh) {
      flipProgress += 0.032;

      // Ease out cubic
      const t    = Math.min(flipProgress, 1);
      const ease = 1 - Math.pow(1 - t, 3);

      // Flip from π → 0 (back to front)
      cardMesh.rotation.y = Math.PI * (1 - ease);

      // Slight rise during flip
      cardMesh.position.y = Math.sin(t * Math.PI) * 0.15;

      if (t >= 1 && !flipDone) {
        flipDone   = true;
        isFlipping = false;
        if (onFlipComplete) { onFlipComplete(); onFlipComplete = null; }
      }

    } else if (cardMesh && !isFlipping) {
      // Idle float — gentle tilt, no full rotation
      const idleY = Math.sin(idleT * 0.6) * 0.04;
      const idleX = Math.cos(idleT * 0.4) * 0.02;
      cardMesh.rotation.y = lerp(cardMesh.rotation.y, idleY, 0.05);
      cardMesh.rotation.x = lerp(cardMesh.rotation.x, idleX, 0.05);
      cardMesh.position.y = lerp(cardMesh.position.y, Math.sin(idleT * 0.8) * 0.03, 0.08);
    }

    // Rarity light pulse
    if (rarityLight) {
      const cfg = RARITY[currentRarity];
      if (currentRarity === 'legendary') {
        rarityLight.intensity = cfg.light.intensity + Math.sin(idleT * 2) * 0.8;
      } else if (currentRarity === 'rare') {
        rarityLight.intensity = cfg.light.intensity + Math.sin(idleT * 1.4) * 0.4;
      }
    }

    renderer.render(scene, camera);
  }

  function lerp(a, b, t) { return a + (b - a) * t; }

  // ─── Destroy ───────────────────────────────────────────────────────────────

  function destroy() {
    cancelAnimationFrame(animFrame);
    animFrame = null;
    if (cardMesh) {
      scene?.remove(cardMesh);
      cardMesh.geometry?.dispose();
      cardMesh.material?.forEach?.(m => m.dispose());
      cardMesh = null;
    }
    if (rarityLight) { scene?.remove(rarityLight); rarityLight = null; }
    renderer?.dispose();
    renderer = null;
    scene    = null;
    camera   = null;
  }

  return { init, showCard, destroy };
})();
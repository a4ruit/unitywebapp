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
  let borderAnimFrame = 0;

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

  // Theme: 'garbage' = orange, 'ewaste' = blue
  let _packTheme = 'garbage';
  function setPackTheme(theme) { _packTheme = theme; }

  function themeCol(alpha = 1) {
    if (_packTheme === 'ewaste')  return `rgba(40,140,255,${alpha})`;
    if (_packTheme === 'adpack')  return `rgba(200,160,40,${alpha})`;
    return `rgba(232,92,26,${alpha})`;
  }
  function themeBg() {
    if (_packTheme === 'ewaste') return '#0a0f18';
    if (_packTheme === 'adpack') return '#12100a';
    return '#0f160f';
  }
  function themeGrid() {
    if (_packTheme === 'ewaste') return 'rgba(40,100,255,0.15)';
    if (_packTheme === 'adpack') return 'rgba(200,160,40,0.18)';
    return 'rgba(42,122,42,0.18)';
  }
  function themeHex() {
    if (_packTheme === 'ewaste') return '#288cff';
    if (_packTheme === 'adpack') return '#c8a028';
    return '#e85c1a';
  }
  function themeGlow() {
    if (_packTheme === 'ewaste') return 'rgba(40,140,255,0.6)';
    if (_packTheme === 'adpack') return 'rgba(200,160,40,0.8)';
    return 'rgba(232,92,26,0.6)';
  }
  function themeAccent() {
    if (_packTheme === 'ewaste') return 'rgba(0,220,255,0.5)';
    if (_packTheme === 'adpack') return 'rgba(255,220,80,0.7)';
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
      // Deep green-black gradient base
      const bg = ctx.createRadialGradient(128, 160, 20, 128, 192, 200);
      bg.addColorStop(0,   '#1a2a1a');
      bg.addColorStop(0.6, '#0d150d');
      bg.addColorStop(1,   '#070d07');
      ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

      // Subtle diagonal grain
      ctx.strokeStyle = 'rgba(42,122,42,0.12)'; ctx.lineWidth = 1;
      for (let x = -H; x < W + H; x += 18) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + H, H); ctx.stroke();
      }

      // Prismatic sheen — muted for garbage
      drawPrismatic(ctx, W, H, 0.06, 0);

    } else if (_packTheme === 'ewaste') {
      // Deep blue-black
      const bg = ctx.createRadialGradient(128, 160, 20, 128, 192, 200);
      bg.addColorStop(0,   '#0a1220');
      bg.addColorStop(0.6, '#060c18');
      bg.addColorStop(1,   '#030609');
      ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

      // Circuit traces
      ctx.strokeStyle = 'rgba(40,100,220,0.14)'; ctx.lineWidth = 1;
      for (let y = 16; y < H; y += 24) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke(); }
      for (let x = 16; x < W; x += 24) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,H); ctx.stroke(); }
      ctx.fillStyle = 'rgba(40,100,220,0.14)';
      for (let y = 16; y < H; y += 24) for (let x = 16; x < W; x += 24) {
        ctx.beginPath(); ctx.arc(x,y,2,0,Math.PI*2); ctx.fill();
      }

      // Blue-cyan prismatic sheen
      drawPrismatic(ctx, W, H, 0.08, 180);

    } else if (_packTheme === 'adpack') {
      // Premium black with gold tint
      const bg = ctx.createRadialGradient(128, 160, 10, 128, 192, 220);
      bg.addColorStop(0,   '#1c1508');
      bg.addColorStop(0.5, '#100d04');
      bg.addColorStop(1,   '#060401');
      ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

      // Full prismatic rainbow — toned down for readability
      drawPrismatic(ctx, W, H, 0.14, 0);

      // Gold diagonal stripes over the rainbow
      ctx.strokeStyle = 'rgba(200,160,40,0.09)'; ctx.lineWidth = 2;
      for (let x = -H; x < W+H; x += 14) {
        ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x+H,H); ctx.stroke();
      }
    }

    // ── SCANLINES ─────────────────────────────────────────────────────────────
    for (let y = 0; y < H; y += 4) {
      ctx.fillStyle = 'rgba(0,0,0,0.1)';
      ctx.fillRect(0, y+2, W, 2);
    }

    // ── OUTER GLOW BORDER ─────────────────────────────────────────────────────
    if (_packTheme === 'adpack') {
      // Thin animated rainbow frame (clean neon style).
      const hueShift = (animT * 65) % 360;
      const frameGrad = ctx.createLinearGradient(4, 4, W - 4, H - 4);
      for (let i = 0; i <= 8; i++) {
        const hue = (hueShift + i * 45) % 360;
        frameGrad.addColorStop(i / 8, `hsla(${hue},100%,68%,0.95)`);
      }
      ctx.strokeStyle = frameGrad;
      ctx.lineWidth = 3;
      ctx.shadowColor = 'rgba(255,255,255,0.35)';
      ctx.shadowBlur = 6;
      ctx.strokeRect(4, 4, W - 8, H - 8);
      ctx.shadowBlur = 0;

      // Fine inner frame for the "card" look.
      const innerGrad = ctx.createLinearGradient(10, 10, W - 10, H - 10);
      for (let i = 0; i <= 6; i++) {
        const hue = (hueShift + 20 + i * 60) % 360;
        innerGrad.addColorStop(i / 6, `hsla(${hue},100%,74%,0.55)`);
      }
      ctx.strokeStyle = innerGrad;
      ctx.lineWidth = 1.2;
      ctx.strokeRect(10, 10, W - 20, H - 20);

      // Subtle corner accents like reference card borders.
      const c = 14;
      ctx.lineWidth = 2;
      [[10,10,1,1],[W-10,10,-1,1],[10,H-10,1,-1],[W-10,H-10,-1,-1]].forEach(([x,y,sx,sy], i) => {
        const hue = (hueShift + i * 90) % 360;
        ctx.strokeStyle = `hsla(${hue},100%,75%,0.9)`;
        ctx.beginPath();
        ctx.moveTo(x, y + sy * c);
        ctx.lineTo(x, y);
        ctx.lineTo(x + sx * c, y);
        ctx.stroke();
      });

    } else if (_packTheme === 'ewaste') {
      drawGlowBorder(ctx, 4, 4, W-8, H-8, '#288cff', 'rgba(40,140,255,0.8)');
      // Cyan inner line
      ctx.strokeStyle = 'rgba(0,220,255,0.3)'; ctx.lineWidth = 1;
      ctx.strokeRect(10, 10, W-20, H-20);
      // Prismatic shimmer on border
      drawPrismatic(ctx, W, H, 0.06, 200);

    } else {
      drawGlowBorder(ctx, 4, 4, W-8, H-8, '#e85c1a', 'rgba(232,92,26,0.7)');
      ctx.strokeStyle = 'rgba(255,140,40,0.3)'; ctx.lineWidth = 1;
      ctx.strokeRect(10, 10, W-20, H-20);
    }

    // ── CORNER BRACKETS ───────────────────────────────────────────────────────
    const bPad = 16, bSize = 20, bW = 3;
    const bracketCol = _packTheme === 'adpack' ? '#ffd700' : _packTheme === 'ewaste' ? '#00dcff' : '#e85c1a';
    ctx.strokeStyle = bracketCol; ctx.lineWidth = bW;
    ctx.shadowColor = bracketCol; ctx.shadowBlur = 8;
    [[bPad,bPad,1,1],[W-bPad,bPad,-1,1],[bPad,H-bPad,1,-1],[W-bPad,H-bPad,-1,-1]].forEach(([x,y,sx,sy]) => {
      ctx.beginPath(); ctx.moveTo(x, y+sy*bSize); ctx.lineTo(x,y); ctx.lineTo(x+sx*bSize,y); ctx.stroke();
    });
    ctx.shadowBlur = 0;

    // ── SPARKLES ──────────────────────────────────────────────────────────────
    // More sparkles for adpack, fewer for others
      const sparkleCount = _packTheme === 'adpack' ? 12 : _packTheme === 'ewaste' ? 8 : 5;
    const sparklePositions = [
      [40,60],[216,60],[40,324],[216,324],
      [128,40],[128,344],[20,192],[236,192],
      [70,120],[186,120],[70,264],[186,264],
      [128,192],[55,192],
    ].slice(0, sparkleCount);
    const sparkleColors = _packTheme === 'adpack'
      ? ['rgba(255,220,80,0.9)','rgba(255,255,255,0.95)','rgba(255,180,0,0.8)','rgba(200,255,100,0.7)','rgba(100,200,255,0.7)','rgba(255,100,200,0.7)']
      : _packTheme === 'ewaste'
      ? ['rgba(0,220,255,0.9)','rgba(255,255,255,0.9)','rgba(40,140,255,0.8)','rgba(180,100,255,0.7)']
      : ['rgba(255,140,40,0.85)','rgba(255,255,255,0.9)','rgba(200,80,20,0.7)'];
    sparklePositions.forEach(([sx,sy], i) => {
      const col   = sparkleColors[i % sparkleColors.length];
      const size  = _packTheme === 'adpack' ? 16 + (i%3)*5 : 12 + (i%3)*4;
      drawSparkle(ctx, sx, sy, size, col, _packTheme === 'adpack' ? 0.55 + (i%3)*0.08 : 0.7 + (i%3)*0.1);
    });

    // ── CENTRAL ICON ──────────────────────────────────────────────────────────
    const iconY = 196;
    const ringY = iconY - 26;
    const icon  = _packTheme === 'ewaste' ? '⬡' : _packTheme === 'adpack' ? '★' : '◈';

    if (_packTheme === 'adpack') {
      // Radial gold glow behind icon
      const iconGlow = ctx.createRadialGradient(128, ringY, 0, 128, ringY, 70);
      iconGlow.addColorStop(0,   'rgba(200,160,40,0.28)');
      iconGlow.addColorStop(0.4, 'rgba(200,160,40,0.10)');
      iconGlow.addColorStop(1,   'rgba(0,0,0,0)');
      ctx.fillStyle = iconGlow; ctx.fillRect(58, ringY - 70, 140, 140);
      // Rainbow ring
      for (let a = 0; a < Math.PI*2; a += 0.15) {
        const hue = (a / (Math.PI*2)) * 360;
        ctx.beginPath();
        ctx.arc(128, ringY, 52, a, a+0.16);
        ctx.strokeStyle = `hsla(${hue},100%,65%,0.48)`;
        ctx.lineWidth = 2.2; ctx.stroke();
      }
      // Gold star with heavy shadow
      ctx.font = 'bold 80px "VT323", monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffd700';
      ctx.shadowColor = 'rgba(255,200,0,0.9)'; ctx.shadowBlur = 18;
      ctx.fillText(icon, 128, iconY);
      ctx.shadowColor = 'rgba(255,100,0,0.38)'; ctx.shadowBlur = 26;
      ctx.fillText(icon, 128, iconY);
      ctx.shadowBlur = 0;
      // White hot centre sparkle
      drawSparkle(ctx, 128, ringY, 28, 'rgba(255,255,255,0.95)', 0.9);

    } else {
      ctx.font = 'bold 72px "VT323", monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = themeHex();
      ctx.shadowColor = themeGlow(); ctx.shadowBlur = 20;
      ctx.fillText(icon, 128, iconY);
      ctx.shadowBlur = 0;
    }

    // ── TEXT ──────────────────────────────────────────────────────────────────
    const packName = _packTheme === 'ewaste' ? 'E-WASTE PACK' : _packTheme === 'adpack' ? 'AD PACK' : 'GARBAGE PACK';

    if (_packTheme === 'adpack') {
      // Gold gradient name
      const nameGrad = ctx.createLinearGradient(60, 0, 196, 0);
      nameGrad.addColorStop(0,   '#c8a028');
      nameGrad.addColorStop(0.3, '#ffd700');
      nameGrad.addColorStop(0.6, '#ffe55a');
      nameGrad.addColorStop(1,   '#c8a028');
      ctx.fillStyle = nameGrad;
      ctx.shadowColor = 'rgba(200,160,40,0.65)'; ctx.shadowBlur = 8;
      ctx.font = '24px "VT323", monospace'; ctx.textAlign = 'center';
      ctx.fillText(packName, 128, 236);
      ctx.shadowBlur = 0;
      // EXCLUSIVE badge
      ctx.font = '9px "Share Tech Mono", monospace';
      ctx.fillStyle = 'rgba(255,220,80,0.6)';
      ctx.fillText('✦ EXCLUSIVE ✦', 128, 252);
    } else {
      ctx.font = '22px "VT323", monospace'; ctx.textAlign = 'center';
      ctx.fillStyle = '#e8e0c8';
      ctx.shadowColor = themeGlow(); ctx.shadowBlur = 6;
      ctx.fillText(packName, 128, 222);
      ctx.shadowBlur = 0;
    }

    ctx.font = '11px "Share Tech Mono", monospace';
    ctx.fillStyle = 'rgba(232,224,200,0.35)';
    ctx.fillText('4 cards inside', 128, 264);

    ctx.font = '11px "Share Tech Mono", monospace';
    ctx.fillStyle = themeAccent();
    ctx.fillText('← swipe to open →', 128, 352);

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
      drawPrismatic(ctx, W, H, 0.08, 60);
      ctx.strokeStyle = 'rgba(200,160,40,0.1)'; ctx.lineWidth = 2;
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
      ctx.strokeStyle = '#c8a028'; ctx.lineWidth = 4;
      ctx.shadowColor = 'rgba(200,160,40,0.55)'; ctx.shadowBlur = 8;
      ctx.strokeRect(6, 6, W-12, H-12);
      ctx.shadowBlur = 0;
      ctx.strokeStyle = 'rgba(255,220,80,0.25)'; ctx.lineWidth = 1;
      ctx.strokeRect(12, 12, W-24, H-24);
    } else {
      ctx.strokeStyle = themeHex(); ctx.lineWidth = 4;
      ctx.shadowColor = themeGlow(); ctx.shadowBlur = 10;
      ctx.strokeRect(6, 6, W-12, H-12);
      ctx.shadowBlur = 0;
    }

    // Corner sparkles on back
    const bkSparkleCol = _packTheme === 'adpack' ? 'rgba(255,220,80,0.8)' : _packTheme === 'ewaste' ? 'rgba(0,200,255,0.8)' : 'rgba(232,92,26,0.7)';
    [[30,40],[226,40],[30,344],[226,344]].forEach(([sx,sy]) => {
      drawSparkle(ctx, sx, sy, 14, bkSparkleCol, 0.6);
    });

    // Centre text
    ctx.font = '44px "VT323", monospace';
    ctx.textAlign = 'center';
    if (_packTheme === 'adpack') {
      const ng = ctx.createLinearGradient(60, 0, 196, 0);
      ng.addColorStop(0, 'rgba(200,160,40,0.3)'); ng.addColorStop(0.5, 'rgba(255,220,80,0.4)'); ng.addColorStop(1, 'rgba(200,160,40,0.3)');
      ctx.fillStyle = ng;
    } else {
      ctx.fillStyle = themeCol(0.22);
    }
    ctx.fillText(_packTheme === 'ewaste' ? 'E-WASTE' : _packTheme === 'adpack' ? 'AD PACK' : 'GARBAGE', 128, 200);

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

    updateParticles();

    const baseIntensity = _packTheme === 'adpack' ? 3.1 : _packTheme === 'ewaste' ? 3.0 : 2.5;
    rimLight.intensity = baseIntensity + Math.sin(idleT * 1.2) * (baseIntensity * 0.15);

    // Add subtle continuous motion on adpack textures so the face feels alive.
    if (packMesh && _packTheme === 'adpack') {
      if (borderAnimFrame % 4 === 0 && packMesh.material?.[4]) {
        const prevFace = packMesh.material[4].map;
        const nextFace = buildFaceTexture(idleT);
        packMesh.material[4].map = nextFace;
        packMesh.material[4].needsUpdate = true;
        if (prevFace) prevFace.dispose();
      }
      const frontMap = packMesh.material?.[4]?.map;
      const backMap  = packMesh.material?.[5]?.map;
      if (frontMap) {
        frontMap.center.set(0.5, 0.5);
        frontMap.rotation = Math.sin(idleT * 0.7) * 0.012;
        frontMap.offset.x = Math.sin(idleT * 0.35) * 0.01;
      }
      if (backMap) {
        backMap.center.set(0.5, 0.5);
        backMap.rotation = Math.sin(idleT * 0.55 + 0.8) * 0.008;
      }
      const pulse = 1 + Math.sin(idleT * 1.6) * 0.012;
      packMesh.scale.set(pulse, pulse, 1);
    } else if (packMesh) {
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
        rimLight.color.setStyle('#c8a028');
        rimLight.intensity = 3.1;
      } else if (_packTheme === 'ewaste') {
        rimLight.color.setStyle('#288cff');
        rimLight.intensity = 3.0;
      } else {
        rimLight.color.setStyle('#e85c1a');
        rimLight.intensity = 2.5;
      }
    }
    clearParticles();
  }

  function destroy() {
    cancelAnimationFrame(animFrame);
    clearParticles();
    renderer?.dispose();
  }

  return { init, throwPack, resetPack, destroy, setPackTheme, get isReady() { return isReady; } };
})();
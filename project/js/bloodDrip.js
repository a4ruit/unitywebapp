// Blood drip overlay — pixelated, two-layer canvas system.
// Renders at 1/PIXEL resolution, scaled up with image-rendering:pixelated.
// Triggered after 3 pack opens. Stains accumulate permanently until reload.

const BloodDrip = (() => {
  const PIXEL = 5; // each grid unit = 5×5 screen pixels

  let stainCanvas, stainCtx; // permanent stain layer — never cleared
  let dripCanvas,  dripCtx;  // active drip layer — cleared each frame
  let GW, GH;                // grid dimensions

  let drips       = [];
  let packsOpened = 0;
  let running     = false;
  let raf         = null;
  let spawnTimer  = null;

  // ── Init ─────────────────────────────────────────────────────────────────

  function init() {
    GW = Math.ceil(window.innerWidth  / PIXEL);
    GH = Math.ceil(window.innerHeight / PIXEL);

    const shared = {
      position: 'fixed', top: '0', left: '0',
      width: '100%', height: '100%',
      pointerEvents: 'none',
      imageRendering: 'pixelated',
    };

    stainCanvas = document.createElement('canvas');
    stainCanvas.width  = GW;
    stainCanvas.height = GH;
    Object.assign(stainCanvas.style, { ...shared, zIndex: '149' });
    stainCtx = stainCanvas.getContext('2d');
    stainCtx.imageSmoothingEnabled = false;

    dripCanvas = document.createElement('canvas');
    dripCanvas.width  = GW;
    dripCanvas.height = GH;
    Object.assign(dripCanvas.style, { ...shared, zIndex: '150' });
    dripCtx = dripCanvas.getContext('2d');
    dripCtx.imageSmoothingEnabled = false;

    document.body.appendChild(stainCanvas);
    document.body.appendChild(dripCanvas);
  }

  // ── Colour ───────────────────────────────────────────────────────────────

  function bloodColor(level) {
    const r = Math.max(90,  185 - level * 8);
    const g = Math.max(0,   12  - level);
    const b = Math.max(0,   12  - level);
    return `rgb(${r},${g},${b})`;
  }

  // ── Pixel primitives ─────────────────────────────────────────────────────

  // Diamond blob with jittered edges for organic pixel look
  function blob(ctx, cx, cy, r) {
    cx = Math.floor(cx); cy = Math.floor(cy);
    for (let dy = -r; dy <= r; dy++) {
      const hw = r - Math.abs(dy) + (Math.random() > 0.62 ? 1 : 0);
      if (hw < 0) continue;
      ctx.fillRect(cx - hw, cy + dy, hw * 2 + 1, 1);
    }
  }

  // Scattered pixel droplets radiating from centre
  function splatter(ctx, cx, cy, minR, maxR, count) {
    cx = Math.floor(cx); cy = Math.floor(cy);
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist  = minR + Math.random() * (maxR - minR);
      const size  = 1 + Math.floor(Math.random() * 2);
      ctx.fillRect(
        Math.floor(cx + Math.cos(angle) * dist),
        Math.floor(cy + Math.sin(angle) * dist),
        size, size
      );
    }
  }

  // ── S-bend + width helpers ────────────────────────────────────────────────

  // Grid-x at a given y along the drip's sine path.
  function getX(d, y) {
    return Math.floor(d.baseX + Math.sin(y * d.bendFreq + d.phase) * d.bendAmp);
  }

  // Width in grid pixels at a given y — slow sine gives organic bulges.
  function getW(d, y) {
    const raw = 1 + d.widthAmp * (0.5 + 0.5 * Math.sin(y * d.widthFreq + d.widthPhase));
    return Math.max(1, Math.round(raw));
  }

  // ── Drip spawning ─────────────────────────────────────────────────────────

  function intensity() {
    return Math.max(0, Math.floor((packsOpened - 3) / 1.5));
  }

  function spawnDrip() {
    const level = intensity();
    const headR = 1 + Math.floor(Math.random() * 2);

    drips.push({
      baseX:    1 + Math.floor(Math.random() * (GW - 2)),
      startY:   -headR,
      y:        -headR,
      // Slower: roughly one grid-pixel every 12–25 frames
      vy:       0.04 + Math.random() * 0.06 + Math.min(level, 10) * 0.006,
      headR,
      color:    bloodColor(Math.min(level, 12)),
      // S-bend: one full curve spans roughly 80–160 grid pixels (most of screen height)
      phase:      Math.random() * Math.PI * 2,
      bendFreq:   0.035 + Math.random() * 0.035,
      bendAmp:    1 + Math.random() * 1.5,
      // Width variation: slow bulge/narrow cycle along the streak
      widthPhase: Math.random() * Math.PI * 2,
      widthFreq:  0.08 + Math.random() * 0.10,
      widthAmp:   0.6 + Math.random() * 1.4,
    });
  }

  // ── Drawing ───────────────────────────────────────────────────────────────

  function drawStreak(ctx, d, fromY, toY) {
    const y0 = Math.max(0,       Math.floor(fromY));
    const y1 = Math.min(GH - 1,  Math.floor(toY));
    for (let y = y0; y <= y1; y++) {
      const cx = getX(d, y);
      const w  = getW(d, y);
      ctx.fillRect(cx - Math.floor(w / 2), y, w, 1);
    }
  }

  function drawActiveDrip(d) {
    dripCtx.fillStyle = d.color;
    // Anchor blob at the top of the drip
    if (d.startY >= -d.headR) blob(dripCtx, getX(d, d.startY), d.startY, d.headR);
    // Full S-bend streak from anchor to current tip
    drawStreak(dripCtx, d, d.startY + d.headR, d.y - d.headR);
    // Falling teardrop at current tip
    blob(dripCtx, getX(d, d.y), d.y, d.headR);
  }

  // ── Commit to permanent stain ─────────────────────────────────────────────

  function commitStain(d) {
    stainCtx.fillStyle = d.color;

    // Bake anchor blob
    const anchorY = Math.max(0, d.startY);
    blob(stainCtx, getX(d, d.startY), anchorY, d.headR);

    // Bake full S-bend streak
    drawStreak(stainCtx, d, d.startY + d.headR, d.y);

    // Splat pool at landing
    const ex     = getX(d, d.y);
    const ey     = Math.min(GH - 1, Math.floor(d.y));
    const splatR = d.headR + 1 + Math.floor(Math.random() * 3);
    blob(stainCtx, ex, ey, splatR);

    // Scattered droplets around splat
    splatter(stainCtx, ex, ey, splatR + 1, splatR + 5, 6 + Math.floor(Math.random() * 8));

    // 1–3 sub-drips hanging below the splat
    const subCount = 1 + Math.floor(Math.random() * 3);
    for (let i = 0; i < subCount; i++) {
      const sx = ex + Math.floor((Math.random() - 0.5) * splatR * 2);
      const sy = ey + splatR;
      const sl = 3 + Math.floor(Math.random() * 6);
      if (sy < GH) {
        stainCtx.fillRect(sx, sy, 1, Math.min(sl, GH - sy));
        stainCtx.fillRect(sx - 1, sy + sl, 3, 1); // pixel at sub-drip tip
      }
    }
  }

  // ── Animation loop ────────────────────────────────────────────────────────

  function update() {
    dripCtx.clearRect(0, 0, GW, GH);

    drips = drips.filter(d => {
      d.y += d.vy;

      if (d.y >= GH) {
        commitStain(d);
        return false;
      }

      // Occasionally sticks mid-screen (surface tension)
      if ((d.y - d.startY) > 35 && Math.random() < 0.002) {
        commitStain(d);
        return false;
      }

      drawActiveDrip(d);
      return true;
    });
  }

  function loop() {
    update();
    raf = requestAnimationFrame(loop);
  }

  // ── Spawn scheduling ──────────────────────────────────────────────────────

  function scheduleNextSpawn() {
    if (!running) return;
    const level    = intensity();
    const interval = Math.max(280, 2800 - level * 220);
    spawnTimer     = setTimeout(() => {
      const count = 1 + Math.floor(level / 3);
      for (let i = 0; i < count; i++) spawnDrip();
      scheduleNextSpawn();
    }, interval + Math.random() * interval * 0.5);
  }

  // ── Public API ────────────────────────────────────────────────────────────

  function onPackOpened() {
    packsOpened++;

    if (!running && packsOpened >= 3) {
      running = true;
      init();
      loop();
      scheduleNextSpawn();
    }

    if (!running) return;

    const level = intensity();
    const burst = 1 + Math.floor(level / 2);
    for (let i = 0; i < burst; i++) {
      setTimeout(() => spawnDrip(), i * 130);
    }
    if (packsOpened >= 7)  setTimeout(() => { spawnDrip(); spawnDrip(); }, 500);
    if (packsOpened >= 12) setTimeout(() => { for (let i = 0; i < 3; i++) spawnDrip(); }, 900);
  }

  return { onPackOpened };
})();

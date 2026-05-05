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

  // ── Smear interaction ─────────────────────────────────────────────────────

  function smearAt(gx, gy, vx, vy) {
    const speed = Math.sqrt(vx * vx + vy * vy);
    if (speed < 0.4) return;

    const radius   = 4;
    const smearLen = Math.min(Math.round(speed * 2), 7);
    const nx = vx / speed;
    const ny = vy / speed;

    // Only read/write the small patch around the cursor for performance
    const pad = radius + smearLen + 1;
    const rx  = Math.max(0, gx - pad);
    const ry  = Math.max(0, gy - pad);
    const rw  = Math.min(GW - rx, pad * 2 + 1);
    const rh  = Math.min(GH - ry, pad * 2 + 1);

    const img = stainCtx.getImageData(rx, ry, rw, rh);
    const d   = img.data;

    function idx(x, y) {
      const lx = x - rx, ly = y - ry;
      if (lx < 0 || ly < 0 || lx >= rw || ly >= rh) return -1;
      return (ly * rw + lx) * 4;
    }

    // Collect blood pixels inside brush radius (read before any writes)
    const sources = [];
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (dx * dx + dy * dy > radius * radius) continue;
        const sx = gx + dx, sy = gy + dy;
        const si = idx(sx, sy);
        if (si < 0) continue;
        const a = d[si + 3];
        if (a < 15) continue;
        sources.push({ sx, sy, si, r: d[si], g: d[si+1], b: d[si+2], a });
      }
    }

    for (const src of sources) {
      // Wipe: fade the source pixel
      d[src.si + 3] = Math.max(0, src.a - Math.round(src.a * 0.22));

      // Smear: push blood forward along drag direction with falloff
      for (let s = 1; s <= smearLen; s++) {
        const tx = Math.round(src.sx + nx * s);
        const ty = Math.round(src.sy + ny * s);
        const ti = idx(tx, ty);
        if (ti < 0) break;

        const t      = 1 - s / (smearLen + 1);
        const addA   = Math.round(src.a * t * 0.55);
        const newA   = Math.min(255, d[ti + 3] + addA);
        if (newA <= d[ti + 3]) continue;

        const blend  = addA / newA;
        d[ti]     = Math.round(d[ti]     * (1 - blend) + src.r * blend);
        d[ti + 1] = Math.round(d[ti + 1] * (1 - blend) + src.g * blend);
        d[ti + 2] = Math.round(d[ti + 2] * (1 - blend) + src.b * blend);
        d[ti + 3] = newA;
      }
    }

    stainCtx.putImageData(img, rx, ry);
  }

  function initInteraction() {
    let down = false;
    let lgx = 0, lgy = 0;

    function toGrid(clientX, clientY) {
      return [Math.floor(clientX / PIXEL), Math.floor(clientY / PIXEL)];
    }

    function onDown(cx, cy) {
      down = true;
      [lgx, lgy] = toGrid(cx, cy);
    }

    function onMove(cx, cy) {
      if (!down) return;
      const [gx, gy] = toGrid(cx, cy);
      const vx = gx - lgx, vy = gy - lgy;
      if (vx !== 0 || vy !== 0) smearAt(gx, gy, vx, vy);
      lgx = gx; lgy = gy;
    }

    window.addEventListener('pointerdown', e => onDown(e.clientX, e.clientY));
    window.addEventListener('pointerup',   () => { down = false; });
    window.addEventListener('pointermove', e => onMove(e.clientX, e.clientY));
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

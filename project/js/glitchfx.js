// glitchfx.js — subtle "corruption" glitch particles, overlaid on the page and
// anchored to a card's LIVE screen location. Same overlay-particle approach as
// FlockFX (so the bits can sit beyond the card edges without clipping), but the
// particles are flickering ASCII glyphs with occasional RGB-split instead of
// sheep. Used when a corrupted (Fleshling) card is pulled.
//
// Exposes:
//   GlitchFX.start(getRect)  getRect() -> the card's viewport rect or null to
//                            pause (see FlockFX for the same contract).
//   GlitchFX.stop()

const GlitchFX = (() => {

  let canvas = null, ctx = null, raf = null;
  let getRect = null, fade = 0, lastRect = null;

  const GLYPHS = '01#%@&*/\\|<>=+~:;';

  // Particles anchored by fractions of the card rect; nx/ny < 0 or > 1 sit
  // beyond the edges. Kept close + sparse so the corruption stays subtle.
  const BITS = [
    { nx: -0.04, ny: 0.20, ph: 0.0 },
    { nx:  1.03, ny: 0.34, ph: 1.1 },
    { nx: -0.02, ny: 0.58, ph: 2.3 },
    { nx:  1.04, ny: 0.72, ph: 3.5 },
    { nx:  0.30, ny: -0.05, ph: 4.7 },
    { nx:  0.66, ny: -0.03, ph: 0.6 },
    { nx:  0.18, ny: 1.04, ph: 1.8 },
    { nx:  0.74, ny: 1.05, ph: 3.0 },
    { nx: -0.03, ny: 0.86, ph: 4.2 },
    { nx:  1.02, ny: 0.16, ph: 5.4 },
    { nx:  0.48, ny: 1.06, ph: 2.7 },
    { nx:  0.92, ny: 0.50, ph: 0.9 },
  ];

  function _ensure() {
    if (canvas) { canvas.style.display = 'block'; return; }
    canvas = document.createElement('canvas');
    canvas.style.cssText =
      'position:fixed;inset:0;width:100vw;height:100vh;' +
      'pointer-events:none;z-index:900;image-rendering:pixelated;';
    document.body.appendChild(canvas);
    ctx = canvas.getContext('2d');
  }

  function _resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = window.innerWidth, h = window.innerHeight;
    const bw = Math.round(w * dpr), bh = Math.round(h * dpr);
    if (canvas.width !== bw || canvas.height !== bh) { canvas.width = bw; canvas.height = bh; }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { w, h };
  }

  function _loop() {
    raf = requestAnimationFrame(_loop);
    if (!ctx) return;
    const { w, h } = _resize();
    ctx.clearRect(0, 0, w, h);

    const rect = getRect ? getRect() : null;
    if (rect) lastRect = rect;
    fade += ((rect ? 1 : 0) - fade) * 0.12;
    if (fade < 0.02 || !lastRect) return;

    const r  = lastRect;
    const t  = performance.now() / 1000;
    const sz = Math.max(7, r.height * 0.05);

    ctx.save();
    ctx.font         = `${sz}px monospace`;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';

    BITS.forEach((b, i) => {
      // Slow, deterministic breathe — each glyph eases in and out on its own
      // phase instead of random per-frame flicker. Off for half its cycle.
      const cyc = Math.sin(t * 0.7 + b.ph);
      if (cyc <= 0) return;
      const vis = cyc * cyc;                          // smooth ramp 0..1

      // Gentle controlled drift, not jitter.
      const cx = r.left + b.nx * r.width  + Math.cos(t * 0.5 + b.ph) * sz * 0.16;
      const cy = r.top  + b.ny * r.height + Math.sin(t * 0.4 + b.ph) * sz * 0.16;
      const a  = fade * (0.16 + 0.32 * vis);

      // Glyph swaps on a slow stepped cadence (~1/s), not every frame.
      const ch = GLYPHS[(i + Math.floor(t * 0.9 + b.ph)) % GLYPHS.length];

      // Steady, subtle chromatic split.
      ctx.globalCompositeOperation = 'screen';
      ctx.fillStyle = `rgba(255,55,55,${a * 0.5})`;
      ctx.fillText(ch, cx - 1.2, cy);
      ctx.fillStyle = `rgba(55,255,255,${a * 0.5})`;
      ctx.fillText(ch, cx + 1.2, cy);
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = `rgba(232,232,232,${a})`;
      ctx.fillText(ch, cx, cy);
    });

    // One slow tear shard that drifts down the card and fades in/out on a slow
    // cycle — controlled, not random per-frame.
    const shard = Math.sin(t * 0.45);
    if (shard > 0.4) {
      const sv = (shard - 0.4) / 0.6;                 // 0..1 within the window
      const ty = r.top + ((t * 0.1) % 1) * r.height;
      ctx.fillStyle = `rgba(20,20,20,${fade * 0.22 * sv})`;
      ctx.fillRect(r.left + r.width * 0.1, ty, r.width * 0.5, 2);
    }

    ctx.restore();
  }

  function start(getRectFn) {
    _ensure();
    getRect  = getRectFn;
    lastRect = null;
    if (!raf) _loop();
  }

  function stop() {
    getRect = null;
    if (raf) { cancelAnimationFrame(raf); raf = null; }
    if (ctx && canvas) ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (canvas) canvas.style.display = 'none';
    fade = 0; lastRect = null;
  }

  return { start, stop };
})();

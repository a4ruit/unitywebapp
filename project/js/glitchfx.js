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
      // Flicker: each bit blinks on/off sporadically so it reads as glitchy and
      // subtle rather than a steady particle.
      if (Math.random() > 0.45) return;
      const jx = (Math.random() - 0.5) * sz * 0.9;
      const jy = (Math.random() - 0.5) * sz * 0.5;
      const cx = r.left + b.nx * r.width  + jx;
      const cy = r.top  + b.ny * r.height + jy;
      const a  = fade * (0.22 + Math.random() * 0.35);
      const ch = GLYPHS[(i + (Math.random() * GLYPHS.length | 0)) % GLYPHS.length];

      // Occasional chromatic-aberration split.
      if (Math.random() < 0.4) {
        ctx.globalCompositeOperation = 'screen';
        ctx.fillStyle = `rgba(255,40,40,${a * 0.7})`;
        ctx.fillText(ch, cx - 1.5, cy);
        ctx.fillStyle = `rgba(40,255,255,${a * 0.7})`;
        ctx.fillText(ch, cx + 1.5, cy);
        ctx.globalCompositeOperation = 'source-over';
      }
      ctx.fillStyle = `rgba(232,232,232,${a})`;
      ctx.fillText(ch, cx, cy);
    });

    // Sparse tear shards — thin dark/bright bars that snap in occasionally.
    if (Math.random() < 0.5) {
      const ty = r.top + Math.random() * r.height;
      const tw = r.width * (0.2 + Math.random() * 0.5);
      const tx = r.left - r.width * 0.05 + Math.random() * r.width * 0.6;
      ctx.fillStyle = `rgba(${Math.random() < 0.5 ? '0,0,0' : '235,235,235'},${fade * 0.25})`;
      ctx.fillRect(tx, ty, tw, 1 + Math.random() * 2);
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

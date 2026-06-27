// flockfx.js — floating "Flock o' Sheep" particles, overlaid on the page and
// anchored to a card's LIVE screen location. Because the sheep are drawn on a
// full-viewport overlay (not inside the card texture), they can drift BEYOND the
// card's edges without being clipped — the "treat it like particles" approach,
// mirroring the pack scatter on the main screen but targeting a card's quadrant.
//
// Exposes:
//   FlockFX.start(getRect)  getRect() -> the target card's viewport rect (a
//                           DOMRect / {left,top,width,height}) or null to pause
//                           (e.g. before the card flips, or after it's picked).
//                           The flock fades in/out as the rect appears/clears.
//   FlockFX.stop()          tear down the overlay loop.

const FlockFX = (() => {

  let canvas = null, ctx = null, raf = null;
  let getRect = null, t0 = 0, fade = 0, lastRect = null;

  // Sheep sprite (same art the card uses). Loaded once, lazily.
  const img = new Image();
  let imgReady = false;
  img.onload = () => { imgReady = true; };
  img.src = 'assets/critter-symbol.png';

  // Each sheep is anchored by a fraction of the card rect: nx/ny in [0,1] is
  // inside the card; values < 0 or > 1 float BEYOND the edges. fl mirrors it.
  const FLOCK = [
    { nx: -0.20, ny: 0.28, s: 0.26, ph: 0.0, fl: false },
    { nx:  1.18, ny: 0.40, s: 0.24, ph: 1.3, fl: true  },
    { nx: -0.14, ny: 0.74, s: 0.30, ph: 2.6, fl: false },
    { nx:  1.12, ny: 0.66, s: 0.22, ph: 3.9, fl: true  },
    { nx:  0.42, ny: -0.20, s: 0.20, ph: 5.2, fl: false },
    { nx:  0.84, ny: -0.12, s: 0.18, ph: 0.7, fl: true  },
    { nx:  0.20, ny: 1.16, s: 0.24, ph: 2.0, fl: false },
    { nx:  0.72, ny: 1.18, s: 0.20, ph: 3.3, fl: true  },
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
    fade += ((rect ? 1 : 0) - fade) * 0.12;           // ease in/out
    if (!imgReady || fade < 0.02 || !lastRect) return;

    const r      = lastRect;
    const t      = performance.now() / 1000 - t0;
    const aspect = (img.naturalWidth / img.naturalHeight) || 1;
    const orbit  = r.width * 0.045;

    FLOCK.forEach((m) => {
      const cx = r.left + m.nx * r.width  + Math.cos(t * 0.9 + m.ph) * orbit;
      const cy = r.top  + m.ny * r.height + Math.sin(t * 1.3 + m.ph) * orbit
                        + Math.sin(t * 1.6 + m.ph) * 4;
      const hh = m.s * r.height;
      const ww = hh * aspect;
      ctx.save();
      ctx.globalAlpha = fade;
      ctx.imageSmoothingEnabled = false;
      ctx.shadowColor   = 'rgba(0,0,0,0.4)';
      ctx.shadowBlur    = 5;
      ctx.shadowOffsetY = 4;
      ctx.translate(cx, cy);
      if (m.fl) ctx.scale(-1, 1);
      ctx.drawImage(img, -ww / 2, -hh / 2, ww, hh);
      ctx.restore();
    });
  }

  function start(getRectFn) {
    _ensure();
    getRect  = getRectFn;
    lastRect = null;
    t0       = performance.now() / 1000;
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

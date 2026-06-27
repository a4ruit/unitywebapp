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
    { nx: -0.06, ny: 0.30, s: 0.19, ph: 0.0, fl: false },
    { nx:  1.05, ny: 0.44, s: 0.09, ph: 1.3, fl: true  },
    { nx: -0.02, ny: 0.70, s: 0.21, ph: 2.6, fl: false },
    { nx:  1.02, ny: 0.62, s: 0.08, ph: 3.9, fl: true  },
    { nx:  0.40, ny: -0.06, s: 0.13, ph: 5.2, fl: false },
    { nx:  0.82, ny: -0.02, s: 0.07, ph: 0.7, fl: true  },
    { nx:  0.22, ny: 1.05, s: 0.16, ph: 2.0, fl: false },
    { nx:  0.70, ny: 1.07, s: 0.11, ph: 3.3, fl: true  },
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
    const orbit  = r.width * 0.028;
    const locked = !!r.locked;

    // Match the card's locked treatment — grey + dim the whole flock so colour
    // and the radiant glow only appear once the player can afford the card.
    const wantFilter  = locked ? 'grayscale(1) brightness(0.55)' : 'none';
    const wantOpacity = locked ? '0.55' : '1';
    if (canvas.style.filter  !== wantFilter)  canvas.style.filter  = wantFilter;
    if (canvas.style.opacity !== wantOpacity) canvas.style.opacity = wantOpacity;

    FLOCK.forEach((m) => {
      const cx = r.left + m.nx * r.width  + Math.cos(t * 0.9 + m.ph) * orbit;
      const cy = r.top  + m.ny * r.height + Math.sin(t * 1.3 + m.ph) * orbit
                        + Math.sin(t * 1.6 + m.ph) * 3;
      const hh = m.s * r.height;
      const ww = hh * aspect;
      const pulse = 0.6 + 0.4 * Math.sin(t * 2.2 + m.ph);   // twinkle 0.2..1.0

      // Radiant halo — additive bluish-white starlight glow behind the sheep.
      // Suppressed while locked so there's no colour bleed on an unaffordable card.
      if (!locked) {
        const glowR = hh * 1.6;
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, glowR);
        g.addColorStop(0,    `rgba(205,220,255,${0.50 * pulse * fade})`);
        g.addColorStop(0.45, `rgba(150,180,255,${0.20 * pulse * fade})`);
        g.addColorStop(1,    'rgba(150,180,255,0)');
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(cx, cy, glowR, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // The sheep — luminous bluish rim when affordable, a plain drop shadow
      // (greyed by the canvas filter) when locked.
      ctx.save();
      ctx.globalAlpha = fade;
      ctx.imageSmoothingEnabled = false;
      ctx.translate(cx, cy);
      if (m.fl) ctx.scale(-1, 1);
      if (locked) {
        ctx.shadowColor   = 'rgba(0,0,0,0.45)';
        ctx.shadowBlur    = 4;
        ctx.shadowOffsetY = 3;
        ctx.drawImage(img, -ww / 2, -hh / 2, ww, hh);
      } else {
        ctx.shadowColor   = `rgba(215,230,255,${0.85 * pulse})`;
        ctx.shadowBlur    = hh * 0.7;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
        ctx.drawImage(img, -ww / 2, -hh / 2, ww, hh);   // glow pass
        ctx.shadowBlur    = 0;
        ctx.drawImage(img, -ww / 2, -hh / 2, ww, hh);   // crisp pass
      }
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
    if (canvas) { canvas.style.display = 'none'; canvas.style.filter = 'none'; canvas.style.opacity = '1'; }
    fade = 0; lastRect = null;
  }

  return { start, stop };
})();

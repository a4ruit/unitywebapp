// ─── STAR FX — juicy pixel-star collection animation ──────────────────────────
//
// StarFX.burst({ amount, from, onLand, onComplete })
//   amount     — how many stars were earned (drives star count, capped at 12)
//   from       — optional DOM element the stars fly FROM (defaults to screen centre)
//   onLand     — (landedCount, total) fired each time a star reaches the counter
//                (counter.js uses this to tick the number up as stars arrive)
//   onComplete — fired once the last star lands
//
// Flow:  a hero star pops in at the source ("star get") + a floating "+N"  →
//        the stars SWIRL/ORBIT around the source for a beat  →  then spiral
//        inward into #starsDisplay, each landing bumping the counter.
//
// Purely visual + a playSfx('star') hook — no game state lives here.

const StarFX = (() => {
  const TARGET_ID = 'starsDisplay';

  function rectCenter(el) {
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }
  function targetCenter() {
    const el = document.getElementById(TARGET_ID);
    if (el) {
      const r = el.getBoundingClientRect();
      // Only trust the rect if the counter is actually laid out. When #screen-pack
      // is hidden (display:none) the rect is all zeros — which would send stars to
      // the top-left corner. Fall back to the counter's fixed top-centre home.
      if (r.width > 0 || r.height > 0) {
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      }
    }
    return { x: window.innerWidth / 2, y: 64 };   // top-centre, where the counter lives
  }

  // ── A single orbiting → in-flying star ──────────────────────────────────────
  function flyStar(ox, oy, tx, ty, opts) {
    const size = opts.size || 18;
    const star = document.createElement('div');
    star.className = 'starfx-star';
    star.textContent = '★';
    star.style.fontSize = size + 'px';
    document.body.appendChild(star);

    const baseAng  = opts.baseAng;                 // starting angle on the orbit
    const radius0  = 34 + Math.random() * 30;      // orbit radius
    const spins    = 1.4 + Math.random() * 1.1;    // full turns before landing
    const orbitHold = 0.40;                        // fraction of time spent orbiting
    const dur      = opts.dur || (880 + Math.random() * 220);
    const start    = performance.now();

    function place(x, y) {
      star.style.left = (x - size / 2) + 'px';
      star.style.top  = (y - size / 2) + 'px';
    }

    function frame(now) {
      let t = (now - start) / dur;
      if (t > 1) t = 1;
      // e: stays 0 while orbiting, then smoothsteps source → target
      const e = t < orbitHold ? 0
              : (() => { const u = (t - orbitHold) / (1 - orbitHold); return u * u * (3 - 2 * u); })();
      const cx     = ox + (tx - ox) * e;
      const cy     = oy + (ty - oy) * e;
      const radius = radius0 * (1 - e);            // shrinks as it spirals in
      const ang    = baseAng + spins * Math.PI * 2 * t;
      place(cx + Math.cos(ang) * radius,
            cy + Math.sin(ang) * radius * 0.72);   // slight ellipse
      if (t < 1) {
        requestAnimationFrame(frame);
      } else {
        star.remove();
        land(tx, ty);
        if (opts.onLand) opts.onLand();
      }
    }
    requestAnimationFrame(frame);
  }

  // ── Landing burst on the counter ────────────────────────────────────────────
  function land(tx, ty) {
    const el = document.getElementById(TARGET_ID);
    if (el) {
      el.classList.remove('star-land-bump');
      void el.offsetWidth;                         // reflow → restart the bump
      el.classList.add('star-land-bump');
    }
    const ring = document.createElement('div');
    ring.className = 'starfx-ring';
    ring.style.left = tx + 'px';
    ring.style.top  = ty + 'px';
    document.body.appendChild(ring);
    setTimeout(() => ring.remove(), 430);

    if (typeof window.playSfx === 'function') window.playSfx('star');
  }

  // ── "Star get" hero pop + floating +N ───────────────────────────────────────
  function hero(ox, oy, amount) {
    const h = document.createElement('div');
    h.className = 'starfx-hero';
    h.textContent = '★';
    h.style.left = ox + 'px';
    h.style.top  = oy + 'px';
    document.body.appendChild(h);
    setTimeout(() => h.remove(), 600);

    const plus = document.createElement('div');
    plus.className = 'starfx-plus';
    plus.textContent = '+' + amount;
    plus.style.left = ox + 'px';
    plus.style.top  = oy + 'px';
    document.body.appendChild(plus);
    setTimeout(() => plus.remove(), 940);
  }

  // ── Public entry ────────────────────────────────────────────────────────────
  function burst(opts) {
    opts = opts || {};
    const amount = Math.max(1, Math.round(opts.amount || 1));
    const tgt = targetCenter();
    if (!tgt) { if (opts.onComplete) opts.onComplete(); return; }

    let ox, oy;
    if (opts.from && opts.from.getBoundingClientRect) {
      const c = rectCenter(opts.from); ox = c.x; oy = c.y;
    } else {
      ox = window.innerWidth / 2; oy = window.innerHeight * 0.40;
    }

    const n = Math.max(3, Math.min(12, amount));
    hero(ox, oy, amount);

    let landed = 0;
    const HERO_HOLD = 360;                          // let the hero star show first
    for (let i = 0; i < n; i++) {
      // Spread the stars evenly around the orbit so the swirl looks coordinated
      const baseAng = (i / n) * Math.PI * 2 + Math.random() * 0.4;
      setTimeout(() => {
        flyStar(ox, oy, tgt.x, tgt.y, {
          size: 14 + Math.round(Math.random() * 8),
          baseAng,
          onLand: () => {
            landed++;
            if (opts.onLand) opts.onLand(landed, n);
            if (landed === n && opts.onComplete) opts.onComplete();
          },
        });
      }, HERO_HOLD + i * 28);
    }
  }

  return { burst };
})();

window.StarFX = StarFX;

// warnfx.js — hazard plates that hang off a card's top-right corner.
//   LAZERPIG      → laser radiation
//   ULTRAVIOLET → high voltage
//   Puffball       → shield in a blue sign disc (defensive)
//   SOLARGRIP      → the same shield: it holds rather than hits
//   INFRAMEND / BLOOMSHROOM / BUGFIX → medic cross, same blue disc
//
// The blue disc is the NATURE side's badge for a card that is not trying to
// kill anything. Horror healers (the RITUAL pack mends the boss) deliberately
// do not wear it - the plate is a promise to the players reading the field,
// and it should never appear on something working against them.
//
// Same overlay trick as FlockFX: drawn on a full-viewport canvas anchored to the
// card's live screen rect, so it can sit OUTSIDE the card edges instead of being
// clipped inside the card texture.
//
//   WarnFX.start([{getRect, kind}, ...])   several plates at once
//   WarnFX.start(getRect, kind)             one, the original form
//       kind: 'laser' | 'voltage' | 'shield' | 'medic'
//       getRect() -> {left,top,width,height,locked} or null
//   WarnFX.stop()
//
// MULTIPLE plates, because one pack can hold more than one badged card. That
// was safe when only three cards had plates and they sat in different packs;
// with the shield and the cross added there are seven, and BUGFIX + LAZERPIG,
// BLOOMSHROOM + PUFFBALL and SOLARGRIP + ULTRAVIOLET can each share a pack. A
// single-plate overlay silently dropped whichever came second.

const WarnFX = (() => {

  let canvas = null, ctx = null, raf = null, t0 = 0;
  // One entry per plate on screen. Fade and last-known rect are PER ENTRY, so a
  // card leaving the grid fades its own badge out without touching the others.
  let entries = [];
  const plates = {};

  const ART = {};

  ART.laser = [
    'KKKKKKKKKKKKKKKKKKK',
    'KYYYYYYYYYYYYYYYYYK',
    'KYYYYYYYYYYYYYYYYYK',
    'KYYYYYYYYKYYYYYYYYK',
    'KYYYYYYYKYKYYYYYYYK',
    'KYYYYYYYKYKYYYYYYYK',
    'KYYYYYYYKYKYYYYYYYK',
    'KYYYYYYKYYYKYYYYYYK',
    'KYYYYYKYYKYYKYYYYYK',
    'KYYYYYKKYKYKKYYYYYK',
    'KYYYYYKYKKKYKYYYYYK',
    'KYYYYKKKKKKKKKYYYYK',
    'KYYYKYYYKKKYYYKYYYK',
    'KYYYKYYKYKYKYYKYYYK',
    'KYYYKYYYYKYYYYKYYYK',
    'KYYKKKKKKKKKKKKKYYK',
    'KYYYYYYYYYYYYYYYYYK',
    'KYYYYYYYYYYYYYYYYYK',
    'KKKKKKKKKKKKKKKKKKK',
  ];

  ART.voltage = [
    'KKKKKKKKKKKKKKKKKKKKKKKKKKKKKKK',
    'KYYYYYYYYYYYYYYYYYYYYYYYYYYYYYK',
    'KYYYYYYYYYYYYYYYYYYYYYYYYYYYYYK',
    'KYYYYYYYYYYYYYYYYYYYYYYYYYYYYYK',
    'KYYYYYYYYYYYYYKKKYYYYYYYYYYYYYK',
    'KYYYYYYYYYYYYYKKKYYYYYYYYYYYYYK',
    'KYYYYYYYYYYYYYKKKYYYYYYYYYYYYYK',
    'KYYYYYYYYYYYYYKKKYYYYYYYYYYYYYK',
    'KYYYYYYYYYYYYKKYKKYYYYYYYYYYYYK',
    'KYYYYYYYYYYYKKYYYKKYYYYYYYYYYYK',
    'KYYYYYYYYYYYKKYYYKKYYYYYYYYYYYK',
    'KYYYYYYYYYYYKKYYYKKYYYYYYYYYYYK',
    'KYYYYYYYYYYKKYYKKKKKYYYYYYYYYYK',
    'KYYYYYYYYYKKYYKKKKYKKYYYYYYYYYK',
    'KYYYYYYYYYKKYKKKKYYKKYYYYYYYYYK',
    'KYYYYYYYYYKKKKKKYYYKKYYYYYYYYYK',
    'KYYYYYYYYKKKKKKKKKKYKKYYYYYYYYK',
    'KYYYYYYYKKYKKKKKKKKYYKKYYYYYYYK',
    'KYYYYYYYKKYYYYKKKKYYYKKYYYYYYYK',
    'KYYYYYYYKKYYYKKKKYYYYKKYYYYYYYK',
    'KYYYYYYKKYYYKKKKYYYYYYKKYYYYYYK',
    'KYYYYYKKYYYKKKYYYYYYYYYKKYYYYYK',
    'KYYYYYKKYYKKYYYYYYYYYYYKKYYYYYK',
    'KYYYYYKKYKYYYYYYYYYYYYYKKYYYYYK',
    'KYYYYKKYYYYYYYYYYYYYYYYYKKYYYYK',
    'KYYYKKKKKKKKKKKKKKKKKKKKKKKYYYK',
    'KYYYKKKKKKKKKKKKKKKKKKKKKKKYYYK',
    'KYYYYYYYYYYYYYYYYYYYYYYYYYYYYYK',
    'KYYYYYYYYYYYYYYYYYYYYYYYYYYYYYK',
    'KYYYYYYYYYYYYYYYYYYYYYYYYYYYYYK',
    'KKKKKKKKKKKKKKKKKKKKKKKKKKKKKKK',
  ];

  // 19x19, the same grid ART.laser uses. It was 31x31 before, which made it the
  // only plate drawn at a different pixel density - beside the laser sign it
  // read as a smooth logo next to pixel art rather than as a sibling.
  ART.shield = [
    '.......KKKKK.......',
    '.....KWWWWWWWK.....',
    '...KKWWBBBBBWWKK...',
    '..KWWBBBBBBBBBWWK..',
    '..KWBBBBBBBBBBBWK..',
    '.KWBBBBWWWWWBBBBWK.',
    '.WWBBBWWWWWWWBBBWW.',
    'KWBBBBWWWWWWWBBBBWK',
    'KWBBBBWWWWWWWBBBBWK',
    'KWBBBBWWWWWWWBBBBWK',
    'KWBBBBBWWWWWBBBBBWK',
    'KWBBBBBWWWWWBBBBBWK',
    '.WWBBBBBWWWBBBBBWW.',
    '.KWBBBBBBWBBBBBBWK.',
    '..KWBBBBBBBBBBBWK..',
    '..KWWBBBBBBBBBWWK..',
    '...KKWWBBBBBWWKK...',
    '.....KWWWWWWWK.....',
    '.......KKKKK.......',
  ];

  // Same disc as ART.shield down to the pixel, so the two read as one family
  // seen twice rather than as two separate badges. Only the glyph differs.
  ART.medic = [
    '.......KKKKK.......',
    '.....KWWWWWWWK.....',
    '...KKWWBBBBBWWKK...',
    '..KWWBBBBBBBBBWWK..',
    '..KWBBBBBBBBBBBWK..',
    '.KWBBBBBWWWBBBBBWK.',
    '.WWBBBBBWWWBBBBBWW.',
    'KWBBBBBBWWWBBBBBBWK',
    'KWBBBWWWWWWWWWBBBWK',
    'KWBBBWWWWWWWWWBBBWK',
    'KWBBBWWWWWWWWWBBBWK',
    'KWBBBBBBWWWBBBBBBWK',
    '.WWBBBBBWWWBBBBBWW.',
    '.KWBBBBBWWWBBBBBWK.',
    '..KWBBBBBBBBBBBWK..',
    '..KWWBBBBBBBBBWWK..',
    '...KKWWBBBBBWWKK...',
    '.....KWWWWWWWK.....',
    '.......KKKKK.......',
  ];

  const PAL = { K: '#120c04', Y: '#f2c21a', B: '#1f5fa6', W: '#f4f6fa' };

  // Hand-drawn plates override the procedural art once they have loaded.
  const IMG = {};
  [['voltage', 'assets/elec-symbol.png']].forEach(([k, src]) => {
    const im = new Image();
    im.onload = () => { IMG[k] = im; };
    im.src = src;
  });

  function _plate(kind) {
    if (IMG[kind]) return IMG[kind];
    if (plates[kind]) return plates[kind];
    const art = ART[kind] || ART.laser;
    const c = document.createElement('canvas');
    c.width = art[0].length; c.height = art.length;
    const g = c.getContext('2d');
    for (let y = 0; y < art.length; y++) {
      for (let x = 0; x < art[y].length; x++) {
        const col = PAL[art[y][x]];
        if (!col) continue;
        g.fillStyle = col;
        g.fillRect(x, y, 1, 1);
      }
    }
    plates[kind] = c;
    return c;
  }

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

    const t = performance.now() / 1000 - t0;

    // The locked treatment used to be a CSS filter on the whole canvas, which
    // only worked while there was exactly one plate. Greying is per-plate now,
    // applied as alpha, so a locked card next to an affordable one dims alone.
    canvas.style.filter  = 'none';
    canvas.style.opacity = '1';

    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];

      const rect = e.getRect ? e.getRect() : null;
      if (rect) e.lastRect = rect;
      e.fade += ((rect ? 1 : 0) - e.fade) * 0.12;
      if (e.fade < 0.02 || !e.lastRect) continue;

      const r      = e.lastRect;
      const locked = !!r.locked;
      const size   = r.width * 0.22;

      // Pinned at the top-right corner with only a small overhang past the
      // frame. The bob is phase-shifted per plate so two badges on screen do
      // not rise and fall in lockstep.
      const cx = r.left + r.width  * 0.82;
      const cy = r.top  + r.height * 0.045
               + Math.sin(t * 1.1 + i * 1.7) * size * 0.04;

      ctx.save();
      ctx.globalAlpha = e.fade * (locked ? 0.4 : 1);
      ctx.imageSmoothingEnabled = false;
      ctx.translate(cx, cy);
      ctx.shadowColor   = 'rgba(0,0,0,0.45)';
      ctx.shadowBlur    = 4;
      ctx.shadowOffsetY = 3;
      ctx.drawImage(_plate(e.kind), -size / 2, -size / 2, size, size);
      ctx.restore();
    }
  }

  /// Accepts a list of {getRect, kind}, or the original single (fn, kind) pair.
  function start(list, plateKind) {
    _ensure();

    const raw = Array.isArray(list) ? list
              : [{ getRect: list, kind: plateKind }];

    entries = raw
      .filter(e => e && typeof e.getRect === 'function')
      .map(e => ({
        getRect:  e.getRect,
        kind:     ART[e.kind] ? e.kind : 'laser',
        fade:     0,
        lastRect: null,
      }));

    t0 = performance.now() / 1000;
    if (!raf) _loop();
  }

  function stop() {
    entries = [];
    if (raf) { cancelAnimationFrame(raf); raf = null; }
    if (canvas) { ctx.clearRect(0, 0, canvas.width, canvas.height); canvas.style.display = 'none'; }
  }

  return { start, stop };
})();

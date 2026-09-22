// warnfx.js — hazard plates that hang off a card's top-right corner.
//   LAZERPIG      → laser radiation
//   ULTRAVIOLET → high voltage
//   Puffball       → shield in a blue sign disc (defensive)
//
// Same overlay trick as FlockFX: drawn on a full-viewport canvas anchored to the
// card's live screen rect, so it can sit OUTSIDE the card edges instead of being
// clipped inside the card texture.
//
//   WarnFX.start(getRect, kind)   kind: 'laser' | 'voltage' | 'shield'
//                                 getRect() -> {left,top,width,height,locked} or null
//   WarnFX.stop()

const WarnFX = (() => {

  let canvas = null, ctx = null, raf = null;
  let getRect = null, t0 = 0, fade = 0, lastRect = null, kind = 'laser';
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

  ART.shield = [
    '...............................',
    '...........WWWWWWWWW...........',
    '........WWWWBBBBBBBWWWW........',
    '.......WWBBBBBBBBBBBBBWW.......',
    '......WWBBBBBBBBBBBBBBBWW......',
    '.....WBBBBBBBBBBBBBBBBBBBW.....',
    '....WBBWWBBBBBBBBBBBBBWWBBW....',
    '...WWBBWWWWWWWWWWWWWWWWWBBWW...',
    '..WWBBBWWWWWWWWWWWWWWWWWBBBWW..',
    '..WBBBBWWWBBBBBBBBBBBWWWBBBBW..',
    '..WBBBBWWWBWWWWWWWWWBWWWBBBBW..',
    '.WWBBBBWWWBWWWWWWWWWBWWWBBBBWW.',
    '.WBBBBBWWWBWWWWWWWWWBWWWBBBBBW.',
    '.WBBBBBWWWBWWWWWWWWWBWWWBBBBBW.',
    '.WBBBBBWWWBWWWWWWWWWBWWWBBBBBW.',
    '.WBBBBBWWWBWWWWWWWWWBWWWBBBBBW.',
    '.WBBBBBBWWBWWWWWWWWWBWWBBBBBBW.',
    '.WBBBBBBWWWBWWWWWWWBWWWBBBBBBW.',
    '.WBBBBBBBWWBWWWWWWWBWWBBBBBBBW.',
    '.WWBBBBBBWWWBWWWWWBWWWBBBBBBWW.',
    '..WBBBBBBBWWWBWWWBWWWBBBBBBBW..',
    '..WBBBBBBBBWWWBWBWWWBBBBBBBBW..',
    '..WWBBBBBBBWWWWBWWWWBBBBBBBWW..',
    '...WWBBBBBBBWWWWWWWBBBBBBBWW...',
    '....WBBBBBBBBBWWWBBBBBBBBBW....',
    '.....WBBBBBBBBBWBBBBBBBBBW.....',
    '......WWBBBBBBBBBBBBBBBWW......',
    '.......WWBBBBBBBBBBBBBWW.......',
    '........WWWWBBBBBBBWWWW........',
    '...........WWWWWWWWW...........',
    '...............................',
  ];

  const PAL = { K: '#120c04', Y: '#f2c21a', B: '#1f5fa6', W: '#f4f6fa' };

  // Hand-drawn plates override the procedural art once they have loaded.
  const IMG = {};
  [['voltage', 'assets/elec-symbol.png']].forEach(([k, src]) => {
    const im = new Image();
    im.onload = () => { IMG[k] = im; };
    im.src = src;
  });

  function _plate() {
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

    const rect = getRect ? getRect() : null;
    if (rect) lastRect = rect;
    fade += ((rect ? 1 : 0) - fade) * 0.12;
    if (fade < 0.02 || !lastRect) return;

    const r      = lastRect;
    const t      = performance.now() / 1000 - t0;
    const locked = !!r.locked;
    const size   = r.width * 0.22;

    // Pinned at the top-right corner with only a small overhang past the frame.
    const cx = r.left + r.width  * 0.82;
    const cy = r.top  + r.height * 0.045 + Math.sin(t * 1.1) * size * 0.04;

    const wantFilter  = locked ? 'grayscale(1) brightness(0.55)' : 'none';
    const wantOpacity = locked ? '0.55' : '1';
    if (canvas.style.filter  !== wantFilter)  canvas.style.filter  = wantFilter;
    if (canvas.style.opacity !== wantOpacity) canvas.style.opacity = wantOpacity;

    ctx.save();
    ctx.globalAlpha = fade;
    ctx.imageSmoothingEnabled = false;
    ctx.translate(cx, cy);
    ctx.shadowColor   = 'rgba(0,0,0,0.45)';
    ctx.shadowBlur    = 4;
    ctx.shadowOffsetY = 3;
    ctx.drawImage(_plate(), -size / 2, -size / 2, size, size);
    ctx.restore();
  }

  function start(getRectFn, plateKind) {
    _ensure();
    kind     = ART[plateKind] ? plateKind : 'laser';
    getRect  = getRectFn;
    lastRect = null;
    t0       = performance.now() / 1000;
    if (!raf) _loop();
  }

  function stop() {
    getRect = null;
    lastRect = null;
    fade = 0;
    if (raf) { cancelAnimationFrame(raf); raf = null; }
    if (canvas) { ctx.clearRect(0, 0, canvas.width, canvas.height); canvas.style.display = 'none'; }
  }

  return { start, stop };
})();

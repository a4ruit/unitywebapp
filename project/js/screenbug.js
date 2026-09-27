// screenbug.js — a glitchling that crawls out of the projection and onto YOUR phone.
//
// The one mechanic in the build that uses the boundary between the two screens
// as a thing that can be crossed. Everything else treats the phone as a private
// control surface and the projection as the shared world; this puts a creature
// from the world onto the control surface, which is the whole game's subject
// stated in one interaction — the thing on the big screen gets into your pocket.
//
// Deliberately requires no explanation. A bug is crawling on your screen; you
// hit it. A seven-year-old solves this without being told, which is more than
// can be said for anything else the phone asks of a player.
//
// Messages:
//   screen_bug|clientId|hp|seconds   (Unity -> web)  one has landed on you
//   screen_bug_killed|clientId       (web -> Unity)  you got it
//   screen_bug_escaped|clientId      (web -> Unity)  you ran out of time
//
// It blocks ONLY WHERE IT IS. The root is one 78px square that takes taps; the
// rest of the screen stays live. A full-screen lock reads as more threatening
// and is the wrong call for a public showing - a hard interrupt landing during a
// fifteen second possession eats somebody's entire turn, and what they learn is
// that the game took it from them. A bug sitting on top of the joystick is
// obstructive in a way that is funny and that swatting it fixes.
//
// Exposes: ScreenBug.handleMessage(msg)
const ScreenBug = (() => {

  const SIZE = 96;          // px on screen
  // The creature is drawn at TWENTY-TWO pixels and blown up about four times.
  //
  // It was 40, which is only a 2x upscale, and the result looked HD next to the
  // projection - a smooth little sphere beside a world that is aggressively
  // low-res. The projection's whole look comes from rendering coarse and
  // scaling up, so this has to be drawn coarse too. Every position and size
  // below is snapped to whole pixels at this resolution: a half-pixel anywhere
  // gets interpolated on the upscale and puts a soft edge back in.
  // Twenty-six rather than twenty-two: the ring is a thick BAND now and the
  // smear needs somewhere to go, so the ball is drawn smaller inside a slightly
  // larger frame. Still about a 3.7x upscale, so the pixels stay square.
  const RES  = 26;

  // Drawn, not an asset — because the thing it has to match is not a picture.
  //
  // In Unity a glitchling is a dark sphere with red emission and one hot eye
  // (Fleshling.BuildVisual), and the reason it reads as CORRUPTED is that
  // GlitchManager tracks it and ScreenGlitch.shader tears it up. The card
  // symbol is a still illustration of that idea; the creature itself is the
  // idea in motion. Copying the PNG gave a flat sticker where the room expects
  // something that will not hold still.
  //
  // So this reproduces the shader instead of the sprite. Same three moves as
  // ScreenGlitch.frag: horizontal bands sliding sideways, chromatic separation,
  // and dropped blocks going hard magenta or black.
  // MONOCHROME, to match what the projection actually shows. The red version
  // this replaced was built from Fleshling's material values - bodyColor and a
  // hot emissionColor - which is what the creature is made of but not what the
  // room sees: by the time it reaches the screen the glitch pass has chewed it
  // down to black and white, and that is the thing players recognise.
  //
  // Monochrome also survives the phone better. The web app is green and blue,
  // and a black-and-white object with a hard white rim separates from any of it
  // far more reliably than a red one, which sat somewhere between the FIREBLOOM
  // orange and the arcade-mode background.
  const BODY_DARK = '#050506';
  const BODY_MID  = '#1e1e21';
  // Kept for the ghost plates' tone only — the rim itself is now live static,
  // built per frame from three greys in _ring().
  const EYE       = '#ffffff';
  const DROP_LIT  = '#ffffff';   // dropped blocks go white or black, nothing else

  // The shed layer: a full-viewport canvas the creature leaves white pixels on.
  // Separate from the creature's own canvas because the effect is in SCREEN
  // space — in Unity the glitch pass writes white over whatever is behind the
  // ball, grass and rocks included, so the trail belongs to the world rather
  // than to the creature. A trail drawn inside the creature's own 96px box can
  // only ever be as long as the box.
  let _fx = null, _fxCtx = null, _fxW = 0, _fxH = 0;

  // One shed pixel is exactly one creature pixel, because the shed canvas is
  // scaled by the same factor the creature is upscaled by. That is what keeps
  // the two looking like the same effect rather than two resolutions of it.
  const PIX = () => SIZE / RES;

  let _root = null, _canvas = null, _ctx = null;
  let _plate = null, _plateR = null, _plateB = null;   // clean, red, blue
  let _hp = 0, _maxHp = 0, _flash = 0;
  let _x = 0, _y = 0, _vx = 0, _vy = 0, _raf = null, _deadline = 0, _alive = false;

  function handleMessage(msg) {
    if (typeof msg !== 'string') return false;

    if (msg.startsWith('screen_bug|')) {
      const p = msg.split('|');
      if (p[1] !== CLIENT_ID) return true;
      _land(Number(p[2]) || 3, Number(p[3]) || 20);
      return true;
    }
    return false;
  }

  // ── Arrival ────────────────────────────────────────────────────────────────

  function _land(hp, seconds) {
    if (_alive) return;           // one at a time; a swarm of these is a denial of service
    _alive    = true;
    _hp       = hp;
    _maxHp    = hp;
    _deadline = performance.now() + seconds * 1000;

    _build();

    // Enters from an edge rather than fading in at the middle. It has to read as
    // something that CAME from somewhere, not as a UI element that appeared.
    const w = window.innerWidth, h = window.innerHeight;
    const edge = Math.floor(Math.random() * 4);
    if (edge === 0) { _x = Math.random() * w; _y = -SIZE; }
    else if (edge === 1) { _x = w + SIZE; _y = Math.random() * h; }
    else if (edge === 2) { _x = Math.random() * w; _y = h + SIZE; }
    else { _x = -SIZE; _y = Math.random() * h; }

    _vx = (Math.random() - 0.5) * 2.4;
    _vy = (Math.random() - 0.5) * 2.4;

    try { if (typeof Sound !== 'undefined') Sound.play('deny'); } catch (e) {}
    if (navigator.vibrate) { try { navigator.vibrate([18, 40, 18]); } catch (e) {} }

    _raf = requestAnimationFrame(_tick);
  }

  function _build() {
    _root = document.createElement('div');
    _root.id = 'screen-bug';
    _root.style.cssText =
      'position:fixed;left:0;top:0;width:' + SIZE + 'px;height:' + SIZE + 'px;' +
      'z-index:99999;pointer-events:auto;cursor:pointer;touch-action:none;' +
      'image-rendering:pixelated;will-change:transform;';

    _canvas = document.createElement('canvas');
    _canvas.width = RES; _canvas.height = RES;
    _canvas.style.cssText = 'width:100%;height:100%;image-rendering:pixelated;' +
                            'pointer-events:none;' +   // taps belong to the root
                            'filter:drop-shadow(0 3px 8px rgba(0,0,0,0.7));';
    _ctx = _canvas.getContext('2d');
    _ctx.imageSmoothingEnabled = false;   // nearest-neighbour on every blit
    _root.appendChild(_canvas);

    _buildPlates();
    _buildFx();

    // Both, because a tap on a phone fires touchstart and a click, and a mouse
    // in the browser preview fires only the latter. Without pointerdown the
    // thing felt laggy — a click resolves on RELEASE, and a bug you are
    // frantically hitting has to answer on contact.
    _root.addEventListener('pointerdown', _hit, { passive: false });

    document.body.appendChild(_root);
  }

  // ── The creature, drawn three times ────────────────────────────────────────
  // Once properly, and twice as a dim grey GHOST offset either side. In colour
  // this was a chromatic split with red and blue channels; in monochrome the
  // same offsets read as an echo - the image failing to agree with itself about
  // where it is - which is the black-and-white version of the same idea and the
  // reason it still says "glitch" with the colour taken away.
  // All three are static, so this runs once per landing rather than per frame.

  function _plateOf(colour) {
    const c = document.createElement('canvas');
    c.width = RES; c.height = RES;
    _drawBall(c.getContext('2d'), colour);
    return c;
  }

  function _buildPlates() {
    _plate  = _plateOf(null);
    _plateR = _plateOf('#3a3a3e');
    _plateB = _plateOf('#2a2a2e');
  }

  /// A black sphere with a white-hot edge and one eye — Fleshling.BuildVisual
  /// as the glitch pass leaves it. `mono` renders the same silhouette in a
  /// single flat tone for the ghost plates.
  function _drawBall(g, mono) {
    const c = RES / 2, r = BALL_R;
    g.clearRect(0, 0, RES, RES);
    g.imageSmoothingEnabled = false;

    if (mono) {
      g.fillStyle = mono;
      g.beginPath(); g.arc(c, c, r, 0, Math.PI * 2); g.fill();
      return;
    }

    // Lit from the top-left, so a flat circle still reads as a ball. The core is
    // nearly black and the rim is the blown-out edge - the same relationship the
    // material has, where a dark diffuse lets the emission punch through, with
    // the emission reading white once the glitch has finished with it.
    const grad = g.createRadialGradient(c - r * 0.3, c - r * 0.35, r * 0.1, c, c, r);
    grad.addColorStop(0,    BODY_MID);
    grad.addColorStop(0.55, BODY_DARK);
    grad.addColorStop(1,    BODY_DARK);
    g.fillStyle = grad;
    g.beginPath(); g.arc(c, c, r, 0, Math.PI * 2); g.fill();

    // NO RIM HERE any more. It used to be a clean one-pixel stroke baked into
    // this static plate, which is exactly why it read wrong: on the projection
    // the white edge is a thick band of STATIC that reseethes every frame and
    // smears behind the creature as it travels. A stroke cannot do either of
    // those, so the ring moved into _ring() and is drawn live. See there.

    // The eye. A BLOCK, not a circle - it is a cube in Unity, and the hard
    // edge is most of what makes the thing look like it is looking at you.
    // Two pixels, with a one-pixel black surround so a white dropout block
    // landing beside it cannot swallow it. Four and twelve pixels on screen.
    const ex = Math.round(c + r * 0.22), ey = Math.round(c - r * 0.32);
    g.fillStyle = '#000000';
    g.fillRect(ex - 1, ey - 1, 4, 4);
    g.fillStyle = EYE;
    g.fillRect(ex, ey, 2, 2);
  }

  // The ball sits well inside the frame. The margin is not spare space - it is
  // where the tendrils go, and the ring was sized to fill the canvas before,
  // which is part of why it could only ever be a tidy circle.
  const BALL_R    = RES * 0.27;
  const RING_OUT  = RES * 0.31;   // where the SOLID part of the band ends
  const RING_IN   = RES * 0.22;   // inner edge
  const REACH     = RES * 0.17;   // furthest a tendril may leak past RING_OUT


  // Angular buckets for the leak. Twenty-four is enough that a tendril is a
  // few pixels wide rather than one, and few enough that the shape reads as
  // having DIRECTIONS rather than being a fuzzy halo.
  const SPOKES = 24;
  const _spur  = new Float32Array(SPOKES);

  /// <summary>
  /// Re-roll how far the static leaks in each direction.
  ///
  /// Cubed random, which is the whole trick: it biases hard toward zero, so
  /// most directions barely leak at all and a few reach a long way out. A flat
  /// random gave an even fringe all the way round - which is just a thicker
  /// uniform ring, the exact thing this is fixing.
  ///
  /// Rolled ONCE per frame and shared by the main ring and its ghosts, so the
  /// smear trails the same silhouette rather than three unrelated shapes.
  /// </summary>
  function _rollSpurs(a) {
    for (let i = 0; i < SPOKES; i++) {
      const r = Math.random();
      _spur[i] = r * r * r * REACH * (0.45 + a * 0.75);
    }
    // One pass of smoothing with the neighbours. Without it each bucket is
    // independent and the edge turns to noise; with it, adjacent buckets agree
    // enough that a long one drags its neighbours out into a taper - which is
    // what makes a spur look like a tendril instead of a spike.
    for (let i = 0; i < SPOKES; i++) {
      const l = _spur[(i + SPOKES - 1) % SPOKES], rr = _spur[(i + 1) % SPOKES];
      _spur[i] = _spur[i] * 0.6 + (l + rr) * 0.2;
    }
  }

  /// <summary>
  /// The white edge: a band of static that LEAKS outward, not a stroke.
  ///
  /// Inside the solid band, each pixel has a chance of being skipped and is
  /// otherwise one of three greys — the holes are what make it read as washed
  /// rather than drawn. Past the band it keeps going as far as that direction's
  /// spur allows, but the chance of a pixel surviving falls off toward the tip,
  /// so a tendril thins out and frays instead of ending on a hard edge.
  ///
  /// Cheap despite being per-pixel: the frame is 26x26, and the early radius
  /// test rejects most of it before any angle maths happens.
  /// </summary>
  function _ring(g, cx, cy, alpha) {
    g.globalAlpha = alpha;
    const i2   = RING_IN * RING_IN;
    const max  = RING_OUT + REACH;
    const max2 = max * max;

    for (let y = 0; y < RES; y++) {
      const dy = y + 0.5 - cy, dy2 = dy * dy;
      for (let x = 0; x < RES; x++) {
        const dx = x + 0.5 - cx;
        const d2 = dx * dx + dy2;
        if (d2 < i2 || d2 > max2) continue;      // cheap reject, no atan2 yet

        const d = Math.sqrt(d2);

        // Past the solid band, survival falls off toward the tip of whatever
        // spur reaches this way. Inside it, everything is fair game.
        let p = 1;
        if (d > RING_OUT) {
          const ang  = Math.atan2(dy, dx);
          const sp   = _spur[((ang / (Math.PI * 2) + 1) * SPOKES | 0) % SPOKES];
          if (sp <= 0.01) continue;
          const out  = (d - RING_OUT) / sp;
          if (out > 1) continue;
          p = 1 - out;                           // frays as it goes
          p *= p;
        }

        const n = Math.random();
        if (n > p) continue;                     // the leak, thinning outward
        if (n < 0.26 * p) continue;              // the holes ARE the static

        g.fillStyle = n > 0.80 ? '#ffffff'
                    : n > 0.52 ? '#c8c8ce'
                               : '#7e7e88';
        g.fillRect(x, y, 1, 1);
      }
    }
    g.globalAlpha = 1;
  }

  /// ScreenGlitch.shader, on one creature. Bands slide, channels separate,
  /// blocks drop out. Re-rolled every frame, which is what makes it seethe
  /// rather than sit there wearing a texture.
  function _buildFx() {
    _fx = document.createElement('canvas');
    _fx.id = 'screen-bug-fx';
    _sizeFx();
    // Under the creature, over everything else. The shed pixels are painted ON
    // the interface the way the shader paints them on the grass.
    _fx.style.cssText =
      'position:fixed;left:0;top:0;width:100vw;height:100vh;' +
      'pointer-events:none;z-index:99998;image-rendering:pixelated;';
    _fxCtx = _fx.getContext('2d');
    _fxCtx.imageSmoothingEnabled = false;
    document.body.appendChild(_fx);
    window.addEventListener('resize', _sizeFx);
  }

  function _sizeFx() {
    if (!_fx) return;
    const p = PIX();
    _fxW = Math.ceil(window.innerWidth  / p);
    _fxH = Math.ceil(window.innerHeight / p);
    _fx.width = _fxW; _fx.height = _fxH;
    if (_fxCtx) _fxCtx.imageSmoothingEnabled = false;
  }

  /// <summary>
  /// Scatter white pixels around the creature onto the world, and fade what is
  /// already there.
  ///
  /// The fade is a destination-out wipe over the whole layer, which is the
  /// cheap way to decay a trail — every pixel loses a little alpha each frame
  /// regardless of when it was laid down, so old ones vanish and fresh ones
  /// stay bright without tracking any of them individually.
  ///
  /// Shed positions come from the SAME spur array the ring is drawn from, so
  /// the pixels leak in the directions the tendrils happen to be reaching this
  /// frame — the trail is made of the border coming apart, not of a separate
  /// particle effect that happens to be nearby.
  /// </summary>
  function _shed(a) {
    if (!_fxCtx) return;

    // Decay first, so this frame's pixels land at full strength.
    _fxCtx.globalCompositeOperation = 'destination-out';
    _fxCtx.fillStyle = 'rgba(0,0,0,0.16)';
    _fxCtx.fillRect(0, 0, _fxW, _fxH);
    _fxCtx.globalCompositeOperation = 'source-over';

    const p  = PIX();
    const cx = (_x + SIZE / 2) / p;
    const cy = (_y + SIZE / 2) / p;

    const n = 5 + Math.floor(a * 9);
    for (let i = 0; i < n; i++) {
      const k    = Math.floor(Math.random() * SPOKES);
      const ang  = (k / SPOKES) * Math.PI * 2;
      // Out to wherever this direction is reaching, so a long tendril sheds
      // further out than a short one.
      const r    = RING_IN + Math.random() * (RING_OUT - RING_IN + _spur[k]);
      const x    = Math.round(cx + Math.cos(ang) * r);
      const y    = Math.round(cy + Math.sin(ang) * r);
      if (x < 0 || y < 0 || x >= _fxW || y >= _fxH) continue;

      const t = Math.random();
      _fxCtx.fillStyle = t > 0.72 ? '#ffffff'
                       : t > 0.40 ? '#c8c8ce'
                                  : '#7e7e88';
      _fxCtx.fillRect(x, y, 1, 1);
    }
  }

  function _paint(flash) {
    if (!_ctx) return;
    const g = _ctx;
    g.clearRect(0, 0, RES, RES);

    if (flash < 1) {
      // Hit: the whole thing blows out to white for a frame or two.
      g.globalCompositeOperation = 'source-over';
      g.drawImage(_plate, 0, 0);
      g.globalCompositeOperation = 'source-atop';
      g.fillStyle = '#ffffff';
      g.fillRect(0, 0, RES, RES);
      g.globalCompositeOperation = 'source-over';
      return;
    }

    // Wounded things glitch harder. At full health it is an unsettling shimmer;
    // on its last hit it is barely holding together, which tells the player how
    // far in they are without a health bar.
    const a = 0.35 + (1 - _hp / Math.max(1, _maxHp)) * 0.65;

    // One roll, shared by the ring and every ghost behind it.
    _rollSpurs(a);

    // The smear used to be three ghost rings drawn in here, behind the body.
    // It has moved to _shed() and the world layer: a trail confined to the
    // creature's own box was always going to look like part of the creature,
    // where the thing it is imitating is paint left ON the scenery. What is
    // left in here is just the creature.
    const c0 = RES / 2;

    // Bands of WHOLE pixels. Fourteen bands over 22px gave 1.57px each, which
    // the upscale blurred into a smear rather than showing as slipped rows.
    // Seven bands of three-ish pixels each read as distinct broken rows.
    const BANDS = 7;
    const sep   = Math.max(1, Math.round(a * 2));
    g.imageSmoothingEnabled = false;

    for (let i = 0; i < BANDS; i++) {
      const y0 = Math.floor(i * RES / BANDS);
      const y1 = Math.floor((i + 1) * RES / BANDS);
      const bh = y1 - y0;
      if (bh <= 0) continue;

      // Only some bands move, chosen fresh each frame - a band that always
      // slides reads as an animation, one that sometimes does reads as a fault.
      // Rounded, because a fractional offset is the one thing that would put
      // soft edges back after all of the above.
      const dx = Math.random() < a * 0.55
               ? Math.round((Math.random() - 0.5) * RES * 0.38 * a)
               : 0;

      g.globalCompositeOperation = 'lighter';
      g.drawImage(_plateR, 0, y0, RES, bh, dx + sep, y0, RES, bh);
      g.drawImage(_plateB, 0, y0, RES, bh, dx - sep, y0, RES, bh);
      g.globalCompositeOperation = 'source-over';
      g.globalAlpha = 0.92;
      g.drawImage(_plate,  0, y0, RES, bh, dx, y0, RES, bh);
      g.globalAlpha = 1;
    }

    // The live ring, over the body. Drawn after the bands rather than inside
    // them: on the projection the edge survives the tearing that chews up the
    // creature, which is what makes it the one part always readable.
    _ring(g, c0, c0, 1);

    // Dropped blocks, clipped to the creature with source-atop so the corruption
    // is ON it rather than floating in the space around it.
    g.globalCompositeOperation = 'source-atop';
    // More of them than the colour version carried, and harder. Magenta did a
    // lot of the work before; with only two tones left, the corruption has to
    // read through COVERAGE and contrast instead.
    // Whole pixels again, and sized for a 22px grid rather than a 40px one -
    // the old 3-11px blocks would now cover half the creature each.
    const drops = Math.floor(3 + a * 7);
    for (let i = 0; i < drops; i++) {
      const bw  = 1 + Math.floor(Math.random() * 5);
      const bhh = 1 + Math.floor(Math.random() * 3);
      g.fillStyle = Math.random() < 0.45 ? DROP_LIT : '#000000';
      g.fillRect(Math.floor(Math.random() * RES),
                 Math.floor(Math.random() * RES), bw, bhh);
    }
    g.globalCompositeOperation = 'source-over';
  }

  // ── Being hit ──────────────────────────────────────────────────────────────

  function _hit(e) {
    e.preventDefault();
    e.stopPropagation();
    if (!_alive) return;

    _hp--;
    try { if (typeof Sound !== 'undefined') Sound.play('place'); } catch (e2) {}
    if (navigator.vibrate) { try { navigator.vibrate(25); } catch (e2) {} }

    if (_hp <= 0) { _die(true); return; }

    // Flinches white and BOLTS. Each hit making it harder to land the next is
    // what turns three taps into a chase instead of three taps.
    _flash = 4;   // frames; the tick loop clears it

    const a = Math.random() * Math.PI * 2;
    const speed = 5 + (_maxHp - _hp) * 2.5;
    _vx = Math.cos(a) * speed;
    _vy = Math.sin(a) * speed;

    _root.animate(
      [{ transform: _xf(1.35) }, { transform: _xf(1) }],
      { duration: 140, easing: 'ease-out' }
    );
  }

  function _xf(scale) {
    return `translate(${_x}px, ${_y}px) scale(${scale})`;
  }

  // ── Crawl ──────────────────────────────────────────────────────────────────

  function _tick() {
    if (!_alive) return;
    _raf = requestAnimationFrame(_tick);

    const w = window.innerWidth, h = window.innerHeight;

    // Wanders, and bounces off the edges rather than leaving. It is not trying
    // to escape — it is trying to be in the way.
    _vx += (Math.random() - 0.5) * 0.7;
    _vy += (Math.random() - 0.5) * 0.7;
    const sp = Math.hypot(_vx, _vy);
    const max = 3.2 + (_maxHp - _hp) * 1.6;
    if (sp > max) { _vx = _vx / sp * max; _vy = _vy / sp * max; }

    _x += _vx; _y += _vy;
    if (_x < 0) { _x = 0; _vx = Math.abs(_vx); }
    if (_y < 0) { _y = 0; _vy = Math.abs(_vy); }
    if (_x > w - SIZE) { _x = w - SIZE; _vx = -Math.abs(_vx); }
    if (_y > h - SIZE) { _y = h - SIZE; _vy = -Math.abs(_vy); }

    // No rotation: a sphere has no facing, and spinning it made the eye
    // wander around the outside like a decal. It seethes in place instead.
    _root.style.transform = `translate(${_x}px, ${_y}px)`;

    // Re-rolled every frame. This is the difference between a creature that is
    // glitching and a picture of a glitch.
    if (_flash > 0) _flash -= 1;
    _paint(_flash > 0 ? 0 : 1);
    _shed(0.35 + (1 - _hp / Math.max(1, _maxHp)) * 0.65);

    if (performance.now() > _deadline) _die(false);
  }

  // ── Leaving ────────────────────────────────────────────────────────────────

  function _die(killed) {
    if (!_alive) return;
    _alive = false;
    cancelAnimationFrame(_raf);

    send(`${killed ? 'screen_bug_killed' : 'screen_bug_escaped'}|${CLIENT_ID}`);

    if (_root) {
      _root.style.pointerEvents = 'none';
      _root.animate(
        killed
          ? [{ transform: _xf(1.5), opacity: 1 }, { transform: _xf(0), opacity: 0 }]
          : [{ opacity: 1 }, { opacity: 0 }],
        { duration: killed ? 180 : 500, easing: 'ease-in' }
      ).onfinish = _clear;
      setTimeout(_clear, 600);   // animate() can be dropped in a background tab
    }
  }

  function _clear() {
    if (_root && _root.parentNode) _root.parentNode.removeChild(_root);
    _root = null; _canvas = null; _ctx = null;
    _plate = _plateR = _plateB = null;

    window.removeEventListener('resize', _sizeFx);
    if (_fx && _fx.parentNode) _fx.parentNode.removeChild(_fx);
    _fx = null; _fxCtx = null;
  }

  return { handleMessage, get alive() { return _alive; } };
})();

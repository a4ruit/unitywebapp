// combo.js — cross-player card synergies (discovery UI)
//
// One player PRIMES a combo by placing a card; a DIFFERENT player completes it
// with the matching card before the window closes.
//
// This file is purely the DISCOVERY surface. Unity owns the rules and timing and
// broadcasts state; the strip below the card just makes an otherwise invisible
// opportunity legible to a stranger who has no way to be told about it.
//
// The design problem it solves: two people in a gallery don't know each other
// exist. A notification banner is something you dismiss — a persistent slot
// sitting under your card is an open question you keep looking at, which is what
// actually prompts someone to act. The symbol hint makes it solvable rather than
// guesswork.
//
// Messages (from Unity's ComboManager):
//   combo_path|clientId|comboId|x,y;x,y;...|finish   (web -> Unity)
//   combo_primed|comboId|primerId|primerName|colorHex|needCard|windowSecs
//   combo_expired|comboId
//   combo_complete|comboId|primerId|primerName|completerId|completerName|colorHex
//
// Exposes: Combo.handleMessage(msg) — returns true if it consumed the message.

const Combo = (() => {

  // Art for each half of a recipe. Adding a combo later only needs entries here.
  const CARD_ART = {
    thornwire: 'assets/leaf-symbol.png',     // placeholder until the thorn art lands
    sheep:     'assets/critter-symbol.png',
  };

  // What each recipe's PRIMING card is, so the strip can show what was actually
  // played rather than an anonymous box.
  const RECIPE_PRIMER = {
    spiky_sheep: 'thornwire',
  };

  const COMBO_LABEL = {
    spiky_sheep: 'SPIKY SHEEP',
  };

  // Pixel-art card frame for earned synergy cards — violet, since that's the
  // colour reserved for a landed combo (nature blue + critter pink).
  const COMBO_FRAME = 'assets/combo_card_violet.png';

  let _active   = null;   // { comboId, primerId, primerName, colorHex, needCard, endsAt, windowSecs }
  let _rafId    = null;
  let _flashT   = null;

  // Ability cards earned this session and not yet spent. Session-only, matching
  // stars and the collection — a refresh clears them.
  let _earned   = [];     // [{ comboId, label, withName, colorHex }]

  function _el(id) { return document.getElementById(id); }

  // ── Public: WS routing ──────────────────────────────────────────────────────
  function handleMessage(msg) {
    if (typeof msg !== 'string') return false;

    if (msg.startsWith('combo_primed|')) {
      const p = msg.split('|');
      _onPrimed({
        comboId:    p[1] || '',
        primerId:   p[2] || '',
        primerName: p[3] || '',
        colorHex:   p[4] ? ('#' + p[4].replace('#', '')) : '#c8a0ff',
        needCard:   (p[5] || '').toLowerCase(),
        windowSecs: parseFloat(p[6]) || 30,
      });
      return true;
    }
    if (msg.startsWith('combo_expired|')) { _clear(); return true; }
    // "leafstorm_denied|clientId" — Unity rejected the trace because another
    // storm is already active. The card was already spent when the trace
    // opened (see beginAbilityTrace), so this is purely informational.
    if (msg.startsWith('leafstorm_denied|')) {
      const p = msg.split('|');
      if (typeof CLIENT_ID !== 'undefined' && p[1] === CLIENT_ID) {
        _showToast('A storm is already tearing through — wait for it to pass');
      }
      return true;
    }
    if (msg.startsWith('combo_complete|')) {
      const p = msg.split('|');
      _onComplete({
        comboId:       p[1] || '',
        primerId:      p[2] || '',
        primerName:    p[3] || '',
        completerId:   p[4] || '',
        completerName: p[5] || '',
        colorHex:      p[6] ? ('#' + p[6].replace('#', '')) : '#c8a0ff',
      });
      return true;
    }
    return false;
  }

  // ── Primed ──────────────────────────────────────────────────────────────────
  function _onPrimed(data) {
    _active = { ...data, endsAt: Date.now() + data.windowSecs * 1000 };
    _render();
    _startTicking();
    if (typeof Sound !== 'undefined') Sound.play('uiOpen');
  }

  function _render() {
    const strip = _el('comboStrip');
    if (!strip || !_active) return;

    // Is this MY combo? The primer sees "waiting for someone"; everyone else
    // sees an invitation naming who to help.
    const mine = (typeof CLIENT_ID !== 'undefined') && _active.primerId === CLIENT_ID;
    const hint = CARD_ART[_active.needCard] || '';

    // Show the card that was actually PLAYED, not an anonymous box — otherwise
    // the strip states a rule ("something + sheep") without saying what the
    // something was, which is the part a bystander needs in order to act.
    const primerCard = RECIPE_PRIMER[_active.comboId] || '';
    const primerArt  = CARD_ART[primerCard] || '';

    strip.innerHTML =
      `<span class="combo-played">` +
        (primerArt ? `<img class="combo-played-art" src="${primerArt}" alt="">` : '') +
      `</span>` +
      `<span class="combo-plus">+</span>` +
      `<span class="combo-slot">` +
        (hint ? `<img class="combo-slot-hint" src="${hint}" alt="">` : `<span class="combo-slot-q">?</span>`) +
      `</span>` +
      `<span class="combo-caption">${
        mine ? 'waiting for a <b>sheep</b>'
             : `play a <b>sheep</b> for <span class="combo-name">&lt;${_esc(_active.primerName)}&gt;</span>`
      }</span>` +
      // The strip's OWN border is the countdown — a separate ring competed with
      // the sheep symbol for the same small space and made both harder to read.
      // Drawn as an SVG outline over the strip so it can be stroked away.
      `<svg class="combo-border" preserveAspectRatio="none">` +
        `<rect class="combo-border-fill" x="1" y="1" rx="9" ry="9"></rect>` +
      `</svg>`;

    const nameEl = strip.querySelector('.combo-name');
    if (nameEl) nameEl.style.color = _active.colorHex;

    strip.classList.add('combo-strip--open');
    strip.classList.toggle('combo-strip--mine', mine);

    _sizeBorder();
  }

  // Match the SVG outline to the strip's current pixel size. Done after render
  // (and on the first ticks) because the strip's width depends on its caption.
  function _sizeBorder() {
    const strip = _el('comboStrip');
    if (!strip) return;
    const svg  = strip.querySelector('.combo-border');
    const rect = strip.querySelector('.combo-border-fill');
    if (!svg || !rect) return;

    const w = strip.offsetWidth, h = strip.offsetHeight;
    if (w < 4 || h < 4) return;

    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    rect.setAttribute('width',  Math.max(0, w - 2));
    rect.setAttribute('height', Math.max(0, h - 2));

    // getTotalLength handles the rounded corners exactly, rather than
    // approximating the perimeter by hand.
    let len = 0;
    try { len = rect.getTotalLength(); } catch (e) { len = 2 * (w + h); }
    _borderLen = len || 2 * (w + h);
    rect.style.strokeDasharray = `${_borderLen}`;
  }
  let _borderLen = 0;

  // Drive the cooldown ring.
  //
  // setInterval rather than requestAnimationFrame: rAF is suspended whenever the
  // page isn't compositing (phone screen off, browser backgrounded, tab hidden).
  // That would freeze the ring AND stop the local expiry fallback from ever
  // firing, leaving a stale slot on screen when the player looks back. 60ms is
  // smooth enough for a countdown and keeps ticking regardless.
  function _startTicking() {
    _stopTicking();
    _rafId = setInterval(() => {
      if (!_active) { _stopTicking(); return; }
      const remain = Math.max(0, _active.endsAt - Date.now());
      const frac   = remain / (_active.windowSecs * 1000);

      // Urgency in the last few seconds — the draining border does the drama, so
      // the window itself can stay generous enough to actually be completable.
      const urgent = remain < 6000 && remain > 0;

      const border = document.querySelector('#comboStrip .combo-border-fill');
      if (border) {
        // Re-measure until the layout settles — fonts and the hint image can
        // change the strip's width a frame or two after it first renders.
        if (!_borderLen) _sizeBorder();
        border.style.strokeDashoffset = `${_borderLen * (1 - frac)}`;
        // Set the stroke inline rather than via a CSS class. The tick already
        // knows the remaining time, so keeping the threshold in one place here
        // avoids splitting it between JS class-toggling and a cascade rule.
        border.style.stroke = urgent ? '#ffaa5a' : '#78ffaa';
        border.style.filter = urgent
          ? 'drop-shadow(0 0 5px rgba(255,170,90,0.9))'
          : 'drop-shadow(0 0 4px rgba(120,255,170,0.85))';
      }

      const strip = _el('comboStrip');
      if (strip) strip.classList.toggle('combo-strip--urgent', urgent);

      // Local fallback only — Unity's combo_expired is authoritative. This just
      // stops a slot lingering if that broadcast is missed or delayed.
      if (remain <= 0) _clear();
    }, 60);
  }

  function _stopTicking() {
    if (_rafId) { clearInterval(_rafId); _rafId = null; }
    _borderLen = 0;   // force a re-measure for the next combo
  }

  // ── Completed ───────────────────────────────────────────────────────────────
  function _onComplete(data) {
    _stopTicking();
    _active = null;

    const label = COMBO_LABEL[data.comboId] || 'SYNERGY';

    // Only the two players who actually performed it are rewarded. Everyone else
    // just sees the announcement — the card is earned, not broadcast loot.
    const me    = (typeof CLIENT_ID !== 'undefined') ? CLIENT_ID : null;
    const mine  = me && (data.primerId === me || data.completerId === me);
    const partner = !me ? '' :
      (data.primerId === me ? data.completerName : data.primerName);

    if (mine) {
      _earned.push({
        comboId:  data.comboId,
        label,
        withName: partner,
        colorHex: data.colorHex,
      });
      _renderEarned();
      if (typeof TaskTracker !== 'undefined' && TaskTracker.recordEvent)
        TaskTracker.recordEvent('combo');
    }

    const strip = _el('comboStrip');
    if (!strip) return;

    strip.classList.remove('combo-strip--urgent');
    strip.classList.add('combo-strip--complete');
    strip.innerHTML =
      `<span class="combo-burst">✦</span>` +
      `<span class="combo-caption combo-caption--done">` +
        `<span class="combo-name">&lt;${_esc(data.primerName)}&gt;</span> + ` +
        `<span class="combo-name">&lt;${_esc(data.completerName)}&gt;</span><br>` +
        `<b>${_esc(label)}</b> ${mine ? 'earned' : 'forged'}` +
      `</span>`;
    strip.querySelectorAll('.combo-name').forEach(n => { n.style.color = data.colorHex; });

    if (typeof Sound !== 'undefined') Sound.play('star');
    if (navigator.vibrate) { try { navigator.vibrate([40, 40, 80]); } catch (e) {} }

    clearTimeout(_flashT);
    _flashT = setTimeout(_clear, 4000);
  }

  // ── Earned ability cards ────────────────────────────────────────────────────
  // Persist for the session beside the combo strip until spent. Tapping one asks
  // for confirmation rather than firing immediately: it's a one-shot resource,
  // and an accidental tap that burns a co-op reward would feel awful.
  function _renderEarned() {
    const tray = _el('comboTray');
    if (!tray) return;

    if (!_earned.length) {
      tray.innerHTML = '';
      tray.classList.remove('combo-tray--open');
      return;
    }

    // Built like the game's other cards: a dark art window with the frame PNG
    // laid over it, so the pixel border sits ON the card edge rather than the
    // content being boxed inside a plain rectangle.
    tray.innerHTML = _earned.map((c, i) =>
      `<button class="combo-card" data-idx="${i}" title="${_esc(c.label)}">` +
        `<span class="combo-card-window">` +
          `<span class="combo-card-sym">✦</span>` +
          `<span class="combo-card-label">${_esc(c.label)}</span>` +
        `</span>` +
        `<img class="combo-card-frame" src="${COMBO_FRAME}" alt="">` +
      `</button>`
    ).join('');
    tray.classList.add('combo-tray--open');

    tray.querySelectorAll('.combo-card').forEach(btn => {
      btn.addEventListener('click', () => _promptUse(parseInt(btn.dataset.idx, 10)));
    });
  }

  function _promptUse(idx) {
    const card = _earned[idx];
    if (!card) return;
    const modal = _el('comboPrompt');
    if (!modal) return;

    modal.innerHTML =
      `<div class="combo-prompt-card">` +
        // The actual card, shown large — the player should see the thing they're
        // about to spend, not just read its name.
        `<div class="combo-prompt-art">` +
          `<span class="combo-card-window">` +
            `<span class="combo-prompt-sym">✦</span>` +
            `<span class="combo-prompt-title">${_esc(card.label)}</span>` +
          `</span>` +
          `<img class="combo-card-frame" src="${COMBO_FRAME}" alt="">` +
        `</div>` +
        `<div class="combo-prompt-sub">` +
          (card.withName ? `forged with &lt;${_esc(card.withName)}&gt;` : 'ability card') +
        `</div>` +
        `<button class="combo-prompt-btn combo-prompt-btn--go" id="comboPromptUse">ACTIVATE ABILITY CARD</button>` +
        `<button class="combo-prompt-btn" id="comboPromptLater">USE LATER</button>` +
      `</div>`;
    modal.classList.add('combo-prompt--open');
    if (typeof Sound !== 'undefined') Sound.play('uiOpen');

    _el('comboPromptUse').addEventListener('click', () => {
      _closePrompt();
      _activate(idx);
    });
    _el('comboPromptLater').addEventListener('click', _closePrompt);
    modal.addEventListener('click', e => { if (e.target === modal) _closePrompt(); });
  }

  function _closePrompt() {
    const modal = _el('comboPrompt');
    if (modal) { modal.classList.remove('combo-prompt--open'); modal.innerHTML = ''; }
  }

  function _activate(idx) {
    const card = _earned[idx];
    if (!card) return;

    // The card isn't spent yet — it's consumed only once a path is actually
    // released. Cancelling out of the drawing step must not burn the reward.
    _pending = { idx, card };
    _openPathDraw(card);
  }

  // ── Path drawing ────────────────────────────────────────────────────────────
  // The player drags a route across the map and the spiky sheep charges along
  // it. Drawing (rather than picking a target) is the point: it's the most
  // active input in the piece, which is what the co-op reward should feel like.

  let _pending  = null;   // { idx, card } awaiting a path
  let _path     = [];     // [{x,y}] normalised drop-zone points
  let _drawing  = false;

  // Raised 24 → 56. The cap silently TRUNCATES a drag once it's hit, so at 24 a
  // player tracing a figure eight ran out of budget partway through the second
  // loop and the stroke just stopped recording mid-gesture. 56 is enough to
  // close the shape comfortably.
  //
  // At ~12 chars per point ("0.123,0.456;") that's still well under 700 chars of
  // WS payload, so the message stays small.
  const PATH_MAX_POINTS = 56;
  const PATH_MIN_STEP   = 0.02;  // normalised distance between kept samples
  const PATH_MIN_POINTS = 2;

  // Minimal self-contained toast — no dependency on main.js's UI helpers, since
  // combo.js already owns its own panel DOM and this only needs to appear once,
  // briefly, at the bottom of the screen.
  let _toastTimer = null;
  function _showToast(text) {
    let t = document.getElementById('comboToast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'comboToast';
      t.style.cssText = 'position:fixed;left:50%;bottom:18%;transform:translateX(-50%);' +
        'background:rgba(20,4,10,0.92);color:#ffb0c0;border:1px solid rgba(255,120,150,0.5);' +
        'padding:10px 16px;border-radius:6px;font-size:14px;z-index:9999;' +
        'pointer-events:none;opacity:0;transition:opacity 0.25s ease;text-align:center;max-width:80vw;';
      document.body.appendChild(t);
    }
    t.textContent = text;
    requestAnimationFrame(() => { t.style.opacity = '1'; });
    clearTimeout(_toastTimer);
    _toastTimer = setTimeout(() => { t.style.opacity = '0'; }, 2200);
    if (typeof Sound !== 'undefined') Sound.play('deny');
  }

  function _openPathDraw(card) {
    const panel = _el('comboPath');
    if (!panel) return;
    _path    = [];
    _drawing = false;
    panel.classList.add('combo-path--open');
    _updatePathUI();
    _drawPathMap();
    if (typeof Sound !== 'undefined') Sound.play('uiOpen');
  }

  /// <summary>
  /// Open the SAME trace panel for a card that isn't an earned combo reward —
  /// e.g. Leaf Storm, pulled directly from a pack. `_pending.external = true`
  /// tells _releasePath to skip the _earned.splice/render, since there's nothing
  /// in that array to remove.
  ///
  /// abilityId is sent as-is in the combo_path message (ComboManager.RunAbilityPath
  /// dispatches on it generically — 'spiky_sheep' and 'leafstorm' are just two
  /// registered ids in the same switch).
  /// </summary>
  function beginAbilityTrace(abilityId, displayName, finish) {
    _pending = {
      idx: -1,
      card: { comboId: abilityId, name: displayName, finish: finish || '' },
      external: true,
    };
    _openPathDraw(_pending.card);

    const hint = _el('comboPathHint');
    if (hint) hint.textContent = `trace a figure eight — release to unleash ${displayName || abilityId}`;
  }

  function _closePathDraw() {
    const panel = _el('comboPath');
    if (panel) panel.classList.remove('combo-path--open');
    // Same click-through guard as the placement modal: this panel closes out
    // from under the pointer, and the pack canvas opens on `click`.
    if (typeof window !== 'undefined') window.suppressPackOpenUntil = Date.now() + 600;
    _path    = [];
    _drawing = false;
    _pending = null;
  }

  function _pathEventNorm(e) {
    const cv = _el('comboPathMap');
    if (!cv) return null;
    const r   = cv.getBoundingClientRect();
    const src = (e.changedTouches && e.changedTouches[0]) || e;
    if (src.clientX === undefined) return null;
    const px = (src.clientX - r.left) * (cv.width  / r.width);
    const py = (src.clientY - r.top)  * (cv.height / r.height);
    // Reuses possession.js's calibrated mapping so a drawn path lands where the
    // player drew it, matching the placement marker and spore trail.
    return _mapXYToNorm(px, py, cv.width, cv.height);
  }

  function _pathDown(e) {
    if (!_pending) return;
    e.preventDefault();
    _drawing = true;
    _path = [];
    const n = _pathEventNorm(e);
    if (n) _path.push(n);
    _updatePathUI();
    _drawPathMap();
  }

  function _pathMove(e) {
    if (!_drawing || !_pending) return;
    const n = _pathEventNorm(e);
    if (!n) return;
    const last = _path[_path.length - 1];
    // Sample by distance, not by event: raw pointermove floods the array and
    // would blow out the WS message on a fast drag.
    if (last && Math.hypot(n.x - last.x, n.y - last.y) < PATH_MIN_STEP) return;
    if (_path.length >= PATH_MAX_POINTS) return;
    _path.push(n);
    _updatePathUI();
    _drawPathMap();
  }

  function _pathUp() {
    if (!_drawing) return;
    _drawing = false;
    _updatePathUI();
  }

  function _updatePathUI() {
    const go   = _el('comboPathGo');
    const hint = _el('comboPathHint');
    const ok   = _path.length >= PATH_MIN_POINTS;
    if (go)   go.disabled = !ok;
    if (hint) hint.textContent = ok
      ? `${_path.length} points — release to charge`
      : 'drag a path across the map';
  }

  function _drawPathMap() {
    const cv = _el('comboPathMap');
    if (!cv) return;
    const ctx = cv.getContext('2d');
    const W = cv.width, H = cv.height;
    if (typeof _drawMapBase === 'function') _drawMapBase(ctx, W, H);
    else { ctx.fillStyle = '#0a160e'; ctx.fillRect(0, 0, W, H); }

    if (!_path.length) return;

    ctx.save();
    ctx.strokeStyle = 'rgba(200,150,255,0.95)';
    ctx.lineWidth   = 3;
    ctx.lineJoin    = 'round';
    ctx.lineCap     = 'round';
    ctx.shadowColor = 'rgba(200,150,255,0.9)';
    ctx.shadowBlur  = 6;
    ctx.beginPath();
    _path.forEach((p, i) => {
      const { px, py } = _normToMapXY(p.x, p.y, W, H);
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    });
    ctx.stroke();

    // Start marker, so the direction of travel is unambiguous
    const s = _normToMapXY(_path[0].x, _path[0].y, W, H);
    ctx.fillStyle = '#e8ccff';
    ctx.beginPath(); ctx.arc(s.px, s.py, 4, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function _releasePath() {
    if (!_pending || _path.length < PATH_MIN_POINTS) return;

    const card = _pending.card;
    const pts  = _path.map(p => `${p.x.toFixed(3)},${p.y.toFixed(3)}`).join(';');
    if (typeof CLIENT_ID !== 'undefined')
      // 5th field is the card's finish — '' or 'holo'. Trailing, so an older
      // Unity build that splits on the first four fields is unaffected.
      send(`combo_path|${CLIENT_ID}|${card.comboId}|${pts}|${card.finish || ''}`);

    // External abilities (Leaf Storm) were already claimed in dropCard's pack
    // flow — there's no entry in _earned to remove.
    if (!_pending.external) {
      const i = _earned.indexOf(card);
      if (i >= 0) _earned.splice(i, 1);
      _renderEarned();
    }

    if (typeof Sound !== 'undefined') Sound.play('place');
    if (navigator.vibrate) { try { navigator.vibrate([30, 30, 60]); } catch (e) {} }
    console.log('[combo.js] Released', card.comboId, 'along', _path.length, 'points');
    _closePathDraw();
  }

  // Bound once on load. Move/up live on window so a drag that leaves the canvas
  // still tracks and releases cleanly.
  function _bindPathEvents() {
    const cv = _el('comboPathMap');
    if (cv) cv.addEventListener('pointerdown', _pathDown);
    window.addEventListener('pointermove', _pathMove);
    window.addEventListener('pointerup',   _pathUp);
    const go = _el('comboPathGo');
    if (go) go.addEventListener('click', _releasePath);
    const clr = _el('comboPathClear');
    if (clr) clr.addEventListener('click', () => { _path = []; _updatePathUI(); _drawPathMap(); });

    // Tapping the backdrop backs out WITHOUT spending the card. Activating is a
    // two-step commitment (activate → draw → release); a player who changes
    // their mind mid-draw must not lose a one-shot co-op reward.
    const panel = _el('comboPath');
    if (panel) {
      panel.addEventListener('pointerdown', e => {
        if (e.target !== panel) return;   // ignore taps on the card itself
        _closePathDraw();
        _renderEarned();                  // card is still held — redraw the tray
      });
    }
  }

  if (typeof window !== 'undefined') {
    if (document.readyState === 'loading')
      window.addEventListener('DOMContentLoaded', _bindPathEvents);
    else _bindPathEvents();
  }

  // ── Teardown ────────────────────────────────────────────────────────────────
  function _clear() {
    _stopTicking();
    _active = null;
    const strip = _el('comboStrip');
    if (!strip) return;
    strip.classList.remove('combo-strip--open', 'combo-strip--urgent',
                           'combo-strip--complete', 'combo-strip--mine');
    strip.innerHTML = '';
  }

  function _esc(s) {
    return String(s).replace(/[&<>"]/g, c =>
      ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]));
  }

  return { handleMessage, beginAbilityTrace };
})();

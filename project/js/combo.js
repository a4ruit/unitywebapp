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
//   combo_primed|comboId|primerId|primerName|colorHex|needCard|windowSecs
//   combo_expired|comboId
//   combo_complete|comboId|primerId|primerName|completerId|completerName|colorHex
//
// Exposes: Combo.handleMessage(msg) — returns true if it consumed the message.

const Combo = (() => {

  // Symbol drawn inside the dashed slot as the hint. Keyed by the card Unity
  // says is needed, so adding a recipe later only needs an entry here.
  const HINT_ART = {
    sheep: 'assets/critter-symbol.png',
  };

  let _active   = null;   // { comboId, primerId, primerName, colorHex, needCard, endsAt, windowSecs }
  let _rafId    = null;
  let _flashT   = null;

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
    if (msg.startsWith('combo_complete|')) {
      const p = msg.split('|');
      _onComplete({
        primerName:    p[3] || '',
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
    const hint = HINT_ART[_active.needCard] || '';

    strip.innerHTML =
      `<span class="combo-played"></span>` +
      `<span class="combo-plus">+</span>` +
      `<span class="combo-slot">` +
        (hint ? `<img class="combo-slot-hint" src="${hint}" alt="">` : `<span class="combo-slot-q">?</span>`) +
        `<svg class="combo-ring" viewBox="0 0 40 40">` +
          `<circle class="combo-ring-bg" cx="20" cy="20" r="17"></circle>` +
          `<circle class="combo-ring-fill" cx="20" cy="20" r="17"></circle>` +
        `</svg>` +
      `</span>` +
      `<span class="combo-caption">${
        mine ? 'waiting for a <b>sheep</b>'
             : `play a <b>sheep</b> for <span class="combo-name">&lt;${_esc(_active.primerName)}&gt;</span>`
      }</span>`;

    const nameEl = strip.querySelector('.combo-name');
    if (nameEl) nameEl.style.color = _active.colorHex;

    strip.classList.add('combo-strip--open');
    strip.classList.toggle('combo-strip--mine', mine);
  }

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

      const ring = document.querySelector('#comboStrip .combo-ring-fill');
      if (ring) {
        const C = 2 * Math.PI * 17;
        ring.style.strokeDasharray  = `${C}`;
        ring.style.strokeDashoffset = `${C * (1 - frac)}`;
      }
      // Urgency in the last few seconds — the ring does the drama so the window
      // itself can stay generous enough to actually be completable.
      const strip = _el('comboStrip');
      if (strip) strip.classList.toggle('combo-strip--urgent', remain < 6000 && remain > 0);

      // Local fallback only — Unity's combo_expired is authoritative. This just
      // stops a slot lingering if that broadcast is missed or delayed.
      if (remain <= 0) _clear();
    }, 60);
  }

  function _stopTicking() {
    if (_rafId) { clearInterval(_rafId); _rafId = null; }
  }

  // ── Completed ───────────────────────────────────────────────────────────────
  function _onComplete(data) {
    _stopTicking();
    _active = null;

    const strip = _el('comboStrip');
    if (!strip) return;

    strip.classList.remove('combo-strip--urgent');
    strip.classList.add('combo-strip--complete');
    strip.innerHTML =
      `<span class="combo-burst">✦</span>` +
      `<span class="combo-caption combo-caption--done">` +
        `<span class="combo-name">&lt;${_esc(data.primerName)}&gt;</span> + ` +
        `<span class="combo-name">&lt;${_esc(data.completerName)}&gt;</span><br>` +
        `<b>SPIKY SHEEP</b> forged` +
      `</span>`;
    strip.querySelectorAll('.combo-name').forEach(n => { n.style.color = data.colorHex; });

    if (typeof Sound !== 'undefined') Sound.play('star');
    if (navigator.vibrate) { try { navigator.vibrate([40, 40, 80]); } catch (e) {} }

    clearTimeout(_flashT);
    _flashT = setTimeout(_clear, 4000);
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

  return { handleMessage };
})();

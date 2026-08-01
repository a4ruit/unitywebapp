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

    tray.innerHTML = _earned.map((c, i) =>
      `<button class="combo-card" data-idx="${i}" title="${_esc(c.label)}">` +
        `<span class="combo-card-sym">✦</span>` +
        `<span class="combo-card-label">${_esc(c.label)}</span>` +
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
        `<div class="combo-prompt-sym">✦</div>` +
        `<div class="combo-prompt-title">${_esc(card.label)}</div>` +
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
    _earned.splice(idx, 1);   // one-shot — spent on use
    _renderEarned();

    if (typeof CLIENT_ID !== 'undefined')
      send(`combo_activate|${CLIENT_ID}|${card.comboId}`);

    if (typeof Sound !== 'undefined') Sound.play('place');
    console.log('[combo.js] Activated', card.comboId);
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

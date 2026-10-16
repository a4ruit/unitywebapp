// avatar.js — the role avatar: BULLWARK (name provisional).
//
// A third kind of control, between placing a card and inhabiting a critter.
// There is NO camera and no video: the player drives a body on the projection
// by looking up at it. That is the point, not a shortcut — a possession puts
// the room inside the phone, and this does the opposite.
//
// Deliberately its own module rather than part of possession.js. That file is
// built around a session: a grant, a timer, a WebRTC stream, a slot. This has
// none of those, and threading "except this one" through all four stages would
// make the possession code worse to save writing a joystick twice.
//
// ── Protocol ──────────────────────────────────────────────────────────────
//   avatar_enter|<clientId>
//   avatar_input|<clientId>|<x>|<y>      -1..1, 20fps, change-only
//   avatar_ability|<clientId>|taunt
//   avatar_ability|<clientId>|slam
//   avatar_exit|<clientId>
const Avatar = (() => {

  let _out  = false;          // currently a body on the field
  let _ui   = null;
  let _loop = null;
  let _busy = false;          // another player holds the one body
  const _cool = {};           // ability -> epoch ms when it is usable again
  let _charges = 0;           // ability uses left on the body, per Unity
  let _chargesMax = 0;        // first value Unity sends is the full load
  let _slotUsed = 0, _slotCap = 1;   // room-wide occupancy, broadcast by Unity
  let _role = null;           // which stream's body is currently held
  let _dealt = false;         // the reveal has played; it only ever plays once
  let _x = 0, _y = 0;
  let _lastX = 0, _lastY = 0, _lastSend = 0;

  const RATE      = 50;       // ms between ticks (20fps)
  const KEEPALIVE = 600;      // ms before an unchanged stick is resent
  const DEAD      = 0.04;

  // Only TANK has an avatar built. The others are listed so the gate reads as
  // "not yet" rather than "tank is special".
  // Each stream's body: its name, its two abilities and its emblem. Keyed by
  // the spec role, so adding the damage avatar later is a row here plus art.
  const AVATARS = {
    tank: {
      name: 'BULLWARK', ready: true,
      emblem: 'assets/bullwarksymbol.png',
      // Matches Element.Stone's energy colour in Unity, so the card in the
      // hand and the body on the wall are lit the same.
      theme: { edge: '#76c4e8', glow: '90,190,255', ink: '#dff2ff', dim: '#51788c' },
      // ORDERED. STAMPEDE sits first because it is the ability that commits —
      // you charge in, then roar, then slam — and a row whose order matches the
      // order they are actually used in is one less thing to learn.
      spells: [
        { id: 'charge', label: 'STAMPEDE', art: 'assets/charge.png'      },
        { id: 'taunt',  label: 'ROAR',     art: 'assets/taunt.png'       },
        { id: 'slam',   label: 'SLAM',     art: 'assets/shieldslam.png'  },
      ],
    },
    medic: {
      name: 'MOTHELIA', ready: true,
      emblem: 'assets/motheliasymbol.png',
      // Element.Spore's mint. Not the symbol's exact green — a frame in the
      // art's own colour swallows the art, so the chrome sits a step cooler
      // and lets the emblem be the brightest thing on the card.
      theme: { edge: '#6fe3ab', glow: '110,230,170', ink: '#d8ffe9', dim: '#4c806a' },
      spells: [
        { id: 'siphon',   label: 'SPORESIPHON', art: 'assets/sporesiphon.png' },
        { id: 'mothmend', label: 'MOTHMEND',    art: 'assets/mothmend.png'    },
      ],
    },
    damage: {
      name: 'TSURINI', ready: true,
      emblem: 'assets/surini.png',
      // Element.Bolt's purple. Brighter and more saturated than the other two
      // because the body it belongs to is nearly black — the chrome is carrying
      // the colour that the wolf itself deliberately does not.
      theme: { edge: '#b45ce8', glow: '180,90,235', ink: '#f0ddff', dim: '#6b4a82' },
      spells: [
        { id: 'lunge', label: 'LUNGE', art: 'assets/swordswipe.png' },
        { id: 'rend',  label: 'REND',  art: 'assets/xswipe.png'     },
      ],
    },
  };

  // The three streams. Declaration order only — the dealt order puts the
  // player's own card in the middle, so this is just the set and the fallback.
  const HAND        = ['tank', 'medic', 'damage'];
  const HAND_SPREAD = 7;    // degrees of fan per step from centre
  const HAND_SLIDE  = 66;   // px of horizontal travel per step

  function _spec() {
    try { return typeof Spec !== 'undefined' ? Spec.current() : null; }
    catch (e) { return null; }
  }

  /// The card the player has earned, or null.
  function available() {
    const s = _spec();
    const a = s ? AVATARS[s] : null;
    return a && a.ready ? a : null;
  }

  // ── UI ───────────────────────────────────────────────────────────────────

  function _build() {
    if (_ui) return;

    const root = document.createElement('div');
    root.id = 'avatar-root';

    // One full-screen layer, and the SCRIM is the important part of it.
    //
    // The previous version was a strip of controls floating over a live pack
    // carousel, so the heel of the steering thumb could open a pack mid-fight.
    // Dimming the carousel was not enough — the only reliable answer is a
    // surface that eats every touch that is not a control, which is what this
    // is. It only exists while driving.
    root.innerHTML = `
      <!-- The hand. Three cards, always all three, with the earned one dealt
           to the centre - see the dealing order note in refresh(). -->
      <div id="avatar-hand-dim" class="avatar-hand-dim"></div>
      <div id="avatar-hand" class="avatar-hand" hidden></div>
      <div id="avatar-pad" class="avatar-pad" hidden>
        <div class="avatar-scrim"></div>

        <!-- Everything lives in ONE panel. Scattered across the screen the
             controls read as a HUD laid over the pack app; gathered into a
             single bordered card they read as a device the player has picked
             up, which is what the mode actually is. -->
        <div class="avatar-card">
          <!-- Rides the top edge of the frame, walking right as charges go. -->
          <img id="avatar-runner" class="avatar-runner" src="assets/cowpixel.png" alt="">

          <div class="avatar-card-top">
            <span class="avatar-title">BULLWARK</span>
            <div class="avatar-charges" id="avatar-charges"></div>
            <!-- aria-label, because the glyph alone is not a word. -->
            <button id="avatar-exit" class="avatar-leave" aria-label="Leave">&times;</button>
          </div>

          <!-- The centrepiece, framed the way a card frames its symbol: an
               inset plate with the art floating in the middle of it. This is
               what makes the overlay read as a CARD the player is holding
               rather than a control bar stuck to the bottom of the app. -->
          <div class="avatar-stage">
            <img class="avatar-emblem" src="assets/bullwarksymbol.png" alt="">
          </div>

          <div class="avatar-card-body">
            <div class="avatar-stick" id="avatar-stick">
              <div class="avatar-knob"></div>
            </div>

            <!-- Filled per body in _dressSpells: the set is not the same size
                 for every avatar, so the buttons are built from the table
                 rather than written here. -->
            <div class="avatar-spells" id="avatar-spells"></div>
          </div>
        </div>
      </div>`;
    document.body.appendChild(root);

    _ui = {
      root,
      hand:  root.querySelector('#avatar-hand'),
      dim:   root.querySelector('#avatar-hand-dim'),
      pad:   root.querySelector('#avatar-pad'),
      stick: root.querySelector('#avatar-stick'),
      knob:  root.querySelector('.avatar-knob'),
      spells: root.querySelector('#avatar-spells'),
      exit:  root.querySelector('#avatar-exit'),
      pips:  root.querySelector('#avatar-charges'),
      run:   root.querySelector('#avatar-runner'),
    };

    _ui.exit.onclick = exit;

    _wireStick();
    refresh();
  }

  function _wireStick() {
    const el = _ui.stick;
    let id = null, cx = 0, cy = 0, r = 1;

    const start = (e) => {
      const t = e.changedTouches ? e.changedTouches[0] : e;
      id = t.identifier !== undefined ? t.identifier : 'mouse';
      const b = el.getBoundingClientRect();
      cx = b.left + b.width / 2;
      cy = b.top  + b.height / 2;
      r  = b.width / 2;
      move(e);
    };

    const move = (e) => {
      if (id === null) return;
      const list = e.changedTouches ? Array.from(e.changedTouches) : [e];
      const t = list.find(p => (p.identifier !== undefined ? p.identifier : 'mouse') === id);
      if (!t) return;

      let dx = (t.clientX - cx) / r;
      let dy = (t.clientY - cy) / r;
      const m = Math.hypot(dx, dy);
      if (m > 1) { dx /= m; dy /= m; }

      _x = dx;
      // Screen Y grows downward; the world's does not. Flipped here rather than
      // in Unity so the sign lives next to the thing that produced it.
      _y = -dy;

      _ui.knob.style.transform = `translate(${dx * r * 0.6}px, ${dy * r * 0.6}px)`;
      e.preventDefault();
    };

    const end = () => {
      id = null;
      _x = 0; _y = 0;
      _ui.knob.style.transform = 'translate(0,0)';
    };

    el.addEventListener('touchstart', start, { passive: false });
    el.addEventListener('touchmove',  move,  { passive: false });
    el.addEventListener('touchend',   end);
    el.addEventListener('touchcancel',end);
    el.addEventListener('mousedown',  start);
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup',   end);
  }

  // ── The runner ────────────────────────────────────────────────────────────
  // A pixel BULLWARK trotting along the top edge of the frame. Where he is on
  // that edge IS the charge counter: left when the body is fresh, hard right
  // when the next ability is the last one.
  //
  // It says the same thing the pips do, which is the point — the pips are exact
  // and this is felt. A player glancing at their phone mid-fight does not count
  // pips; they see how far along he has got, the same way anyone reads a figure
  // walking toward the edge of something.
  //
  // Now the supplied cowpixel.png rather than a grid drawn here. That means it
  // is ONE frame, so the trot is faked in CSS — a hop and a slight rock, which
  // on a sprite this small reads as gait about as well as a two-frame cycle did
  // and costs no render loop at all.

  /// Slide him along the top edge to match the charges left.
  ///
  /// Eased rather than snapped: the jump happens the moment an ability fires,
  /// and a figure that teleports a quarter of the way across reads as a glitch
  /// where one that walks reads as progress.
  function _placeRunner() {
    const cv = _ui && _ui.run;
    if (!cv) return;
    const max = Math.max(1, _chargesMax);
    const spent = Math.max(0, max - _charges);
    _runX = spent / max;
    // Offset by his own width as he travels, so the SPRITE stays inside the
    // card instead of his left edge reaching the right border and the rest of
    // him hanging off it.
    cv.style.left = `calc(${(_runX * 100).toFixed(1)}% - ${(_runX * 64).toFixed(0)}px)`;
    // Leans on the last charge, same amber as the pips.
    cv.classList.toggle('is-last', _charges === 1);
  }

  /// The button that fires a given ability on the body currently held.
  ///
  /// Resolved through the avatar's own slot map rather than matched against a
  /// name. It used to read `which === 'slam' ? slam : taunt`, which is correct
  /// for exactly one body — MOTHMEND is not 'slam', so it fell through to the
  /// else and started SPORESIPHON's cooldown instead. Any hardcoded ability
  /// name outside the AVATARS table is this bug waiting to happen again.
  function _btnFor(which) {
    if (!_ui || !_ui.spells) return null;
    return _ui.spells.querySelector(`[data-ability="${which}"]`);
  }

  /// Dress the card for whichever body this is: emblem, title and its spell
  /// buttons.
  ///
  /// Done at ENTER rather than at build, because one player can hold different
  /// bodies across a session — they spend MOTHELIA, switch stream and come back
  /// as BULLWARK — and a card dressed once would still be showing the moth.
  function _dressSpells(a) {
    if (!_ui || !a) return;

    const title = _ui.root.querySelector('.avatar-title');
    if (title) title.textContent = a.name;

    const em = _ui.root.querySelector('.avatar-emblem');
    if (em && a.emblem) em.src = a.emblem;

    // Repaint the whole overlay in this body's colours. Four custom properties
    // on the pad rather than a class per avatar, so a new body ships a palette
    // instead of a stylesheet.
    const t = a.theme;
    if (t && _ui.pad) {
      _ui.pad.style.setProperty('--av-edge', t.edge);
      _ui.pad.style.setProperty('--av-glow', t.glow);
      _ui.pad.style.setProperty('--av-ink',  t.ink);
      _ui.pad.style.setProperty('--av-dim',  t.dim);
    }

    // Built from the table rather than dressed in place. BULLWARK has three
    // abilities and MOTHELIA two, so a fixed pair of buttons would either
    // leave a dead square on the moth's card or cap the tank at two — and the
    // row is sized by how many there are, so a third button narrows the set
    // instead of overflowing the card.
    if (!_ui.spells) return;
    _ui.spells.innerHTML = '';
    const spells = a.spells || [];
    _ui.spells.dataset.count = String(spells.length);

    spells.forEach((spell) => {
      const btn = document.createElement('button');
      btn.className = 'avatar-spell';
      // The ability id lives ON the button, which is what _btnFor reads. A
      // cooldown arriving for 'mothmend' used to be matched positionally and
      // landed on the wrong square; an attribute cannot drift like that.
      btn.dataset.ability = spell.id;

      // Art when it exists, the name when it does not. Both forms keep the
      // same frame and the same cooldown layer, so an ability gaining art
      // later changes nothing about the layout.
      btn.classList.toggle('avatar-spell--icon', !!spell.art);
      if (spell.art) {
        const img = document.createElement('img');
        img.className = 'avatar-spell-art';
        img.src = spell.art;
        img.alt = spell.label;
        btn.appendChild(img);
      } else {
        const sp = document.createElement('span');
        sp.className = 'avatar-spell-name';
        sp.textContent = spell.label;
        btn.appendChild(sp);
      }

      const cd = document.createElement('span');
      cd.className = 'avatar-spell-cd';
      btn.appendChild(cd);

      btn.onclick = () => _ability(spell.id);
      _ui.spells.appendChild(btn);
    });
  }

  /// Charges, as pips rather than a number.
  ///
  /// Pips because the count is small and fixed — a player should be able to see
  /// "two left" without reading, the same way the tally works. Spent ones stay
  /// in place rather than disappearing, so the row does not shrink and move
  /// under a thumb that is already travelling toward a button.
  function _paintCharges() {
    if (!_ui || !_ui.pips) return;
    _ui.pips.innerHTML = '';
    for (let i = 0; i < _charges; i++) {
      const pip = document.createElement('i');
      _ui.pips.appendChild(pip);
    }
    _ui.pips.classList.toggle('is-last', _charges === 1);
  }

  /// Show or hide the entry button. Safe to call as often as you like.
  function refresh() {
    if (!_ui) return;
    const a = available();

    // Still flagged on <body> for anything else that wants to know, but the
    // overlay no longer depends on it — the scrim blocks the background by
    // covering it, which cannot be defeated by a stylesheet loading late.
    document.body.classList.toggle('avatar-driving', _out);

    if (_out) {
      _ui.hand.hidden = true;
      _ui.pad.hidden   = false;
      _paintCharges();
      _placeRunner();
      return;
    }

    _ui.pad.hidden = true;

    // The hand only exists once something has been earned. Three greyed cards
    // with nothing unlocked would be a permanent advertisement for a feature
    // most players never reach, and the tally beside their symbol is already
    // doing that job quietly.
    if (!a) { _ui.hand.hidden = true; return; }

    _ui.hand.hidden = false;
    const full = _slotUsed >= _slotCap;

    // ── The deal ─────────────────────────────────────────────────────────────
    // Once, on the frame the hand first becomes available.
    //
    // A MOMENT, not a mode. The temptation is to dim the screen for as long as
    // the hand is up, and that would be wrong twice over: the hand lives on the
    // pack screen from now until the player spends it, so a permanent dim would
    // bury the carousel they still need, and it would make a thing they can
    // ignore look like a thing they must answer. It would also read like the
    // driving overlay's scrim, which exists to BLOCK touches — the opposite of
    // what this needs to do.
    //
    // Dimming for a second and letting it come back says the one thing worth
    // saying: this just happened. After that the hand is furniture, and
    // furniture should not keep interrupting.
    if (!_dealt) {
      _dealt = true;
      _ui.hand.classList.add('is-dealing');
      if (_ui.dim) {
        _ui.dim.classList.add('is-on');
        setTimeout(() => _ui.dim.classList.remove('is-on'), 1500);
      }
      setTimeout(() => _ui.hand && _ui.hand.classList.remove('is-dealing'), 1400);
      try { if (typeof Sound !== 'undefined') Sound.play('star'); } catch (e) {}
    }

    _ui.hand.innerHTML = '';

    // ── Dealing order ────────────────────────────────────────────────────────
    // YOURS IS ALWAYS THE MIDDLE CARD, whichever stream it came from.
    //
    // This started as a fixed tank/medic/damage order, on the reasoning that a
    // card which moves position is one nobody learns. That was the wrong model
    // of what is being learned here: a player sees this hand once or twice in a
    // session, so there is no layout to memorise — what they need is to find
    // their own card instantly, and the centre of a fan is where the eye lands
    // before it reads anything.
    //
    // It also makes the composition say the right thing. Yours in the middle,
    // flanked by the two you did not take, is a statement about a choice with
    // alternatives either side of it. Yours off to one end is a list.
    //
    // The two a player has not earned are the point of showing a hand at all.
    // A single card arriving on its own says "you unlocked a thing"; three
    // cards with one of them lit says "there are three of these, and this is
    // the one you made" — the only moment the game ever tells anyone that the
    // other streams exist, and it does it without a menu or a word.
    const spec   = _spec();
    const others = HAND.filter(r => r !== spec);
    // Falls back to the declared order if the earned stream somehow is not one
    // of the three, rather than dealing a hand with a hole in it.
    const dealt  = HAND.includes(spec)
                 ? [others[0], spec, others[1]]
                 : HAND.slice();

    dealt.forEach((role, i) => {
      const av = AVATARS[role];
      if (!av) return;

      const mine = role === _spec() && av.ready;
      const card = document.createElement(mine ? 'button' : 'div');
      card.className = 'avatar-enter avatar-hand-card';
      card.dataset.slot = String(i);

      // Fanned from the centre, like a hand being held. Set per card rather
      // than in CSS so the angles stay correct if the set ever changes size.
      const mid  = (dealt.length - 1) / 2;
      const off  = i - mid;
      card.style.setProperty('--fan', `${off * HAND_SPREAD}deg`);
      card.style.setProperty('--slide', `${off * HAND_SLIDE}px`);
      // The earned card sits in FRONT of the others whatever its position.
      card.style.zIndex = mine ? 10 : 5 - Math.abs(off);
      // Dealt left to right, with YOURS last so it lands on top of the beat.
      card.style.setProperty('--deal', `${(mine ? dealt.length : i) * 0.12}s`);

      const t = av.theme;
      if (t) {
        card.style.setProperty('--av-edge', t.edge);
        card.style.setProperty('--av-glow', t.glow);
        card.style.setProperty('--av-ink',  t.ink);
        card.style.setProperty('--av-dim',  t.dim);
      }

      card.classList.toggle('is-mine',   mine);
      card.classList.toggle('is-locked', !mine);
      card.classList.toggle('is-full',   mine && full);
      card.classList.toggle('is-open',   mine && !full && !_busy);

      card.innerHTML =
        `<span class="avatar-enter-head"></span>` +
        `<span class="avatar-enter-stage">` +
          (av.emblem ? `<img class="avatar-enter-art" src="${av.emblem}" alt="">` : '') +
        `</span>` +
        `<span class="avatar-enter-label">${av.name || '???'}</span>` +
        `<span class="avatar-enter-foot">` +
          (mine ? `<span class="avatar-enter-slot">${_slotUsed}/${_slotCap}</span>`
                : `<span class="avatar-enter-slot">LOCKED</span>`) +
        `</span>`;

      // ── The symbol on the head of every card ─────────────────────────────
      // On YOUR card it is the mark you declared, drawn in your own colour —
      // the same one Unity flashes over your name tag.
      //
      // On the other two it is THAT ROLE'S symbol, greyed. Those keys are the
      // same strings Roles uses, so a locked card can show the mark of the
      // stream it belongs to without any mapping.
      //
      // That is the whole sentence the hand is here to say. A player sees the
      // symbol they chose lit on one card and two other symbols dark beside it,
      // and reads it without being told: there were three ways to play this,
      // you committed to one, and the other two were real. Blank heads on the
      // locked cards made them look like placeholder art for a feature that was
      // not finished, which is the opposite reading.
      const head = card.querySelector('.avatar-enter-head');
      try {
        if (head && typeof Roles !== 'undefined') {
          const ink = mine
            ? (typeof playerColor !== 'undefined' && playerColor ? playerColor : (t && t.edge))
            // Not grey. The locked symbol keeps a trace of its own stream's
            // colour, so the card is identifiably the TANK one rather than
            // merely switched off — the filter on the card dims it the rest of
            // the way.
            : (t && t.edge) || '#8899aa';

          head.appendChild(Roles.canvas(
            mine ? (typeof playerRole !== 'undefined' && playerRole ? playerRole : role)
                 : role,
            2, ink));
        }
      } catch (e) {}

      if (mine) {
        card.disabled = full || _busy;
        card.onclick  = enter;
      }

      _ui.hand.appendChild(card);
    });
  }

  // ── Session ──────────────────────────────────────────────────────────────

  function enter() {
    const a = available();
    if (_out || !a) return;
    _out = true;
    _chargesMax = 0;
    _role = _spec();
    _dressSpells(a);
    // The role rides along, so Unity knows which body to build without the
    // phone needing to know what the bodies are made of.
    send(`avatar_enter|${CLIENT_ID}|${_role}`);

    // Fire immediately AND start the loop. The first message should not wait a
    // frame for the stick to change, or the body stands still until touched.
    _lastSend = 0;
    _loop = setInterval(_tick, RATE);
    refresh();
    try { if (typeof Sound !== 'undefined') Sound.play('star'); } catch (e) {}
  }

  function exit() {
    if (!_out) return;
    _out = false;
    clearInterval(_loop);
    _loop = null;
    _x = 0; _y = 0;
    // One last centred reading, so the body stops even if the exit and the
    // stick release race each other.
    send(`avatar_input|${CLIENT_ID}|0|0`);
    send(`avatar_exit|${CLIENT_ID}`);
    refresh();
  }

  function _ability(which) {
    if (!_out) return;
    if (_cool[which] && Date.now() < _cool[which]) return;
    send(`avatar_ability|${CLIENT_ID}|${which}`);
    try { if (typeof Sound !== 'undefined') Sound.play('place'); } catch (e) {}
  }

  /// Unity owns the cooldown and tells us how long it is, rather than the phone
  /// keeping its own clock. A locally-timed button drifts out of step with the
  /// thing it is firing, and the first thing a player does with a cooldown is
  /// mash it — so the button that lies is the one they will find.
  function _startCooldown(which, seconds) {
    const btn = _btnFor(which);
    if (!btn) return;

    _cool[which] = Date.now() + seconds * 1000;
    btn.disabled = true;
    btn.classList.add('is-cooling');

    // Painted into its own element rather than over the button's text, so the
    // icon and the name stay put while the number counts down on top of them —
    // a button that swaps its label for a digit loses the thing the player was
    // aiming at.
    const cd = btn.querySelector('.avatar-spell-cd');

    const tick = () => {
      const left = _cool[which] - Date.now();
      if (left <= 0) {
        clearInterval(h);
        btn.disabled = false;
        btn.classList.remove('is-cooling');
        if (cd) { cd.textContent = ''; cd.style.setProperty('--sweep', '0deg'); }
        return;
      }
      if (cd) {
        cd.textContent = Math.ceil(left / 1000);
        // A radial sweep as well as the number: the digit says how long, the
        // sweep says how far through, and the second one reads without being
        // looked at directly.
        const frac = left / (seconds * 1000);
        cd.style.setProperty('--sweep', (frac * 360).toFixed(0) + 'deg');
      }
    };
    tick();
    const h = setInterval(tick, 100);
  }

  /// Change-only transmission with a keep-alive, matching the possession
  /// joystick — idle thumbs should not fill the socket, but Unity's watchdog
  /// needs to hear from us before it decides we have gone quiet.
  function _tick() {
    const now = Date.now();
    const moved = Math.abs(_x - _lastX) > DEAD || Math.abs(_y - _lastY) > DEAD;
    if (!moved && now - _lastSend < KEEPALIVE) return;

    _lastX = _x; _lastY = _y; _lastSend = now;
    send(`avatar_input|${CLIENT_ID}|${_x.toFixed(3)}|${_y.toFixed(3)}`);
  }

  /// Unity can push us out — the body died, or the round ended.
  function handle(msg) {
    if (typeof msg !== 'string') return false;

    // Somebody else has it. Only ONE body exists for the whole room, so this is
    // the normal answer rather than an error — the button says so and stays
    // available, because the holder will put it down.
    if (msg.startsWith('avatar_denied|')) {
      const p = msg.split('|');
      if (p[1] !== CLIENT_ID) return true;
      _out = false;
      clearInterval(_loop); _loop = null;
      _busy = true;
      refresh();
      setTimeout(() => { _busy = false; refresh(); }, 1600);
      return true;
    }

    // Room-wide occupancy. NOT filtered by CLIENT_ID — this one is for
    // everybody, and the people who most need it are the ones who do not have
    // the body.
    if (msg.startsWith('avatar_slot|')) {
      const p = msg.split('|');
      _slotUsed = parseInt(p[1], 10) || 0;
      _slotCap  = parseInt(p[2], 10) || 1;
      refresh();
      return true;
    }

    // Charges left on the body. Unity counts them, same as the cooldowns —
    // the phone never decides when an ability actually fired.
    if (msg.startsWith('avatar_charges|')) {
      const p = msg.split('|');
      if (p[1] !== CLIENT_ID) return true;
      _charges = parseInt(p[2], 10);
      // Unity sends the full load as well, because a re-entered turn starts
      // part-spent: inferring the maximum from the first report would make a
      // body resumed on two charges look brand new, and the runner would walk
      // the whole frame again for a turn that is nearly over.
      const max = parseInt(p[3], 10);
      if (max > 0) _chargesMax = max;
      else if (_chargesMax < _charges) _chargesMax = _charges;
      _paintCharges();
      _placeRunner();
      return true;
    }

    // Spent: the body is gone and the role goes back to the room.
    if (msg.startsWith('avatar_spent|')) {
      const p = msg.split('|');
      if (p[1] !== CLIENT_ID) return true;

      _out = false;
      clearInterval(_loop); _loop = null;
      _charges = 0;

      // The tally goes with it. They have to earn it again, and so does
      // everyone else — which is the whole reason the body is limited.
      try { if (typeof Spec !== 'undefined') Spec.release(); } catch (e) {}
      refresh();
      return true;
    }

    // Unity owns ability cooldowns and reports them.
    if (msg.startsWith('avatar_cooldown|')) {
      const p = msg.split('|');
      if (p[1] !== CLIENT_ID) return true;
      _startCooldown(p[2], parseFloat(p[3]) || 0);
      return true;
    }

    if (!msg.startsWith('avatar_ended|')) return false;
    const p = msg.split('|');
    if (p[1] !== CLIENT_ID) return true;
    if (_out) { _out = false; clearInterval(_loop); _loop = null; refresh(); }
    return true;
  }

  document.addEventListener('DOMContentLoaded', _build);

  return { refresh, handle, enter, exit, available, isOut: () => _out };
})();

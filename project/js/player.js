// player.js — lightweight, session-based player progression. Plain script, no
// modules. Load BEFORE main.js (it calls Player.observe / Player.gainXP).
//
// REPLACED. This used to be three attributes levelling on a hidden XP curve.
// Nobody noticed it in playtesting, and the reason was structural rather than
// presentational: every reward it paid out was a MULTIPLIER, and a 5% change is
// below what anyone can perceive. A gallery visitor who opens four packs never
// levelled once.
//
// It is now a single personal CHAIN. Placements extend it while they keep
// changing, and it lapses if you stop. The chain is loud, immediate and yours.
// What it earns — pooled Presence, which speeds up everyone's placement and
// possession — is still collective, so the fun is personal and the payoff is
// not. That split is deliberate; see PlayerMods.cs on why a private permanent
// upgrade path would argue against the piece.
//
// Legacy note. Doing things in the Unity world used to feed the attribute
// that action belonged to — there was no "spend points" screen at all. Each level
// grants a small modifier. All state is in-memory (wiped on refresh), consistent
// with stars + the collection.
//
//   The chain
//     Placements extend it. Repeating the same card drops it to one, so it
//     rewards varying what you play rather than sheer volume. It lapses after
//     STREAK.window seconds of nothing.
//     Every STREAK.perPresence steps grants a level of pooled Presence, which
//     is the ROOM's placement and possession speed. Earned individually,
//     spent collectively; see PlayerMods.cs in Unity.
//
// Exposes:
//   Player.hit(cardKey)           extend the chain (or drop it, on a repeat)
//   Player.observe(wsMessage)     watch the WS stream for "playing" signals
//   Player.handleMessage(msg)     consume Unity's room_mods broadcast
//   window.PlayerMods             { sporeBudgetMult, starGainMult, roomMoveMult }
//                                 — always present with safe defaults.
//
// Note roomMoveMult is MIRRORED, not computed here: Unity pools every phone's
// Presence and applies the result to placement and possession itself. The phone
// only displays it.

// Safe defaults the instant the script loads, so consumers can read PlayerMods
// before the module has fully initialised.
window.PlayerMods = { sporeBudgetMult: 1, starGainMult: 1, roomMoveMult: 1 };

const Player = (() => {

  // ── Tuning ──────────────────────────────────────────────────────────────────
  // PERKS REMOVED. There used to be a "choose a boon" modal every 4 total levels
  // offering SHEPHERD / BLOOM / TITHE — three private, permanent, individually
  // accumulated upgrades.
  //
  // Cut for two reasons. It contradicted the pooled model: Presence was moved to
  // a room-wide shared bonus precisely because private accumulation reproduces
  // the gacha progression this work critiques, and leaving three private perks
  // beside it had the progression system arguing both ways at once. And it was a
  // BLOCKING modal on the pack screen — an interruption at exactly the moment
  // players should be looking at the shared world, for an arc a walk-up gallery
  // audience will almost never complete.
  //
  // The attributes went the same way, for the same reason, one step further on.
  // Dexterity and Vigor only ever paid out multipliers nobody could feel, so
  // sporeBudgetMult and starGainMult are flat 1 now and the chain took their
  // place. Presence survives because it was already the pooled one.

  // Each attribute grows a vine that drops out of the name tag, swings out to
  // one side, and hangs down the gutter between the pack card and that side's
  // CARDS / TASKS tab. Nothing else lives in those two strips, so the vines can
  // run their full length without covering the card or the tabs.
  //
  //   side  which gutter the vine settles into
  //   drop  px below the tag before this vine's first node — the only way to
  //         keep two vines sharing a gutter from landing on top of each other,
  //         since a phone gutter is one node wide. Tune this and `side` first
  //         if the layout feels crowded.
  //   phase offsets the waver so vines don't wobble in lockstep
  //
  // `glyph` names an SVG shape rather than a character on purpose: the pixel font
  // renders most symbol codepoints as blanks or boxes (the same problem that hit
  // the Soul Tree's emoji requirements), so the icons are drawn as geometry.

  // ── Streak tuning ───────────────────────────────────────────────────────────
  // Placements chain while they keep CHANGING. Repeat the same card and the
  // chain drops to one, because a counter that rewards volume rewards holding
  // the button down, and that is the behaviour this is meant to replace.
  const STREAK = {
    // Seconds of inactivity before the chain lapses.
    //
    // 60, not the 14 this started at. 14 was picked from nothing and it was far
    // too short to survive the actual loop: opening a pack, the 3D animation,
    // the choice grid, the 400ms drop delay and then the placement modal is
    // comfortably 15 to 30 seconds per card. The chain was lapsing to zero
    // between every single placement, so every number read x1 and the whole
    // counter looked broken. Detouring through a Glitchling widens that gap,
    // which is why it showed up there first.
    //
    // A lapse should mean the player WALKED AWAY, not that they played normally.
    window:      60,
    perPresence:  5,   // chain steps per level of pooled Presence, and the
                       // step that fires a burst. One number, so the thing
                       // the player SEES and the thing the room GETS are
                       // the same event rather than two rhythms drifting.
    maxPresence: 12,   // ceiling, mirroring the old level cap
  };

  // ── The Glitchling's own chain ──────────────────────────────────────────────
  // Counted separately from the pack chain and never mixed with it.
  //
  // They measure opposite things. The pack chain rewards VARIETY — it drops if
  // you repeat a card — and pays into the room's pooled speed. This one is the
  // same card every time by definition, so a repeat rule would be nonsense, and
  // it pays into nothing. It is a tally of how far a player has gone toward
  // corruption, and the only honest reward for that is being shown the number.
  //
  // A longer window than the pack chain because a Glitchling appears at most
  // once per pack, so 14 seconds would lapse between two consecutive takes.
  const GLITCH = {
    window:     45,   // seconds before this chain lapses
    burstEvery:  3,   // steps between bursts
  };

  // Fixed, not the pack theme. Separating the counters is pointless if they
  // still wear the same colour — corruption looks like corruption regardless of
  // which pack it crawled out of.
  const GLITCH_COLOR = '#e02020';

  // ── Pack identity ───────────────────────────────────────────────────────────
  // The chain wears the colour of the pack being played, not a generic tier
  // ramp. A player cannot be told how the chain works, but they can notice that
  // it turns pink when they are on critters and green on fungi, and that noticing
  // is the whole lesson: the chain is about WHAT you are placing.
  //
  // Colours are lifted from .star-counter-value's per-theme rules in style.css
  // rather than picked fresh, so the chain and the star counter agree about what
  // colour a pack is. If those change, change these.
  //
  // `motif` names an SVG shape, never a character. The pixel font renders most
  // symbol codepoints as blanks or boxes — the same trap that forced the old
  // stat icons to be drawn as geometry.
  const THEMES = {
    'nature-active':  { color: '#81d4fa', motif: 'flower' },
    'critter-active': { color: '#f0b8d0', motif: 'blob'   },
    'fungi-active':   { color: '#78c660', motif: 'cap'    },
    'flesh-active':   { color: '#e85c1a', motif: 'shard'  },
    'scourge-active': { color: '#8bc820', motif: 'bolt'   },
    'ritual-active':  { color: '#b060e8', motif: 'eye'    },
  };
  const THEME_FALLBACK = { color: '#e8e0c8', motif: 'flower' };

  function _theme() {
    const b = document.body;
    for (const k in THEMES) if (b.classList.contains(k)) return THEMES[k];
    return THEME_FALLBACK;
  }

  function _streakColor() { return _theme().color; }

  // Motifs pulled from the card faces themselves. The flora card already has
  // flowers drifting around it, so a chain on that pack throwing the same flower
  // reads as the card doing it rather than as a separate UI layer.
  function _motifSvg(kind, color) {
    const c = color;
    switch (kind) {
      case 'flower':
        return `<svg viewBox="0 0 20 20" width="100%" height="100%">` +
          [0, 72, 144, 216, 288].map(a =>
            `<ellipse cx="10" cy="4.6" rx="2.5" ry="4.2" fill="${c}"` +
            ` transform="rotate(${a} 10 10)"/>`).join('') +
          `<circle cx="10" cy="10" r="2.4" fill="#fff7d0"/></svg>`;
      case 'blob':
        return `<svg viewBox="0 0 20 20" width="100%" height="100%">` +
          `<path d="M10 3c4 0 7 3 7 7s-3 7-7 7-7-3-7-7 3-7 7-7z" fill="${c}"/>` +
          `<circle cx="7.4" cy="8.6" r="1.2" fill="#2a1520"/>` +
          `<circle cx="12.6" cy="8.6" r="1.2" fill="#2a1520"/></svg>`;
      case 'cap':
        return `<svg viewBox="0 0 20 20" width="100%" height="100%">` +
          `<path d="M2 11c0-5 3.6-8 8-8s8 3 8 8z" fill="${c}"/>` +
          `<rect x="8" y="11" width="4" height="6" rx="1.6" fill="#f0e6c8"/></svg>`;
      case 'shard':
        return `<svg viewBox="0 0 20 20" width="100%" height="100%">` +
          `<path d="M10 1 15 9 11 19 8 10 5 7z" fill="${c}"/></svg>`;
      case 'bolt':
        return `<svg viewBox="0 0 20 20" width="100%" height="100%">` +
          `<path d="M12 1 4 11h5l-2 8 9-11h-5z" fill="${c}"/></svg>`;
      case 'eye':
        return `<svg viewBox="0 0 20 20" width="100%" height="100%">` +
          `<path d="M1 10s3.6-5.5 9-5.5S19 10 19 10s-3.6 5.5-9 5.5S1 10 1 10z" fill="${c}"/>` +
          `<circle cx="10" cy="10" r="2.6" fill="#150a20"/></svg>`;
      default:
        return `<svg viewBox="0 0 20 20"><circle cx="10" cy="10" r="7" fill="${c}"/></svg>`;
    }
  }


  // ── State (session only) ──────────────────────────────────────────────────────
  // `level` is the live chain length. The vine renderer reads it, so the vine
  // grows and collapses with the streak for free.
  const _attr = {
    combo: { xp: 0, level: 0 },
  };
  let   _built        = false;

  // Streak state. _last is the card key that extended the chain — repeating it
  // is what breaks it.
  let   _last         = null;
  let   _best         = 0;
  let   _lapseTimer   = null;
  let   _presenceLv   = 0;   // pooled Presence earned from milestones

  // The Glitchling chain. Deliberately its own everything — sharing so much as
  // the lapse timer would couple two things that are supposed to be read as
  // unrelated.
  let   _gLevel       = 0;
  let   _gBest        = 0;
  let   _gTimer       = null;

  function _totalLevel() { return _attr.combo.level; }

  // ── Modifiers ─────────────────────────────────────────────────────────────────
  // The room's pooled Presence, mirrored back from Unity. Display only — Unity is
  // authoritative and applies the real multiplier itself.
  let _roomMoveMult   = 1;
  let _roomPresence   = 0;
  let _roomPlayers    = 0;

  function _recompute() {
    // Dexterity and Vigor are gone, so their multipliers are flat. Left in place
    // rather than deleted because other modules read this object, and a missing
    // key would read as undefined and poison the arithmetic downstream.
    window.PlayerMods = {
      sporeBudgetMult: 1,
      starGainMult:    1,
      // Mirrored, not computed here — see above.
      roomMoveMult:    _roomMoveMult,
    };
    _pushPresence();
  }

  // Report this phone's Presence level so Unity can pool it with everyone else's.
  //
  // We send the LEVEL, not a multiplier: the pooling maths has to live in one
  // place or two clients on different app versions would disagree about what the
  // room bonus is. Unity owns it and broadcasts the result back.
  let _sentPresence = -1;
  function _pushPresence() {
    const lv = _presenceLv;
    if (lv === _sentPresence) return;          // only on an actual change
    _sentPresence = lv;
    if (typeof CLIENT_ID !== 'undefined' && typeof send === 'function') {
      send(`player_presence|${CLIENT_ID}|${lv}`);
    }
  }

  // Unity broadcast: room_mods|mult|totalPresence|contributors
  function handleMessage(msg) {
    // buff_granted|clientId|big|seconds — Unity confirming a shop purchase and
    // telling us how long it actually lasts. The chip counts down from that
    // rather than from the moment of purchase, so the bar agrees with the buff.
    if (typeof msg === 'string' && msg.startsWith('buff_granted|')) {
      const b = msg.split('|');
      if (b[1] === CLIENT_ID && b[2] === 'big') {
        _bigUntil = Date.now() + (parseFloat(b[3]) || 0) * 1000;
        _renderBuffRail();
      }
      return true;
    }

    if (typeof msg !== 'string' || !msg.startsWith('room_mods|')) return false;
    const p = msg.split('|');
    _roomMoveMult = parseFloat(p[1]) || 1;
    _roomPresence = parseInt(p[2]) || 0;
    _roomPlayers  = parseInt(p[3]) || 0;
    if (window.PlayerMods) window.PlayerMods.roomMoveMult = _roomMoveMult;
    _render();
    _renderBuffRail();
    return true;
  }

  // ── Collective buff rail ────────────────────────────────────────────────────
  // Mirrors the Unity name-tag badge. The buff is pooled and otherwise invisible
  // — placements are quietly faster and nothing says so — and a collective bonus
  // nobody can see is indistinguishable from no bonus.

  let _lastBuffMult = 1;
  let _bigUntil     = 0;     // epoch ms the BIG BUFF expires
  let _buffTicker   = null;

  // Chips stack in the rail, so a player carrying both the room's speed bonus
  // and their own purchase sees two. They are deliberately different kinds of
  // thing — one is pooled and permanent, one is bought and expiring — and the
  // countdown is what tells them apart at a glance.
  function _renderBuffRail() {
    const rail = document.getElementById('buffRail');
    if (!rail) return;

    const chips = [];

    if (_roomMoveMult > 1.001) {
      const pct  = Math.round((_roomMoveMult - 1) * 100);
      const bump = _roomMoveMult > _lastBuffMult + 0.0001;
      chips.push(
        `<div class="buff-chip${bump ? ' buff-chip--bump' : ''}" title="Room speed">` +
          `<span class="buff-chip-sym">&gt;&gt;</span>` +
          `<span class="buff-chip-val">+${pct}%</span>` +
        `</div>`);
      _lastBuffMult = _roomMoveMult;
    } else {
      _lastBuffMult = 1;
    }

    const bigLeft = Math.max(0, Math.ceil((_bigUntil - Date.now()) / 1000));
    if (bigLeft > 0) {
      chips.push(
        `<div class="buff-chip buff-chip--big" title="Bigger placements">` +
          `<span class="buff-chip-sym">▲</span>` +
          `<span class="buff-chip-val">${bigLeft}s</span>` +
        `</div>`);
    }

    rail.innerHTML = chips.join('');
    rail.classList.toggle('buff-rail--open', chips.length > 0);

    // Only tick while something is actually counting down. A permanent interval
    // redrawing an empty rail forever is the kind of thing that quietly costs a
    // phone battery over a long session.
    if (bigLeft > 0 && _buffTicker === null) {
      _buffTicker = setInterval(_renderBuffRail, 1000);
    } else if (bigLeft <= 0 && _buffTicker !== null) {
      clearInterval(_buffTicker);
      _buffTicker = null;
    }
  }

  // ── Streak ──────────────────────────────────────────────────────────────────
  // One placement extends the chain, unless it repeats the last one. Called from
  // the placement path in main.js with something that identifies the card.
  //
  // Deliberately NOT called from the paint loop or the possession tick. Those
  // fire continuously, and a chain that climbs while you hold still is a chain
  // that measures presence rather than play.
  // Set Player.debugChain = true in the console to see why the number did what
  // it did. Cheaper than guessing at a counter that only misbehaves in a real
  // session on a real phone.
  let _debugChain = false;

  function hit(key) {
    const k = String(key == null ? '' : key);

    if (_debugChain) {
      console.log('[chain] hit', JSON.stringify(k),
                  '| was x' + _attr.combo.level,
                  '| last', JSON.stringify(_last),
                  '|', (_last !== null && k !== '' && k === _last) ? 'REPEAT' : 'extend');
    }

    if (_last !== null && k !== '' && k === _last) {
      // Same card again. It HOLDS — the chain neither grows nor collapses.
      //
      // This used to drop to 1, and that was wrong for how the game actually
      // deals. A pack offers a handful of cards, so wanting the same one twice
      // is ordinary play, not spam. Worse, a detour through a Glitchling sits
      // between two placements and hides the repetition from the player, so the
      // collapse arrived with no visible cause and read as the counter being
      // broken.
      //
      // Holding still does the anti-spam job it was there for. Repeating one
      // card gets you nothing, so volume is not a strategy — but it also does
      // not take away what you already earned for varying.
      _render();
      _pop(_attr.combo.level, 'held');
      if (typeof Sound !== 'undefined') Sound.play('deny');
    } else {
      _attr.combo.level++;
      if (_attr.combo.level > _best) _best = _attr.combo.level;
      _award();
      _render();
      _pop(_attr.combo.level, false);
      if (typeof Sound !== 'undefined') Sound.play('star');
      // A milestone is worth a bigger reaction than a step, and the phone
      // buzzing is the one channel that reaches a player looking at the wall
      // instead of their hand.
      if (_attr.combo.level % STREAK.perPresence === 0 && navigator.vibrate) {
        navigator.vibrate([25, 40, 55]);
      }
    }

    _last = k;
    _arm();
  }

  // ── The Glitchling chain ────────────────────────────────────────────────────
  // Taking a Glitchling. No repeat rule, because it is always the same card, and
  // no payout, because there is nothing good about this number going up. It only
  // counts, in the boss's own typography, and lapses if the player stops.
  //
  // Does NOT touch the pack chain. Choosing corruption is not a placement in the
  // sense the pack chain measures, and breaking a clean chain for it would make
  // the two counters argue about the same event.
  function hitGlitch() {
    _gLevel++;
    if (_gLevel > _gBest) _gBest = _gLevel;

    _popGlitch(_gLevel);
    if (typeof Sound !== 'undefined') Sound.play('deny');

    if (_gTimer !== null) clearTimeout(_gTimer);
    _gTimer = setTimeout(() => { _gTimer = null; _gLevel = 0; _render(); },
                         GLITCH.window * 1000);

    // Forget which card the pack chain last saw.
    //
    // `_last` means "the card that extended the chain, with NOTHING in between".
    // A Glitchling is something in between. Leaving it set meant the pack chain
    // remembered a card from before the detour, so coming back and picking that
    // card again was judged a repeat — the counter appeared to revert for no
    // reason the player could see. This is the tangle the two-counter split
    // introduced, and it is the whole of it.
    _last = null;

    // Re-arm the PACK chain without extending it.
    //
    // The two chains stay separate, but a player taking Glitchlings is still
    // playing, and the pack chain's lapse timer had no way to know that. Since
    // a Glitchling is offered on almost every pack, taking two or three in a row
    // silently ran the pack chain out while the player was busy — which reads as
    // the combo system breaking the moment you touch a Glitchling.
    //
    // Only when there is a chain to keep. Arming from zero would start a timer
    // counting down on nothing.
    if (_attr.combo.level > 0) _arm();

    _render();
  }

  // Pooled Presence is the payoff, so the fun is personal and the reward is not.
  function _award() {
    const want = Math.min(STREAK.maxPresence,
                          Math.floor(_attr.combo.level / STREAK.perPresence));
    if (want <= _presenceLv) return;
    _presenceLv = want;
    _recompute();
  }

  function _arm() {
    if (_lapseTimer !== null) clearTimeout(_lapseTimer);
    // A lapse is silent on purpose. Nothing is on screen by then, so throwing a
    // number to announce that a number went away would be the only time the
    // chain interrupts a player who has already stopped playing.
    _lapseTimer = setTimeout(() => {
      _lapseTimer = null;
      if (_debugChain) console.log('[chain] LAPSED from x' + _attr.combo.level);
      _break(0);
      _render();
    }, STREAK.window * 1000);
  }

  // The chain lapses but the Presence it earned does NOT. Taking the room's
  // speed away because one player stopped placing would make everyone else pay
  // for it, which is the opposite of how the pool is supposed to work.
  function _break(to) {
    _attr.combo.level = to;
    _last = to > 0 ? _last : null;
    if (_lapseTimer !== null && to === 0) { clearTimeout(_lapseTimer); _lapseTimer = null; }
  }

  // Kept as a no-op so any caller still passing the old attribute names is inert
  // rather than throwing. Remove once nothing references it.
  function gainXP() {}

  // ── Observe the WS stream for "playing in Unity" signals ──────────────────────
  // Vigor accrues for every possession tick (any creature) addressed to us — a
  // clean per-second heartbeat that means the player is actively inhabiting.
  function observe(data) {
    // Vigor is gone and possession ticks deliberately do not extend a streak.
    // Left as a stub because main.js calls it on every message.
  }

  // ── UI ──────────────────────────────────────────────────────────────────────────
  function _build() {
    if (_built) return;
    _built = true;

    const style = document.createElement('style');
    style.textContent = `


      /* ── The chain pop. One per step, thrown at a random point loosely ringing
         the card, then gone.

         Nothing persistent. A counter that sits on screen becomes furniture
         within about a minute and stops being read at all; one that appears,
         demands a glance and leaves keeps costing the player attention, which is
         the only currency this piece actually deals in.

         pf-pixelscript at 44px is the star counter's face, one size up. Reusing
         it means the chain reads as the same KIND of thing as a reward rather
         than as a new system to learn.

         --pl-tint  tier colour   --pl-rot  a small static tilt

         It does not travel. It arrives, holds where it landed long enough to be
         read, and goes. Drifting it away from the spot it was thrown at only
         pulls the eye off the card, which is the thing the player came to look
         at.

         position:fixed and appended to #screen-pack, so it inherits the screen's
         show/hide but is positioned against the viewport, which is the frame the
         card's bounding rect is measured in. ── */
      .pl-pop {
        position: fixed;
        z-index: 6;
        pointer-events: none;
        font-family: 'pf-pixelscript', cursive;
        font-size: 44px; line-height: 1;
        letter-spacing: 0.04em;
        font-variant-numeric: tabular-nums;
        color: var(--pl-tint, #e8e0c8);
        text-shadow:
          0 0 10px var(--pl-tint, #e8e0c8),
          0 0 22px rgba(0, 0, 0, 0.55),
          2px 2px 0 rgba(0, 0, 0, 0.8);
        will-change: transform, opacity;
        /* Visible, not hidden. When the sheet turns past edge-on the number
           shows mirrored, which is what a real page does and what sells the
           turn. Hiding the back face would make it blink out mid-flip. */
        backface-visibility: visible;
        animation: pl-pop 2.6s linear forwards;
      }

      /* One animation for the whole life rather than a pop followed by a fade.
         Two chained animations meant the handoff frame could land anywhere and
         the number visibly hitched at the join.

         Punch in, hold, go. Most of the duration is the hold, because that is
         the only part the player actually reads.

         There was a paper-flutter here — perspective, a rotateY that turned the
         glyph edge-on, a decaying sway. It was the better animation in
         isolation and the worse one in place: a number drifting down the screen
         drags the eye off the card, and the card is what the player came to
         look at. It now goes where it stood. */
      @keyframes pl-pop {
        0% {
          opacity: 0;
          animation-timing-function: cubic-bezier(0.16, 1.5, 0.3, 1);
          transform: translate(-50%, -50%) scale(0.3) rotate(var(--pl-rot, 0deg));
        }
        9% {
          opacity: 1;
          transform: translate(-50%, -50%) scale(1.34) rotate(var(--pl-rot, 0deg));
        }
        /* Settled, and then held here for most of the animation. This is the
           frame the player actually reads the number on, so it is the one that
           gets the time. */
        17% {
          animation-timing-function: linear;
          transform: translate(-50%, -50%) scale(1) rotate(var(--pl-rot, 0deg));
        }
        70% {
          opacity: 1;
          transform: translate(-50%, -50%) scale(1) rotate(var(--pl-rot, 0deg));
        }
        /* Goes where it stood. No drift, no fall — the number belongs to the
           moment it was thrown, and moving it away from that spot only pulls the
           eye off the card. */
        100% {
          opacity: 0;
          transform: translate(-50%, -50%) scale(1.16) rotate(var(--pl-rot, 0deg));
        }
      }

      /* ── Milestone spark. One motif, thrown outward and left to drift. ── */
      .pl-spark {
        position: fixed;
        z-index: 6;
        pointer-events: none;
        opacity: 0;
        will-change: transform, opacity;
        filter: drop-shadow(0 0 5px currentColor);
        animation: pl-spark 2s cubic-bezier(0.1, 0.72, 0.2, 1) forwards;
      }
      @keyframes pl-spark {
        0%   { opacity: 0;
               transform: translate(-50%, -50%) scale(0.3) rotate(0deg); }
        10%  { opacity: 1;
               transform: translate(calc(-50% + var(--sx) * 0.3),
                                    calc(-50% + var(--sy) * 0.3))
                          scale(1.12) rotate(calc(var(--sr) * 0.24)); }
        /* Nearly all of the travel is done by here; the rest of the animation is
           the motif hanging in the air and slowly going. Petals settle, they do
           not vanish at the end of their arc. */
        42%  { opacity: 0.95;
               transform: translate(calc(-50% + var(--sx) * 0.82),
                                    calc(-50% + var(--sy) * 0.82))
                          scale(1) rotate(calc(var(--sr) * 0.68)); }
        100% { opacity: 0;
               transform: translate(calc(-50% + var(--sx)), calc(-50% + var(--sy)))
                          scale(0.62) rotate(var(--sr)); }
      }

      /* A milestone number arrives harder and lingers, so the burst has
         something at its centre for the eye to come back to. */
      .pl-pop.pl-pop--milestone {
        animation-duration: 3.4s;
        text-shadow:
          0 0 16px var(--pl-tint, #e8e0c8),
          0 0 34px var(--pl-tint, #e8e0c8),
          2px 2px 0 rgba(0, 0, 0, 0.85);
      }

      /* The Glitchling's variant. No entrance animation at all — the character
         resolve IS the entrance, and a scale-up on top of it just blurred the
         one thing worth watching. It holds still and jitters instead.

         font-variant-numeric is dropped here: tabular figures line the digits up
         neatly, and neat is the opposite of what junk should look like. */
      .pl-pop.pl-pop--glitch {
        animation: none;
        opacity: 1;
        font-variant-numeric: normal;
        transform: translate(calc(-50% + var(--pl-jx, 0px)), calc(-50% + var(--pl-jy, 0px)));
        text-shadow:
          0 0 10px var(--pl-tint, #e8e0c8),
          2px 0 0 rgba(255, 40, 40, 0.55),
         -2px 0 0 rgba(0, 220, 255, 0.45),
          2px 2px 0 rgba(0, 0, 0, 0.8);
      }

      /* A repeat that did not count. Same fall, drained of colour and glow, and
         over quickly. It has to be visible — the player pressed something and
         deserves an answer — without looking like an award or an error. The
         absence of the burst and the absence of colour ARE the message. */
      .pl-pop.pl-pop--held {
        animation-duration: 1.25s;
        font-weight: 400;
        text-shadow: 2px 2px 0 rgba(0, 0, 0, 0.75);
      }

      /* ── A broken chain does not get the same throw. ──

         The award arc is smooth, rises, and resolves. Reusing it in red said
         "here is a smaller reward", which is the opposite of the message.

         This one is QUANTISED. steps(1, end) means every keyframe holds its
         value and then snaps to the next with nothing in between, so the number
         judders rather than travels. That is the same trick the boss assembly
         and the spawn stretch use in Unity, and it is the project's existing
         vocabulary for something going wrong.

         It also falls instead of rising, flickers out and back twice, and ends
         abruptly at 0.62s rather than settling over one and a half seconds. A
         failure should be over before the player has finished registering it —
         the flinch IS the feedback. */
      .pl-pop.pl-pop--break {
        animation: pl-pop-break 0.62s steps(1, end) forwards;
      }
      @keyframes pl-pop-break {
        /* Arrives already too big and skewed, as if it were knocked sideways
           rather than thrown. */
        0%   { opacity: 0; transform: translate(-50%, -50%) scale(1.7) skewX(16deg); }
        7%   { opacity: 1; transform: translate(calc(-50% - 15px), -50%) scale(1.2) skewX(-11deg);
               text-shadow: 5px 0 0 rgba(255,40,40,0.9), -5px 0 0 rgba(0,220,255,0.75); }
        15%  { opacity: 1; transform: translate(calc(-50% + 13px), calc(-50% + 3px)) scale(1.02) skewX(9deg);
               text-shadow: -6px 0 0 rgba(255,40,40,0.9), 6px 0 0 rgba(0,220,255,0.75); }
        /* Dropped frames. The gap is the point — a flicker reads as a fault in
           a way that a fade never does. */
        23%  { opacity: 0; }
        30%  { opacity: 1; transform: translate(calc(-50% - 6px), calc(-50% + 7px)) scale(0.97) skewX(-5deg);
               text-shadow: 3px 0 0 rgba(255,40,40,0.85), -3px 0 0 rgba(0,220,255,0.6); }
        44%  { opacity: 1; transform: translate(calc(-50% + 4px), calc(-50% + 12px)) scale(0.94) skewX(3deg); }
        52%  { opacity: 0; }
        60%  { opacity: 0.9; transform: translate(-50%, calc(-50% + 18px)) scale(0.9) skewX(0deg);
               text-shadow: 2px 2px 0 rgba(0,0,0,0.8); }
        /* Gone on a frame boundary, not faded out. */
        100% { opacity: 0; transform: translate(-50%, calc(-50% + 24px)) scale(0.88); }
      }


        margin-top: 14px; text-align: center; font-size: 9px; letter-spacing:

      
    `;
    document.head.appendChild(style);

    // No persistent counter element. Each step throws its own and takes it away
    // again; see .pl-pop.

    _render();
  }

  // Nothing persistent is drawn any more — every number spawns, plays and
  // removes itself. Kept as a no-op so the call sites read the same and a future
  // persistent element has somewhere to go.
  function _render() {}

  // Throw one number at the screen and forget about it. The ordinary language:
  // a clean overshoot that rises and resolves. See _ringPoint for where it goes,
  // _popGlitch for what a Glitchling gets instead.
  // mode: falsy for an ordinary step, 'held' for a repeat that did not count.
  // The break style is no longer reachable from hit(); it is kept because the
  // keyframes are still the right answer if a hard failure is ever needed again.
  function _pop(n, mode) {
    if (mode !== 'held' && mode !== 'break') _sendCombo(n, _streakColor(), 'pack');
    if (!LOCAL_POPS) return;
    if (!_built) _build();
    // Deferred a frame. dropCard calls this BEFORE resetToPackScreen(), so at
    // this instant the pack screen can still be hidden — and a hidden element
    // measures 0x0, which sent _ringPoint down its fallback path and dropped
    // every number in the middle of the viewport instead of around the card.
    // Waiting one frame lets the screen switch land, and reading the rect inside
    // the callback forces the fresh layout we need.
    requestAnimationFrame(() => _popNow(n, mode));
  }

  function _popNow(n, mode) {
    const broken = mode === 'break';
    const held   = mode === 'held';
    const host = document.getElementById('screen-pack') || document.body;
    const { x, y } = _ringPoint();

    // A held repeat is never a milestone. The number did not change, so
    // celebrating it would say the opposite of what just happened.
    const milestone = !broken && !held && n > 0 && n % STREAK.perPresence === 0;

    const el = document.createElement('div');
    el.className = 'pl-pop'
      + (broken ? ' pl-pop--break' : '')
      + (held ? ' pl-pop--held' : '')
      + (milestone ? ' pl-pop--milestone' : '');
    el.textContent = '\u00d7' + n;
    el.style.left = x + 'px';
    el.style.top  = y + 'px';
    el.style.setProperty('--pl-tint',
      broken ? '#c8402e' : held ? 'rgba(232,224,200,0.55)' : _streakColor());
    // A static tilt, set once. The number does not travel, so this is the only
    // thing keeping two pops in the same place from looking stamped.
    el.style.setProperty('--pl-rot', (broken ? _rand(-18, 18) : _rand(-7, 7)).toFixed(1) + 'deg');

    // Bigger numbers arrive bigger. Capped, because past about 1.5 the glyph
    // starts overhanging the clamp above and gets cut by the viewport edge.
    el.style.fontSize = (44 * Math.min(1.5, 1 + n * 0.035)).toFixed(0) + 'px';

    // Removed by the animation ending rather than a timer, so a backgrounded tab
    // that never runs the animation does not silently accumulate elements.
    el.addEventListener('animationend', () => el.remove());
    host.appendChild(el);

    // Centred on the number, so the burst and the count read as one event.
    if (milestone) _burst(x, y);
  }

  function _rand(a, b) { return a + Math.random() * (b - a); }

  // ── Where the chain is SHOWN ────────────────────────────────────────────────
  // On the projection, not here. The number, the burst and the buzz all fired at
  // the moment of placement and pulled every head DOWN at exactly the second the
  // object appeared on the wall. A piece about a room watching one world cannot
  // put its best feedback on two dozen private screens.
  //
  // The phone still COUNTS the chain, because the rules are per-player. It just
  // does not draw it. Unity throws the number over the object that earned it,
  // with the player's name under it — see ComboPop.cs.
  //
  // Set true to bring the on-phone pops back for debugging.
  const LOCAL_POPS = false;

  function _sendCombo(n, colorHex, kind) {
    if (typeof CLIENT_ID === 'undefined' || typeof send !== 'function') return;
    // Colour travels with the message so the wall and the handset cannot drift
    // apart. Unity holding its own copy of this palette would be a second source
    // of truth for something that already changes per pack.
    send(`combo|${CLIENT_ID}|${n}|${String(colorHex).replace('#', '')}|${kind}`);
  }


  // ── Milestone burst ─────────────────────────────────────────────────────────
  // Thrown at every STREAK.perPresence steps, in the pack's own motif.
  //
  // Not StarFX.burst: that one flies stars into the star counter and is built
  // around having a destination. This has nowhere to go — it is an exclamation,
  // not a transfer — so the particles just leave and stop existing.
  // motif/color override the pack theme, for the Glitchling chain.
  function _burst(x, y, motif, color) {
    const host = document.getElementById('screen-pack') || document.body;
    const base = _theme();
    const th   = { motif: motif || base.motif, color: color || base.color };
    const n    = 12;

    for (let i = 0; i < n; i++) {
      const el = document.createElement('div');
      el.className = 'pl-spark';
      el.innerHTML = _motifSvg(th.motif, th.color);

      // Evenly spaced around the circle with a little jitter, rather than fully
      // random angles. Pure randomness clumps, and a clumped burst reads as a
      // few stray particles instead of one event.
      const ang  = (i / n) * Math.PI * 2 + _rand(-0.26, 0.26);
      const dist = _rand(46, 104);
      const size = _rand(11, 21);

      // currentColor is what the drop-shadow in .pl-spark reads. Without this it
      // inherits the screen's text colour and every pack glows the same white.
      el.style.color  = th.color;
      el.style.left   = x + 'px';
      el.style.top    = y + 'px';
      el.style.width  = size + 'px';
      el.style.height = size + 'px';
      el.style.setProperty('--sx', (Math.cos(ang) * dist).toFixed(1) + 'px');
      // Biased upward, so the burst drifts rather than falling. Gravity would
      // make it debris; drift makes it petals.
      el.style.setProperty('--sy', (Math.sin(ang) * dist - _rand(10, 30)).toFixed(1) + 'px');
      el.style.setProperty('--sr', _rand(-220, 220).toFixed(0) + 'deg');
      el.style.animationDelay = (i * 8) + 'ms';

      el.addEventListener('animationend', () => el.remove());
      host.appendChild(el);
    }
  }

  // ── The Glitchling's answer ─────────────────────────────────────────────────
  // A port of BossTitleCard's reveal from Unity: the number does not appear, it
  // RESOLVES, one character at a time out of junk and in randomised order, then
  // comes apart the same way.
  //
  // Why this card gets its own language. Taking the Glitchling is the moment a
  // player chooses corruption, and until now the phone answered it with the same
  // pop as a wildflower. Giving it the boss's own typography is the cheapest way
  // to say that the two are the same thing at different scales — and the player
  // meets the effect here, on a common card, long before the boss uses it.
  //
  // Zero-padded to ×0N so there are three glyphs to scramble. A bare ×3 resolves
  // in two characters, which is over before it registers as an effect at all.
  const _JUNK = '!@#$%&*<>/\\|=+-_?§±░▒▓■□◊0123456789';

  function _popGlitch(n) {
    _sendCombo(n, GLITCH_COLOR, 'glitch');
    if (!LOCAL_POPS) return;
    if (!_built) _build();
    requestAnimationFrame(() => _popGlitchNow(n));   // see _pop
  }

  function _popGlitchNow(n) {
    const host = document.getElementById('screen-pack') || document.body;
    const at   = _ringPoint();

    const text = '×' + String(n).padStart(2, '0');
    const el   = document.createElement('div');
    el.className = 'pl-pop pl-pop--glitch';
    el.style.left = at.x + 'px';
    el.style.top  = at.y + 'px';
    el.style.setProperty('--pl-tint', GLITCH_COLOR);
    el.textContent = text;
    host.appendChild(el);

    // Shards in the corruption colour, not the pack's motif. This burst belongs
    // to the other chain and has to look like it does.
    if (n % GLITCH.burstEvery === 0) _burst(at.x, at.y, 'shard', GLITCH_COLOR);

    // Resolve order, shuffled. The '×' is deliberately in the pool rather than
    // fixed: in Unity the brackets resolve first because they frame the name, but
    // three characters is too few to have any of them arrive for free.
    const order = text.split('').map((_, i) => i);
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = order[i]; order[i] = order[j]; order[j] = t;
    }

    const RESOLVE = 520, HOLD = 1250, DISSOLVE = 620, TICK = 55;
    const shown = new Array(text.length).fill(false);
    const t0 = performance.now();
    let raf = 0, lastTick = 0;

    function frame(now) {
      const t = now - t0;

      // Junk is re-rolled on a fixed interval rather than every frame. At 60fps
      // per-frame noise strobes; the same lesson the Unity assembly learned.
      if (now - lastTick >= TICK) {
        lastTick = now;

        if (t <= RESOLVE) {
          const want = Math.floor(order.length * (t / RESOLVE));
          for (let i = 0; i < order.length; i++) shown[order[i]] = i < want;
        } else if (t <= RESOLVE + HOLD) {
          shown.fill(true);
        } else {
          const k = Math.min(1, (t - RESOLVE - HOLD) / DISSOLVE);
          const gone = Math.floor(order.length * k);
          for (let i = 0; i < order.length; i++) shown[order[i]] = i >= gone;
        }

        el.textContent = text
          .split('')
          .map((c, i) => (shown[i] ? c : _JUNK[Math.floor(Math.random() * _JUNK.length)]))
          .join('');

        // Jitter, held between ticks for the same reason the junk is.
        el.style.setProperty('--pl-jx', _rand(-3, 3).toFixed(1) + 'px');
        el.style.setProperty('--pl-jy', _rand(-3, 3).toFixed(1) + 'px');
      }

      if (t >= RESOLVE + HOLD + DISSOLVE) { el.remove(); return; }
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
  }

  // Where a pop lands. Shared by both, so the two languages occupy the same
  // space and only differ in how they behave once they are there.
  //
  // A loose ring around the card, not anywhere in the viewport. Fully random
  // placement puts numbers in corners nobody is looking at; centred placement
  // covers the card art the player is trying to see. A ring stays inside the
  // eye's existing focus without landing on the thing that focus is for.
  function _ringPoint() {
    // The card if we can find it, the viewport centre if we cannot — the stage
    // has zero size before the first pack is dealt.
    const stage = document.getElementById('packCarouselStage');
    const r = stage ? stage.getBoundingClientRect() : null;
    const cx = r && r.width  ? r.left + r.width  / 2 : window.innerWidth  / 2;
    const cy = r && r.height ? r.top  + r.height / 2 : window.innerHeight / 2;
    const rx = r && r.width  ? r.width  / 2 : window.innerWidth  * 0.32;
    const ry = r && r.height ? r.height / 2 : window.innerHeight * 0.28;

    const ang  = Math.random() * Math.PI * 2;
    const band = 0.72 + Math.random() * 0.45;

    // Clamped so a number never lands half off the screen, which on a narrow
    // phone is otherwise the common case rather than the edge case.
    //
    // The bottom reserve is much deeper than the top one because the number now
    // FALLS. Spawning at 46px from the bottom used to be fine when it drifted
    // upward; with up to 175px of descent it would leave the screen mid-flutter
    // and the whole effect would be spent off-frame.
    const pad    = 46;
    const bottom = 190;
    return {
      x: Math.max(pad, Math.min(window.innerWidth - pad, cx + Math.cos(ang) * rx * band)),
      y: Math.max(pad + 40,
           Math.min(window.innerHeight - bottom, cy + Math.sin(ang) * ry * band)),
    };
  }

  // Reveal the LV badge alongside the name tag (called from submitPlayerName),
  // tinted to the player's colour so it reads as part of the tag.
  function reveal(color) {
    if (!_built) _build();
    // The name tag stays pointer-events:none. There is nothing to open — the
    // chain speaks only in the numbers it throws.
    _render();
  }

  // ── DEBUG (temporary — remove with the debug menu before production) ────────
  // Adds chain steps outright so the counter, its punch and its tier colours can
  // be driven by hand. Goes through the same _award path as a real step, so it
  // also pushes the resulting Presence level to Unity's pooled room bonus.
  // Kept under the old name so the debug button keeps working; the attribute
  // argument is ignored, because there is only one chain now.
  function debugLevel(attr, n) {
    if (!_built) _build();
    _attr.combo.level += (n || 1);
    if (_attr.combo.level > _best) _best = _attr.combo.level;
    _award();
    _arm();
    if (typeof Sound !== 'undefined') Sound.play('star');
    _render();
    _pop(_attr.combo.level, false);
    console.log('[DEBUG] chain → ×' + _attr.combo.level, window.PlayerMods);
  }

  _recompute();
  if (typeof window !== 'undefined') {
    if (document.readyState === 'loading') {
      window.addEventListener('DOMContentLoaded', _build);
    } else {
      _build();
    }
  }

  // Drives the Glitchling chain by hand, so its pop, its colour and its burst
  // can be checked without taking a corrupted card over and over.
  //   Player.debugGlitch()      one step
  //   Player.debugGlitch(3)     three, to reach a burst
  function debugGlitch(n) {
    if (!_built) _build();
    for (let i = 0; i < (n || 1); i++) hitGlitch();
    console.log('[DEBUG] glitchlings → ×' + _gLevel);
  }

  return { gainXP, hit, hitGlitch, observe, reveal, debugLevel, debugGlitch,
           handleMessage,
           set debugChain(v) { _debugChain = !!v; },
           get debugChain()  { return _debugChain; },
           get streak()      { return _attr.combo.level; },
           get best()        { return _best; },
           get glitchStreak(){ return _gLevel; },
           get glitchBest()  { return _gBest; } };
})();

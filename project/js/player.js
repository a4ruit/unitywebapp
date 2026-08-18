// player.js — lightweight, session-based player progression. Plain script, no
// modules. Load BEFORE main.js (it calls Player.observe / Player.gainXP).
//
// Design: play-driven XP. Doing things in the Unity world feeds the attribute
// that action belongs to — there's no "spend points" screen at all. Each level
// grants a small modifier. All state is in-memory (wiped on refresh), consistent
// with stars + the collection.
//
//   Attributes
//     dexterity → bigger spore budget    (earned by dispersing spores)
//     presence  → the ROOM's movement speed — placement and possession. Earned
//                 individually, pooled collectively; see PlayerMods.cs in Unity.
//     vigor     → more stars per reward  (earned by time possessing)
//
// Exposes:
//   Player.gainXP(attr, amount)   accumulate XP, level up
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
  const XP = { vigorTick: 4, presenceSpawn: 12, dexPaint: 1, dexFungi: 6 };
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
  // BLOOM and TITHE are not lost: sporeBudgetMult and starGainMult still scale
  // with Dexterity and Vigor, just without the perk term. SHEPHERD had no
  // attribute equivalent left once Presence stopped feeding flock size, so flock
  // is now a flat 3.
  const xpForLevel = (lv) => 50 + lv * 35;    // cost to go from level lv → lv+1

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
  const ATTRS = [
    { key: 'dexterity', short: 'DEX', color: '#7ad0ff', side: 'left',  drop:   0, phase: 0.0, glyph: 'diamond' },
    { key: 'presence',  short: 'PRE', color: '#ff9ad0', side: 'right', drop:   0, phase: 1.7, glyph: 'ring'    },
    { key: 'vigor',     short: 'VIG', color: '#9af0a0', side: 'left',  drop: 190, phase: 3.4, glyph: 'cross'   },
  ];

  // ── Vine geometry ───────────────────────────────────────────────────────────
  const BR = {
    // `gap` must stay larger than `bend`, so the first node lands after the vine
    // has finished swinging out. Any closer and it hangs mid-swing, still over
    // the top corner of the card.
    gap:       58,  // px below the tag before a vine's first node
    step:      30,  // px between chained nodes down the same vine
    node:      18,  // node diameter
    maxNodes:   5,  // visible chain length — the +N badge carries the true count
    minStep:   16,  // tightest spacing before nodes read as one blob
    bend:      46,  // descent over which a vine swings from the tag into its lane
    waver:    3.5,  // px of horizontal wobble, so it hangs rather than plumbs
    laneInset: 26,  // px out from the card's edge to the vine's lane
    sample:     6,  // px between polyline samples when drawing the string
  };

  // ── State (session only) ──────────────────────────────────────────────────────
  const _attr = {
    dexterity: { xp: 0, level: 0 },
    presence:  { xp: 0, level: 0 },
    vigor:     { xp: 0, level: 0 },
  };
  let   _statsOpen    = false;
  let   _built        = false;

  function _totalLevel() { return _attr.dexterity.level + _attr.presence.level + _attr.vigor.level; }

  // ── Modifiers ─────────────────────────────────────────────────────────────────
  // The room's pooled Presence, mirrored back from Unity. Display only — Unity is
  // authoritative and applies the real multiplier itself.
  let _roomMoveMult   = 1;
  let _roomPresence   = 0;
  let _roomPlayers    = 0;

  function _recompute() {
    window.PlayerMods = {
      sporeBudgetMult: 1 + 0.06 * _attr.dexterity.level,
      starGainMult:    1 + 0.05 * _attr.vigor.level,
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
    const lv = _attr.presence.level;
    if (lv === _sentPresence) return;          // only on an actual change
    _sentPresence = lv;
    if (typeof CLIENT_ID !== 'undefined' && typeof send === 'function') {
      send(`player_presence|${CLIENT_ID}|${lv}`);
    }
  }

  // Unity broadcast: room_mods|mult|totalPresence|contributors
  function handleMessage(msg) {
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

  function _renderBuffRail() {
    const rail = document.getElementById('buffRail');
    if (!rail) return;

    // Hidden entirely at the floor. An always-present chip reading "×1.00" is
    // furniture; one that appears when the room earns something is information.
    if (!(_roomMoveMult > 1.001)) {
      rail.classList.remove('buff-rail--open');
      rail.innerHTML = '';
      _lastBuffMult = 1;
      return;
    }

    const pct  = Math.round((_roomMoveMult - 1) * 100);
    const bump = _roomMoveMult > _lastBuffMult + 0.0001;

    rail.innerHTML =
      `<div class="buff-chip${bump ? ' buff-chip--bump' : ''}" title="Room speed">` +
        `<span class="buff-chip-sym">&gt;&gt;</span>` +
        `<span class="buff-chip-val">+${pct}%</span>` +
      `</div>`;
    rail.classList.add('buff-rail--open');
    _lastBuffMult = _roomMoveMult;
  }

  // ── XP / levelling ──────────────────────────────────────────────────────────────
  function gainXP(attr, amount) {
    const a = _attr[attr];
    if (!a || !(amount > 0)) return;
    a.xp += amount;
    let leveled = false;
    while (a.xp >= xpForLevel(a.level)) {
      a.xp -= xpForLevel(a.level);
      a.level++;
      leveled = true;
    }
    if (leveled) {
      _recompute();
      if (typeof Sound !== 'undefined') Sound.play('star');
      _pulse();
    }
    _render();
  }

  // ── Observe the WS stream for "playing in Unity" signals ──────────────────────
  // Vigor accrues for every possession tick (any creature) addressed to us — a
  // clean per-second heartbeat that means the player is actively inhabiting.
  function observe(data) {
    if (typeof data !== 'string') return;
    const id = (typeof CLIENT_ID !== 'undefined') ? CLIENT_ID : null;
    if (id && data.indexOf('possess_tick|' + id) !== -1) gainXP('vigor', XP.vigorTick);
  }

  // ── UI ──────────────────────────────────────────────────────────────────────────
  function _build() {
    if (_built) return;
    _built = true;

    const style = document.createElement('style');
    style.textContent = `
      /* ── Persistent LV badge — sits just above the player name tag, styled to
         match it and tinted to the player's colour. Lives inside #screen-pack so
         it shows/hides with the tag. Tapping it opens the stats window. ── */
      #pl-level {
        position: fixed; top: 172px; left: 50%;
        transform: translateX(-50%);
        z-index: 5;
        display: none;                 /* revealed alongside the name tag */
        pointer-events: auto; cursor: pointer;
        font-family: 'Pixelify Sans', 'lo-res', sans-serif;
        font-size: 10px; letter-spacing: 0.14em; white-space: nowrap;
        color: #cfeefb;                /* recoloured to the player's tag colour */
        padding: 1px 11px;
        background: rgba(6, 14, 18, 0.75);
        border: 1px solid currentColor; border-radius: 8px;
        text-shadow: 0 0 6px rgba(0,0,0,0.85);
        box-shadow: 0 0 8px -3px currentColor;
        -webkit-tap-highlight-color: transparent;
      }
      #pl-level.pl-pulse { animation: pl-pulse 0.55s ease-out; }
      @keyframes pl-pulse {
        0%   { box-shadow: 0 0 0 0 rgba(150,240,255,0.6); }
        100% { box-shadow: 0 0 0 12px rgba(150,240,255,0); }
      }

      /* ── Stats window — opened by tapping the name tag / LV badge ── */
      #pl-stats {
        position: fixed; inset: 0; z-index: 10055;
        display: none; align-items: center; justify-content: center;
        background: rgba(4, 7, 10, 0.78);
        font-family: 'Pixelify Sans', monospace;
      }
      #pl-stats.pl-open { display: flex; }
      #pl-stats-card {
        width: min(86vw, 320px);
        background: rgba(8, 14, 20, 0.98);
        border: 2px solid rgba(150, 240, 255, 0.45);
        border-radius: 10px; padding: 16px;
        box-shadow: 0 0 24px rgba(120, 200, 255, 0.22);
      }
      #pl-stats-name {
        font-size: 15px; letter-spacing: 1.5px; text-align: center;
        color: #cfeefb; text-shadow: 1px 1px 0 #000;
      }
      #pl-stats-lv {
        font-size: 11px; letter-spacing: 2px; text-align: center;
        color: #ffe7a0; margin: 2px 0 12px; text-transform: uppercase;
      }
      .pl-stat { margin: 9px 0; }
      .pl-stat-top { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 3px; }
      .pl-stat-name { font-size: 11px; letter-spacing: 1px; }
      .pl-stat-buff { font-size: 9px; letter-spacing: 0.5px; color: rgba(200,235,255,0.7); }
      .pl-stat-bar {
        position: relative; height: 7px;
        background: rgba(255,255,255,0.08);
        border: 1px solid rgba(255,255,255,0.12); border-radius: 3px; overflow: hidden;
      }
      .pl-stat-fill { position: absolute; inset: 0; transform-origin: left; }
      #pl-stats-hint {
        margin-top: 14px; text-align: center; font-size: 9px; letter-spacing: 1px;
        color: rgba(180,230,255,0.5); text-transform: uppercase;
      }

      /* ── Stat vines ───────────────────────────────────────────────────────
         Icons on vines hanging out of the name tag, down the gutters either
         side of the card. Replaces the need to open the stats window at all:
         what you've invested in is legible at a glance, permanently, without
         a tap.

         A full-viewport fixed overlay rather than a box positioned near the tag,
         because the tag's width changes with the player's name — anchoring in
         absolute viewport coordinates read from its bounding rect avoids having
         to keep a wrapper in sync with it. pointer-events:none throughout so it
         never intercepts a tap meant for the pack. */
      #pl-branches {
        position: fixed; inset: 0;
        z-index: 3;                    /* under the tag (4) and LV badge (5) */
        display: none;                 /* revealed with the name tag */
        pointer-events: none;
        overflow: visible;
      }
      #pl-branch-svg { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }

      .pl-node {
        position: absolute;
        width: ${BR.node}px; height: ${BR.node}px;
        margin-left: ${-BR.node / 2}px; margin-top: ${-BR.node / 2}px;
        display: flex; align-items: center; justify-content: center;
        /* Scale/fade in so a newly earned branch announces itself rather than
           silently appearing between frames. */
        animation: pl-node-in 0.42s cubic-bezier(0.34, 1.56, 0.64, 1) both;
      }
      @keyframes pl-node-in {
        0%   { opacity: 0; transform: scale(0.2); }
        100% { opacity: 1; transform: scale(1); }
      }

      /* Do NOT set a 'color' on this element. 'background: currentColor'
         resolves against the element's OWN color, so declaring a dark color
         here to tint the text made the background dark too — the badge was
         rendering near-black on near-black and vanishing. The colour is
         inherited from .pl-node (set inline to the attribute's colour) and the
         text tint goes on the inner span instead. */
      .pl-node-badge {
        position: absolute; right: -9px; top: -8px;
        font-family: 'Pixelify Sans', 'lo-res', sans-serif;
        font-size: 11px; line-height: 1;
        padding: 1px 4px;
        background: currentColor;
        border: 1px solid rgba(4, 10, 14, 0.9);
        border-radius: 6px;
        white-space: nowrap;
      }
      .pl-node-badge > span { color: #06121a; font-weight: 700; }
    `;
    document.head.appendChild(style);

    // LV badge — into the pack screen so it inherits the tag's visibility.
    const screen = document.getElementById('screen-pack') || document.body;
    const lvBadge = document.createElement('div');
    lvBadge.id = 'pl-level';
    lvBadge.textContent = 'LV 0';
    lvBadge.addEventListener('click', _openStats);
    screen.appendChild(lvBadge);

    // Tapping the name tag itself also opens the stats window.
    const tag = document.getElementById('playerNametag');
    if (tag) tag.addEventListener('click', _openStats);

    // Stats window — read-only attribute breakdown, tap anywhere to close.
    const stats = document.createElement('div');
    stats.id = 'pl-stats';
    stats.innerHTML =
      `<div id="pl-stats-card">` +
      `<div id="pl-stats-name">STATS</div>` +
      `<div id="pl-stats-lv">LV 0</div>` +
      `<div id="pl-stats-rows"></div>` +
      `<div id="pl-stats-hint">tap to close</div>` +
      `</div>`;
    stats.addEventListener('click', _closeStats);
    document.body.appendChild(stats);

    // Branch overlay — strings + icon nodes growing out of the name tag. Goes
    // into #screen-pack alongside the LV badge, NOT document.body: .shell is
    // `position:relative; z-index:1`, which makes it a stacking context, so a
    // body-level child at z-index 3 would paint over the entire app instead of
    // slipping behind the tag. Sharing the tag's parent also means it inherits
    // the screen's show/hide for free.
    const branches = document.createElement('div');
    branches.id = 'pl-branches';
    branches.innerHTML = `<svg id="pl-branch-svg"><g id="pl-branch-strings"></g></svg>`;
    screen.appendChild(branches);

    // The anchor is read from the tag's bounding rect, so anything that moves or
    // resizes it has to trigger a redraw.
    window.addEventListener('resize', _renderBranches);
    window.addEventListener('orientationchange', _renderBranches);
    // The tag's rect changes when it's revealed, when the name is set, and again
    // when the pixel font finishes loading and reflows its width. Observing it
    // catches all three without polling.
    if (tag && typeof ResizeObserver !== 'undefined') {
      new ResizeObserver(() => _renderBranches()).observe(tag);
    }

    _render();
  }

  function _render() {
    if (!_built) return;
    const badge = document.getElementById('pl-level');
    if (badge) badge.textContent = 'LV ' + _totalLevel();
    _renderBranches();
    if (_statsOpen) _renderStats();
  }

  // ── Stat vines ──────────────────────────────────────────────────────────────
  // One vine per attribute the player has invested in, dropping out of the name
  // tag and hanging down the gutter beside the card. Each level adds another
  // node further down the SAME vine, so the shape is a readable picture of how
  // they've played: one long vine means commitment, three short ones mean
  // they've spread.

  // The lane a vine hangs in: the strip between the pack card and that side's
  // slide-out tab. Measured rather than hardcoded, because the gutter is only a
  // few px wide on a phone and hundreds of px wide in a desktop browser window.
  // Biased to hug the card rather than sitting dead-centre in the gutter, so the
  // vines stay visually attached to the card at any width — then pushed back in
  // if that would put them under the tab.
  function _laneX(side) {
    const vw    = window.innerWidth;
    const half  = BR.node / 2 + 4;
    const stage = document.querySelector('.pack-carousel-stage');
    const trig  = document.querySelector(side === 'left' ? '.coll-panel-trigger' : '.task-panel-trigger');
    const tR    = trig  ? trig.getBoundingClientRect()  : null;
    const sR    = stage ? stage.getBoundingClientRect() : null;

    if (side === 'left') {
      const tab  = (tR && tR.width)  ? tR.right : 60;
      const card = (sR && sR.width)  ? sR.left  : vw / 2 - 132;
      return Math.max(tab + half, card - BR.laneInset);
    }
    const tab  = (tR && tR.width) ? tR.left   : vw - 60;
    const card = (sR && sR.width) ? sR.right  : vw / 2 + 132;
    return Math.min(tab - half, card + BR.laneInset);
  }

  // Horizontal position of a vine at `d` px below the tag. Eases from the tag's
  // edge into the lane over the whole descent to the first node, so a vine with
  // a big `drop` takes a long diagonal instead of snapping across and then
  // running parallel to its neighbour in the same gutter.
  function _vineX(a, d, startX, laneX) {
    const t     = Math.min(1, d / (a.drop + BR.bend));
    const ease  = 1 - t * t * (3 - 2 * t);
    const waver = Math.sin(d * 0.05 + a.phase) * BR.waver * Math.min(1, d / 50);
    return laneX + (startX - laneX) * ease + waver;
  }

  // Blocky SVG glyphs rather than font characters — see the note on ATTRS.glyph.
  function _glyphSvg(kind, color) {
    const c = color;
    const s = `stroke="${c}" fill="none" stroke-width="2.4" stroke-linejoin="miter"`;
    if (kind === 'diamond') return `<svg viewBox="0 0 20 20" width="18" height="18"><path d="M10 2 L18 10 L10 18 L2 10 Z" ${s}/></svg>`;
    if (kind === 'ring')    return `<svg viewBox="0 0 20 20" width="18" height="18"><rect x="3.5" y="3.5" width="13" height="13" ${s}/></svg>`;
    return `<svg viewBox="0 0 20 20" width="18" height="18"><path d="M10 2 V18 M2 10 H18" ${s}/></svg>`;
  }

  function _renderBranches() {
    if (!_built) return;
    const wrap = document.getElementById('pl-branches');
    const svg  = document.getElementById('pl-branch-strings');
    const tag  = document.getElementById('playerNametag');
    if (!wrap || !svg || !tag) return;

    // Nothing to hang branches off until the tag is actually on screen — a
    // hidden element reports a zero rect, which would anchor everything at 0,0.
    //
    // The rect IS the visibility test. Do not reach for offsetParent here: it is
    // specified to return null for any `position:fixed` element, and the tag is
    // fixed, so that check is unconditionally true and hides the branches
    // forever.
    const r = tag.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) { wrap.style.display = 'none'; return; }

    // Vines stop short of the pack-type row at the bottom of the screen rather
    // than running under it.
    const row     = document.querySelector('#screen-pack .pack-type-row');
    const rowR    = row ? row.getBoundingClientRect() : null;
    const floorY  = (rowR && rowR.height) ? rowR.top - 12 : window.innerHeight - 96;
    const maxDrop = Math.max(0, floorY - r.bottom);

    wrap.style.display = 'block';
    // Rebuilt wholesale each render. Cheap at this scale (≤3 branches × 5 nodes),
    // and it keeps the DOM a pure function of state rather than something that
    // has to be diffed — but it does mean the entry animation replays on every
    // redraw, so only call this when something actually changed.
    // Cleared child-by-child rather than with innerHTML: innerHTML on an SVG
    // element is a late addition (Safari 14+) and this runs on phones.
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    wrap.querySelectorAll('.pl-node').forEach(n => n.remove());

    ATTRS.forEach(a => {
      const lv = _attr[a.key].level;
      if (lv <= 0) return;

      // The vine leaves the bottom corner on its own side, so it drops away from
      // the name rather than across it.
      const laneX  = _laneX(a.side);
      const startX = a.side === 'left' ? r.left + 5 : r.right - 5;

      // A long vine would run past the pack-type row at the bottom of the
      // screen. First tighten the spacing to whatever depth is left, and only if
      // the nodes would start overlapping drop some off the end — the +N badge
      // still carries the true count either way.
      const avail = maxDrop - a.drop - BR.gap;
      if (avail < 0) return;
      const fits  = Math.max(1, Math.floor(avail / BR.minStep) + 1);

      const shown = Math.min(lv, BR.maxNodes, fits);
      const need  = BR.step * (shown - 1);
      const step  = (shown > 1 && need > avail) ? avail / (shown - 1) : BR.step;

      const pts = [];
      for (let i = 0; i < shown; i++) {
        const dd = a.drop + BR.gap + step * i;
        pts.push({ x: _vineX(a, dd, startX, laneX), y: r.bottom + dd });
      }

      // String: sampled along the same curve the nodes sit on, so the vine
      // actually passes through every icon instead of cutting corners between
      // them. Fine enough to read as a curve, coarse enough to stay cheap.
      const endD = a.drop + BR.gap + step * (shown - 1);
      let d = `M ${startX} ${r.bottom}`;
      for (let s = BR.sample; s < endD; s += BR.sample) {
        d += ` L ${_vineX(a, s, startX, laneX).toFixed(1)} ${(r.bottom + s).toFixed(1)}`;
      }
      d += ` L ${pts[pts.length - 1].x.toFixed(1)} ${pts[pts.length - 1].y.toFixed(1)}`;

      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', d);
      path.setAttribute('stroke-linecap', 'round');
      path.setAttribute('stroke-linejoin', 'round');
      path.setAttribute('stroke', a.color);
      path.setAttribute('stroke-width', '1.4');
      path.setAttribute('fill', 'none');
      path.setAttribute('opacity', '0.75');
      svg.appendChild(path);

      pts.forEach((p, i) => {
        const node = document.createElement('div');
        node.className = 'pl-node';
        node.style.left  = p.x + 'px';
        node.style.top   = p.y + 'px';
        node.style.color = a.color;          // .pl-node-badge inherits this
        // Stagger so a multi-node vine grows downward rather than popping whole.
        node.style.animationDelay = (i * 0.06) + 's';
        node.innerHTML = _glyphSvg(a.glyph, a.color);

        // The count rides the LOWEST node only. One badge per node would just be
        // the same number repeated down the vine, and the chain already shows
        // the magnitude — the badge is there to make it exact.
        if (i === shown - 1) {
          const badge = document.createElement('div');
          badge.className = 'pl-node-badge';
          badge.innerHTML = `<span>+${lv}</span>`;
          node.appendChild(badge);
        }
        wrap.appendChild(node);
      });
    });
  }

  // Build the stats window's attribute rows + headers.
  function _renderStats() {
    const nameEl = document.getElementById('pl-stats-name');
    if (nameEl) {
      const nm = (typeof playerName !== 'undefined' && playerName) ? `<${playerName}>` : 'STATS';
      nameEl.textContent = nm;
      if (typeof playerColor !== 'undefined' && playerColor) nameEl.style.color = playerColor;
    }
    const lvEl = document.getElementById('pl-stats-lv');
    if (lvEl) lvEl.textContent = 'LV ' + _totalLevel();

    const m = window.PlayerMods || {};
    const buff = {
      dexterity: `+${Math.round(((m.sporeBudgetMult || 1) - 1) * 100)}% spore`,
      // Shows the ROOM's bonus, not this player's contribution — the number you
      // benefit from is the pooled one, and seeing it move when someone else
      // levels up is the point of pooling it.
      presence:  _roomPlayers > 0
                   ? `room ×${_roomMoveMult.toFixed(2)} speed · ${_roomPlayers} playing`
                   : `room ×${_roomMoveMult.toFixed(2)} speed`,
      vigor:     `+${Math.round(((m.starGainMult || 1) - 1) * 100)}% stars`,
    };
    const rows = document.getElementById('pl-stats-rows');
    if (!rows) return;
    rows.innerHTML = ATTRS.map(a => {
      const st   = _attr[a.key];
      const frac = Math.max(0, Math.min(1, st.xp / xpForLevel(st.level)));
      return `<div class="pl-stat">` +
        `<div class="pl-stat-top">` +
          `<span class="pl-stat-name" style="color:${a.color}">${a.short} · LV ${st.level}</span>` +
          `<span class="pl-stat-buff">${buff[a.key]}</span>` +
        `</div>` +
        `<div class="pl-stat-bar"><span class="pl-stat-fill" style="background:${a.color};transform:scaleX(${frac})"></span></div>` +
      `</div>`;
    }).join('');
  }

  function _openStats() {
    if (!_built) return;
    _statsOpen = true;
    _renderStats();
    const el = document.getElementById('pl-stats');
    if (el) el.classList.add('pl-open');
    if (typeof Sound !== 'undefined') Sound.play('uiOpen');
  }

  function _closeStats() {
    _statsOpen = false;
    const el = document.getElementById('pl-stats');
    if (el) el.classList.remove('pl-open');
  }

  // Reveal the LV badge alongside the name tag (called from submitPlayerName),
  // tinted to the player's colour so it reads as part of the tag.
  function reveal(color) {
    if (!_built) _build();
    const badge = document.getElementById('pl-level');
    if (badge) {
      badge.style.display = 'block';
      if (color) badge.style.color = color;
    }
    // The tag is pointer-events:none by default — make it tappable so it can
    // open the stats window. The branches now show the same information without
    // a tap, so this is a detail view rather than the only way in.
    const tag = document.getElementById('playerNametag');
    if (tag) { tag.style.pointerEvents = 'auto'; tag.style.cursor = 'pointer'; }

    // The tag has just been shown, but layout may not have settled this frame —
    // its rect would still be zero and every branch would anchor to 0,0.
    requestAnimationFrame(_renderBranches);
    _render();
  }

  // ── DEBUG (temporary — remove with the debug menu before production) ────────
  // Grants levels outright, skipping the XP curve, so the vine fan can be driven
  // to any shape by hand. Goes through the same _recompute path as a real level,
  // which also pushes the new Presence level to Unity's pooled room bonus.
  function debugLevel(attr, n) {
    if (!_built) _build();
    const a = _attr[attr];
    if (!a) return;
    a.level += (n || 1);
    _recompute();
    if (typeof Sound !== 'undefined') Sound.play('star');
    _pulse();
    _render();
    console.log('[DEBUG] ' + attr + ' → LV ' + a.level, window.PlayerMods);
  }

  function _pulse() {
    const badge = document.getElementById('pl-level');
    if (!badge) return;
    badge.classList.remove('pl-pulse');
    void badge.offsetWidth;
    badge.classList.add('pl-pulse');
  }

  _recompute();
  if (typeof window !== 'undefined') {
    if (document.readyState === 'loading') {
      window.addEventListener('DOMContentLoaded', _build);
    } else {
      _build();
    }
  }

  return { gainXP, observe, reveal, debugLevel, handleMessage };
})();

// player.js — lightweight, session-based player progression. Plain script, no
// modules. Load BEFORE main.js (it calls Player.observe / Player.gainXP).
//
// Design (see chat): play-driven XP. Doing things in the Unity world feeds the
// attribute that action belongs to — there's no "spend points" screen for the
// base growth. Each level grants a small modifier. At milestones a HYBRID perk
// pick pops up offering a bigger, chosen bonus. All state is in-memory (wiped on
// refresh), consistent with stars + the collection.
//
//   Attributes
//     dexterity → bigger spore budget         (earned by dispersing spores)
//     presence  → more sheep per Flock release (earned by spawning critters)
//     vigor     → more stars per reward         (earned by time possessing)
//
// Exposes:
//   Player.gainXP(attr, amount)   accumulate XP, level up, maybe queue a perk
//   Player.observe(wsMessage)     watch the WS stream for "playing" signals
//   window.PlayerMods             { flockCount, sporeBudgetMult, starGainMult }
//                                 — always present with safe defaults.

// Safe defaults the instant the script loads, so consumers can read PlayerMods
// before the module has fully initialised.
window.PlayerMods = { flockCount: 3, sporeBudgetMult: 1, starGainMult: 1 };

const Player = (() => {

  // ── Tuning ──────────────────────────────────────────────────────────────────
  const XP = { vigorTick: 4, presenceSpawn: 12, dexPaint: 1, dexFungi: 6 };
  const PERK_EVERY = 4;                       // a perk pick every N total levels
  const xpForLevel = (lv) => 50 + lv * 35;    // cost to go from level lv → lv+1

  const ATTRS = [
    { key: 'dexterity', short: 'DEX', color: '#7ad0ff' },
    { key: 'presence',  short: 'PRE', color: '#ff9ad0' },
    { key: 'vigor',     short: 'VIG', color: '#9af0a0' },
  ];

  // Hybrid perk options — each pick lets the player choose ONE bigger bonus.
  const PERKS = [
    { key: 'flock', label: 'SHEPHERD', desc: '+1 sheep per Flock release' },
    { key: 'spore', label: 'BLOOM',    desc: '+30% spore budget' },
    { key: 'star',  label: 'TITHE',    desc: '+20% star gain' },
  ];

  // ── State (session only) ──────────────────────────────────────────────────────
  const _attr = {
    dexterity: { xp: 0, level: 0 },
    presence:  { xp: 0, level: 0 },
    vigor:     { xp: 0, level: 0 },
  };
  const _perk        = { flock: 0, spore: 0, star: 0 };  // chosen perk counts
  let   _perksGranted = 0;                                // milestones consumed
  const _perkQueue    = [];                               // pending picks
  let   _modalOpen    = false;
  let   _statsOpen    = false;
  let   _built        = false;

  function _totalLevel() { return _attr.dexterity.level + _attr.presence.level + _attr.vigor.level; }

  // ── Modifiers ─────────────────────────────────────────────────────────────────
  function _recompute() {
    window.PlayerMods = {
      flockCount:      3 + Math.floor(_attr.presence.level / 3) + _perk.flock,
      sporeBudgetMult: 1 + 0.06 * _attr.dexterity.level + 0.30 * _perk.spore,
      starGainMult:    1 + 0.05 * _attr.vigor.level     + 0.20 * _perk.star,
    };
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
      _checkPerks();
    }
    _render();
  }

  function _checkPerks() {
    const earned = Math.floor(_totalLevel() / PERK_EVERY);
    while (_perksGranted < earned) {
      _perksGranted++;
      _perkQueue.push(true);
    }
    if (_perkQueue.length && !_modalOpen) _openPerkModal();
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

      /* ── Perk pick modal ── */
      #pl-modal {
        position: fixed; inset: 0; z-index: 10060;
        display: none; align-items: center; justify-content: center;
        background: rgba(4, 7, 10, 0.78);
        font-family: 'Pixelify Sans', monospace;
      }
      #pl-modal.pl-open { display: flex; }
      #pl-modal-card {
        width: min(86vw, 320px);
        background: rgba(8, 14, 20, 0.98);
        border: 2px solid rgba(150, 240, 255, 0.5);
        border-radius: 10px; padding: 18px 16px;
        box-shadow: 0 0 24px rgba(120, 200, 255, 0.25);
        text-align: center;
      }
      #pl-modal-title {
        color: #ffe7a0; font-size: 16px; letter-spacing: 2px;
        text-transform: uppercase; text-shadow: 1px 1px 0 #000; margin-bottom: 4px;
      }
      #pl-modal-sub {
        color: rgba(180, 230, 255, 0.8); font-size: 10px; letter-spacing: 1px;
        text-transform: uppercase; margin-bottom: 14px;
      }
      .pl-perk {
        display: block; width: 100%; box-sizing: border-box; margin: 7px 0;
        background: rgba(120, 200, 255, 0.08);
        border: 2px solid rgba(120, 200, 255, 0.4);
        border-radius: 8px; padding: 11px 12px;
        color: #cfeeff; cursor: pointer; text-align: left;
        transition: background 0.12s, border-color 0.12s, transform 0.06s;
      }
      .pl-perk:active { transform: scale(0.98); }
      .pl-perk:hover { background: rgba(120, 200, 255, 0.16); border-color: rgba(150, 240, 255, 0.7); }
      .pl-perk-label { font-size: 14px; letter-spacing: 1.5px; color: #ffe7a0; }
      .pl-perk-desc  { font-size: 11px; letter-spacing: 0.5px; color: rgba(200, 235, 255, 0.85); margin-top: 2px; }
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

    const modal = document.createElement('div');
    modal.id = 'pl-modal';
    modal.innerHTML =
      `<div id="pl-modal-card">` +
      `<div id="pl-modal-title">Level Up</div>` +
      `<div id="pl-modal-sub">Choose a boon</div>` +
      `<div id="pl-modal-perks"></div>` +
      `</div>`;
    document.body.appendChild(modal);

    _render();
  }

  function _render() {
    if (!_built) return;
    const badge = document.getElementById('pl-level');
    if (badge) badge.textContent = 'LV ' + _totalLevel();
    if (_statsOpen) _renderStats();
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
      presence:  `${m.flockCount || 3} sheep / flock`,
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
    // open the stats window.
    const tag = document.getElementById('playerNametag');
    if (tag) { tag.style.pointerEvents = 'auto'; tag.style.cursor = 'pointer'; }
    _render();
  }

  function _pulse() {
    const badge = document.getElementById('pl-level');
    if (!badge) return;
    badge.classList.remove('pl-pulse');
    void badge.offsetWidth;
    badge.classList.add('pl-pulse');
  }

  function _openPerkModal() {
    if (!_built || _modalOpen || !_perkQueue.length) return;
    _modalOpen = true;
    const modal = document.getElementById('pl-modal');
    const list  = document.getElementById('pl-modal-perks');
    if (!modal || !list) { _modalOpen = false; return; }
    list.innerHTML = '';
    PERKS.forEach(p => {
      const btn = document.createElement('button');
      btn.className = 'pl-perk';
      btn.innerHTML = `<div class="pl-perk-label">${p.label}</div><div class="pl-perk-desc">${p.desc}</div>`;
      btn.addEventListener('click', () => _pickPerk(p.key));
      list.appendChild(btn);
    });
    modal.classList.add('pl-open');
    if (typeof Sound !== 'undefined') Sound.play('uiOpen');
  }

  function _pickPerk(key) {
    if (_perk[key] !== undefined) _perk[key]++;
    _recompute();
    _perkQueue.pop();
    const modal = document.getElementById('pl-modal');
    if (modal) modal.classList.remove('pl-open');
    _modalOpen = false;
    if (typeof Sound !== 'undefined') Sound.play('star');
    _render();
    if (_perkQueue.length) setTimeout(_openPerkModal, 350);   // chain remaining picks
  }

  _recompute();
  if (typeof window !== 'undefined') {
    if (document.readyState === 'loading') {
      window.addEventListener('DOMContentLoaded', _build);
    } else {
      _build();
    }
  }

  return { gainXP, observe, reveal };
})();

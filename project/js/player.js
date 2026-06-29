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
      #pl-hud {
        position: fixed; top: 8px; left: 8px; z-index: 400;
        pointer-events: auto; cursor: default;
        font-family: 'Pixelify Sans', monospace;
        background: rgba(6, 12, 16, 0.78);
        border: 1px solid rgba(120, 200, 255, 0.35);
        border-radius: 6px; padding: 5px 7px;
        display: flex; flex-direction: column; gap: 4px;
        box-shadow: 0 0 8px rgba(0,0,0,0.5);
        user-select: none; -webkit-tap-highlight-color: transparent;
      }
      #pl-hud.pl-pulse { animation: pl-pulse 0.5s ease-out; }
      @keyframes pl-pulse {
        0%   { box-shadow: 0 0 0 0 rgba(150,240,255,0.6); }
        100% { box-shadow: 0 0 0 10px rgba(150,240,255,0); }
      }
      #pl-hud-lv {
        font-size: 11px; letter-spacing: 1px; color: #ffe7a0;
        text-shadow: 1px 1px 0 #000; text-align: center;
      }
      .pl-row { display: flex; align-items: center; gap: 5px; }
      .pl-row-tag { font-size: 8px; width: 20px; letter-spacing: 0.5px; }
      .pl-row-bar {
        position: relative; width: 64px; height: 5px;
        background: rgba(255,255,255,0.08);
        border: 1px solid rgba(255,255,255,0.12); border-radius: 2px; overflow: hidden;
      }
      .pl-row-fill { position: absolute; inset: 0; transform-origin: left; }
      .pl-row-lv { font-size: 8px; color: rgba(255,255,255,0.6); width: 12px; text-align: right; }

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

    const hud = document.createElement('div');
    hud.id = 'pl-hud';
    hud.innerHTML =
      `<div id="pl-hud-lv">LV 0</div>` +
      ATTRS.map(a =>
        `<div class="pl-row">` +
        `<span class="pl-row-tag" style="color:${a.color}">${a.short}</span>` +
        `<span class="pl-row-bar"><span class="pl-row-fill" id="pl-fill-${a.key}" style="background:${a.color}"></span></span>` +
        `<span class="pl-row-lv" id="pl-lv-${a.key}">0</span>` +
        `</div>`
      ).join('');
    document.body.appendChild(hud);

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
    const lvEl = document.getElementById('pl-hud-lv');
    if (lvEl) lvEl.textContent = 'LV ' + _totalLevel();
    ATTRS.forEach(a => {
      const st   = _attr[a.key];
      const frac = Math.max(0, Math.min(1, st.xp / xpForLevel(st.level)));
      const fill = document.getElementById('pl-fill-' + a.key);
      if (fill) fill.style.transform = `scaleX(${frac})`;
      const lv = document.getElementById('pl-lv-' + a.key);
      if (lv) lv.textContent = st.level;
    });
  }

  function _pulse() {
    const hud = document.getElementById('pl-hud');
    if (!hud) return;
    hud.classList.remove('pl-pulse');
    void hud.offsetWidth;
    hud.classList.add('pl-pulse');
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

  return { gainXP, observe };
})();

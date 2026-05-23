/**
 * corruption-bar.js — collective corruption bar, source-of-truth = Unity.
 *
 *   ENGAGEMENT IS THE DAMAGE.
 *
 * Every pack pulled on any connected phone pushes a shared bar toward horror.
 * No one triggers it intentionally — the gesture itself does. When the room
 * idles, the bar decays (the environment heals in human absence).
 *
 * This module:
 *   1. Builds a prominent top-of-screen bar (placeholder pixel-style — Asesprite
 *      art can swap the CSS background later).
 *   2. Subscribes to `corruption|level|packCount|phase` messages from Unity.
 *   3. Mirrors the authoritative pack count back into document.body.dataset.corruption
 *      so all existing code (HORROR_THRESHOLD checks, pack tab classes) keeps
 *      working — but now driven by a SHARED value across every phone.
 *   4. Spawns blood droplets on the bar past the midway point as a visual tell.
 *
 * Load order: include AFTER possession.js and BEFORE main.js so main.js sees
 * the global handleCorruptionMessage() function during connect().
 *
 * Globals exposed:
 *   handleCorruptionMessage(data)   — call inside ws.onmessage; returns true
 *                                     if the message was handled here.
 */

console.log('%c[corruption-bar.js] v2025-05-23 — collective bar online',
  'color:#ff5050; font-weight:bold');

// ── Module state ───────────────────────────────────────────────────────────
let _corrLevel       = 0;      // 0..1, authoritative from Unity
let _corrPackCount   = 0;      // raw cumulative count
let _corrPhase       = 'nature';
let _corrUI          = null;   // DOM refs
let _lastDropTime    = 0;      // throttle blood drips to avoid swarm
let _lastPackCount   = -1;     // previous packCount — used to detect real changes

// ── Public globals ─────────────────────────────────────────────────────────

/**
 * Route incoming WS messages. Returns true if handled here.
 * main.js should call this in ws.onmessage alongside handlePossessionMessage.
 */
function handleCorruptionMessage(data) {
  if (typeof data !== 'string') return false;
  const msg = data.startsWith('web:') ? data.slice(4).trim() : data.trim();

  // corruption|<level>|<packCount>|<phase>
  if (msg.startsWith('corruption|')) {
    const p = msg.split('|');
    if (p.length < 4) return false;
    const level     = parseFloat(p[1]);
    const packCount = parseInt(p[2], 10);
    const phase     = p[3];
    _applyCorruption(level, packCount, phase);
    return true;
  }

  // corruption_phase|nature|<packCount>   or   |horror|<packCount>
  if (msg.startsWith('corruption_phase|')) {
    const p = msg.split('|');
    if (p[1] === 'horror') _onCrossIntoHorror();
    else if (p[1] === 'nature') _onHealBackToNature();
    return true;
  }

  return false;
}

// ── Apply update from Unity ────────────────────────────────────────────────

function _applyCorruption(level, packCount, phase) {
  _corrLevel     = Math.max(0, Math.min(1, level));
  _corrPackCount = packCount;
  _corrPhase     = phase;

  // ── Mirror level → "effective pack pressure" for legacy code ──
  // The existing pack-tab / pack-pool / Pack3D code all read
  // `document.body.dataset.corruption` and compare against HORROR_THRESHOLD (15).
  //
  // BUT: packCount is cumulative — it never decreases — so if we wrote it
  // straight to the dataset, the world could NEVER heal back to nature even
  // when Unity decays the level. Refresh, decay, anything — the dataset would
  // stay stuck at the high-water mark.
  //
  // Instead we derive an effective value from the LIVE LEVEL, mapped into the
  // same scale (0..25, with 15 = horror threshold). When Unity decays the
  // level, this value DROPS, the pristine-phase class comes back, packs heal.
  //
  //   level=0.00 → effective=0    (full nature)
  //   level=0.60 → effective=15   (horror threshold — matches HORROR_THRESHOLD)
  //   level=1.00 → effective=25   (full corruption)
  const HT_LEVEL   = 0.60;   // matches Unity CorruptionManager.horrorThreshold
  const HT_WEB     = window.HORROR_THRESHOLD ?? 15;
  const effective  = Math.round(_corrLevel * (HT_WEB / HT_LEVEL));

  if (effective !== _lastPackCount) {
    _lastPackCount = effective;
    if (typeof updateCorruption === 'function') {
      // Drives dataset.corruption, pristine-phase class, pack tab refresh,
      // Pack3D.startGlitchTransition on threshold cross, sendPackType, etc.
      updateCorruption(effective);
    } else {
      // Fallback if main.js hasn't loaded yet
      document.body.dataset.corruption = effective;
      document.body.classList.toggle('pristine-phase', effective < HT_WEB);
    }
  }

  // ── Drive the screen bleed off the SAME collective level ──
  // Removes the per-player "15 local pulls" trigger that used to live in
  // bloodDrip.js. Now every connected phone bleeds when the ROOM is in horror.
  if (typeof BloodDrip !== 'undefined' && BloodDrip.setCorruptionLevel) {
    BloodDrip.setCorruptionLevel(_corrLevel);
  }

  if (!_corrUI) return;
  _renderBar();
}

// ── Build UI ───────────────────────────────────────────────────────────────

function _buildBar() {
  const style = document.createElement('style');
  style.textContent = `
    /* ── Collective corruption bar ─────────────────────────────────────────
       Prominent strip at the top of the screen. Visible on every phone
       simultaneously. Green at the empty end (nature), red at the full end
       (horror). Blood droplets emit past the midway point. */
    #corr-bar-root {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      z-index: 9998;            /* below possession spore panel (10000) */
      pointer-events: none;     /* purely a readout — never blocks taps */
      padding: 8px 16px 4px 16px;
      box-sizing: border-box;
      font-family: monospace;
      user-select: none;
    }

    /* Bar housing — pixel-art outer frame, ready to be swapped for an
       Asesprite PNG by replacing this background with a 9-slice image. */
    #corr-bar-frame {
      position: relative;
      width: 100%;
      height: 18px;
      background: #0d0d10;
      border: 2px solid #2a2a30;
      box-shadow:
        inset 1px 1px 0 #3a3a44,
        inset -1px -1px 0 #06060a,
        0 0 12px rgba(0,0,0,0.6);
      image-rendering: pixelated;
      overflow: visible;        /* droplets fall outside */
    }

    /* The fill itself — left aligned, width scales 0..100% with level.
       Gradient runs green → yellow → red so the colour at the bar's edge
       always matches the current "danger" reading. */
    #corr-bar-fill {
      position: absolute;
      top: 0; left: 0; bottom: 0;
      width: 0%;
      background: linear-gradient(
        to right,
        #4ecf52  0%,
        #c8e84a 45%,
        #f0a020 70%,
        #d62828 100%);
      box-shadow: 0 0 8px rgba(220, 40, 40, 0.0);   /* glow ramps up via JS */
      transition: width 0.35s ease-out, box-shadow 0.4s linear;
    }

    /* Threshold marker — vertical tick on the bar at horror threshold (60%).
       Tells players visually WHERE the world will tip. */
    #corr-bar-threshold {
      position: absolute;
      top: -3px;
      bottom: -3px;
      left: 60%;
      width: 2px;
      background: rgba(255,255,255,0.55);
      box-shadow: 0 0 6px rgba(255,255,255,0.55);
    }

    /* Pulse animation once past the threshold — slow red breathing */
    #corr-bar-frame.corr-horror {
      animation: corr-horror-pulse 1.6s ease-in-out infinite;
    }
    @keyframes corr-horror-pulse {
      0%, 100% { box-shadow:
                   inset 1px 1px 0 #3a3a44,
                   inset -1px -1px 0 #06060a,
                   0 0 14px rgba(214, 40, 40, 0.55); }
      50%      { box-shadow:
                   inset 1px 1px 0 #3a3a44,
                   inset -1px -1px 0 #06060a,
                   0 0 28px rgba(214, 40, 40, 0.95); }
    }

    /* Stats line below the bar — small monospace readout.
       "PACKS OPENED 042  •  COLLECTIVE CORRUPTION 47%"  */
    #corr-bar-stats {
      margin-top: 4px;
      display: flex;
      justify-content: space-between;
      font-size: 9px;
      letter-spacing: 2px;
      text-transform: uppercase;
      color: rgba(255,255,255,0.55);
      text-shadow: 1px 1px 0 #000;
    }
    #corr-bar-stats.corr-horror { color: #ffb0b0; }

    /* Falling blood droplets — absolute children of the frame.
       JS spawns them as the level climbs past 0.5. */
    .corr-drop {
      position: absolute;
      width: 3px;
      height: 7px;
      background: #b00020;
      box-shadow: 0 0 4px rgba(176, 0, 32, 0.7);
      border-radius: 0 0 50% 50%;
      pointer-events: none;
      animation: corr-drop-fall 1.4s linear forwards;
      image-rendering: pixelated;
    }
    @keyframes corr-drop-fall {
      0%   { top: 100%;       opacity: 1; transform: translateY(0); }
      80%  { opacity: 0.85; }
      100% { top: 100%;       opacity: 0; transform: translateY(80px); }
    }
  `;
  document.head.appendChild(style);

  const root = document.createElement('div');
  root.id = 'corr-bar-root';
  root.innerHTML = `
    <div id="corr-bar-frame">
      <div id="corr-bar-fill"></div>
      <div id="corr-bar-threshold" title="Horror threshold"></div>
    </div>
    <div id="corr-bar-stats">
      <span>PACKS OPENED <span id="corr-bar-count">000</span></span>
      <span>COLLECTIVE CORRUPTION <span id="corr-bar-percent">0%</span></span>
    </div>
  `;
  document.body.appendChild(root);

  _corrUI = {
    root:      root,
    frame:     root.querySelector('#corr-bar-frame'),
    fill:      root.querySelector('#corr-bar-fill'),
    threshold: root.querySelector('#corr-bar-threshold'),
    stats:     root.querySelector('#corr-bar-stats'),
    count:     root.querySelector('#corr-bar-count'),
    percent:   root.querySelector('#corr-bar-percent'),
  };

  // Sync threshold marker position to whatever HORROR_THRESHOLD ends up being.
  // The Unity manager's threshold is the source — but for now the bar uses
  // a fixed 60% mark which matches CorruptionManager.horrorThreshold default.

  _renderBar();
}

// ── Render the current state ──────────────────────────────────────────────

function _renderBar() {
  if (!_corrUI) return;

  const pct = Math.round(_corrLevel * 100);
  _corrUI.fill.style.width = pct + '%';

  // Glow intensity scales with level
  const glow = Math.round(_corrLevel * 24);
  _corrUI.fill.style.boxShadow = `0 0 ${glow}px rgba(220, 40, 40, ${_corrLevel * 0.9})`;

  // Stats readout
  _corrUI.count.textContent   = String(_corrPackCount).padStart(3, '0');
  _corrUI.percent.textContent = pct + '%';

  // Horror class toggle
  const isHorror = _corrPhase === 'horror';
  _corrUI.frame.classList.toggle('corr-horror', isHorror);
  _corrUI.stats.classList.toggle('corr-horror', isHorror);

  // Blood drips past the midpoint — frequency ramps with how high we are
  if (_corrLevel > 0.5) {
    const now      = performance.now();
    const interval = Math.max(120, 900 - _corrLevel * 1000);   // 900ms @ 0.5 → 120ms @ 1.0
    if (now - _lastDropTime > interval) {
      _spawnDroplet();
      _lastDropTime = now;
    }
  }
}

// ── Blood droplet VFX ─────────────────────────────────────────────────────
// Tiny pixel-art drops fall off the bottom of the bar. Position randomised
// across the FILLED portion only — the corruption literally bleeds where the
// bar is full. Drops self-destruct after the CSS animation completes.

function _spawnDroplet() {
  const d = document.createElement('div');
  d.className = 'corr-drop';
  // Random x within the filled portion (last 80% of fill for visual weight)
  const fillPct = _corrLevel * 100;
  const x       = Math.random() * fillPct * 0.95;
  d.style.left = x + '%';
  _corrUI.frame.appendChild(d);
  setTimeout(() => d.remove(), 1500);
}

// ── Phase edge events ─────────────────────────────────────────────────────

function _onCrossIntoHorror() {
  console.log('%c[corruption-bar.js] ▲ HORROR PHASE — the room has tipped',
    'color:#ff3030; font-weight:bold; font-size:14px');
  // Hook for dramatic full-screen VFX — left intentionally minimal here so
  // it can be triggered from main.js/Pack3D where the glitch transition lives.
  // Pack3D.startGlitchTransition() already runs via main.js when corruption
  // crosses the threshold — we don't double-fire it.
}

function _onHealBackToNature() {
  console.log('%c[corruption-bar.js] ▼ HEALED BACK — the world recovered',
    'color:#50dc8c; font-weight:bold; font-size:14px');
}

// ── Boot ───────────────────────────────────────────────────────────────────
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', _buildBar);
} else {
  _buildBar();
}

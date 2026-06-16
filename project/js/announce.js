// announce.js — global push-notification style banners + minimized boss HP HUD
// v2026-06-16
//
// Drop-down banners (like a native mobile push) for big shared moments:
//   • boss spawn  — names the corrupted player; "you" variant for the spawner
//   • boss slain  — celebratory cleanse
//   • god pack    — names the lucky puller (dormant until god packs re-enabled)
//
// The boss-spawn banner MINIMISES into a compact live HP bar (#bossHud) that
// tracks the boss until it's slain — instead of a separate persistent badge.
//
// Driven by WS messages relayed from Unity (+ one web-side god-pack trigger):
//   boss_spawned|maxHP|spawnerId|colorHex|name   (name LAST — may be empty)
//   boss_damaged|amount|currentHP|maxHP|source
//   boss_slain|source
//   godpack_pulled|name|colorHex                 (web → web via the relay)
//
// Hooked from main.js: ws.onmessage → Announce.handleMessage(data)
//                      doPackOpen() → Announce.godPack(...) on a god-pack pull

const Announce = (() => {

  const BOSS_NAME = 'THE GLITCH';   // shown on the minimized HP bar

  // ── State ──────────────────────────────────────────────────────────────────
  let _queue       = [];
  let _open        = false;     // a banner is currently dropped down
  let _current     = null;
  let _bannerTimer = null;

  let _bossActive  = false;
  let _bossMaxHP   = 0;
  let _bossHP      = 0;

  function _el(id) { return document.getElementById(id); }

  function _esc(s) {
    return String(s).replace(/[&<>"]/g, c =>
      ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]));
  }

  // ── Public: WS message handler (returns true if it consumed the message) ─────
  function handleMessage(msg) {
    if (typeof msg !== 'string') return false;

    if (msg.startsWith('boss_spawned|')) {
      const p        = msg.split('|');
      const maxHP    = parseInt(p[1]) || 0;
      const spawnId  = p[2] || '';
      const colorHex = p[3] ? ('#' + p[3].replace('#', '')) : '#ff5a7a';
      const name     = p.slice(4).join('|') || '';   // name may legitimately be empty
      _onBossSpawned(maxHP, spawnId, colorHex, name);
      return true;
    }
    if (msg.startsWith('boss_damaged|')) {
      const p   = msg.split('|');
      const hp  = parseInt(p[2]);
      const max = parseInt(p[3]);
      _onBossDamaged(hp, max);
      return true;
    }
    if (msg === 'boss_slain' || msg.startsWith('boss_slain|')) {
      _onBossSlain();
      return true;
    }
    if (msg.startsWith('godpack_pulled|')) {
      const p        = msg.split('|');
      const name     = p[1] || '';
      const colorHex = p[2] ? ('#' + p[2].replace('#', '')) : '#ffd96b';
      godPack(name, colorHex);
      return true;
    }
    return false;
  }

  // ── Banner queue ────────────────────────────────────────────────────────────
  function _enqueue(item) {
    _queue.push(item);
    if (!_open) _next();
  }

  function _next() {
    if (_open) return;
    const item = _queue.shift();
    if (!item) return;
    const banner = _el('announceBanner');
    if (!banner) return;

    _open    = true;
    _current = item;
    _render(item);
    banner.classList.add('announce-banner--open');

    if (navigator.vibrate && item.vibrate) {
      try { navigator.vibrate(item.vibrate); } catch (e) {}
    }

    clearTimeout(_bannerTimer);
    _bannerTimer = setTimeout(() => _dismiss(item), item.duration || 5000);
  }

  function _dismiss(item) {
    if (!_open) return;
    if (item && item !== _current) return;   // stale timer for an old banner
    _open = false;
    const banner = _el('announceBanner');
    if (banner) banner.classList.remove('announce-banner--open');
    clearTimeout(_bannerTimer);
    const done = _current && _current.onDismiss;
    _current = null;
    if (done) done();
    // Let it retract before the next one drops in.
    setTimeout(_next, 280);
  }

  function _render(item) {
    const banner = _el('announceBanner');
    if (!banner) return;
    banner.className = 'announce-banner announce-banner--' + item.type;
    const icon = _el('announceIcon');  if (icon)  icon.textContent  = item.icon  || '';
    const ttl  = _el('announceTitle'); if (ttl)   ttl.textContent   = item.title || '';
    const body = _el('announceBody');  if (body)  body.innerHTML    = item.body  || '';
  }

  // ── Boss spawn ──────────────────────────────────────────────────────────────
  function _onBossSpawned(maxHP, spawnerId, colorHex, name) {
    _bossActive = true;
    _bossMaxHP  = maxHP || 0;
    _bossHP     = _bossMaxHP;
    _setHudData();

    const isMe = spawnerId && (typeof CLIENT_ID !== 'undefined') && spawnerId === CLIENT_ID;
    let title, body;
    if (isMe) {
      title = "YOU'VE BEEN CORRUPTED";
      body  = "A glitch has torn open around you.<br>Use placed objects to cleanse it.";
    } else if (name) {
      title = "⚠ GLITCH DETECTED";
      body  = `<span class="announce-name" style="color:${colorHex}">${_esc(name)}</span> ` +
              `has been corrupted.<br>Plant nature cards near it to cleanse it.`;
    } else {
      title = "⚠ GLITCH DETECTED";
      body  = "A glitch has been detected.<br>Use placed objects to cleanse it.";
    }

    _enqueue({
      type: 'boss', icon: '⚠', title, body,
      duration: 6000, vibrate: [70, 50, 70],
      // When the banner retracts, drop the compact live HP bar into place.
      onDismiss: () => { if (_bossActive) _showHud(); },
    });
  }

  function _onBossDamaged(hp, max) {
    if (!isNaN(max) && max > 0) _bossMaxHP = max;
    if (!isNaN(hp)) _bossHP = Math.max(0, hp);
    _updateHud();
  }

  function _onBossSlain() {
    _bossActive = false;
    _hideHud();
    _enqueue({
      type: 'slain', icon: '✓', title: 'GLITCH CLEANSED',
      body: 'The corruption has been purged.<br>The world breathes again.',
      duration: 4500, vibrate: [40],
    });
  }

  // ── God pack (dormant until god packs are re-enabled) ───────────────────────
  function godPack(name, colorHex) {
    const col = colorHex || '#ffd96b';
    _enqueue({
      type: 'godpack', icon: '✦', title: 'GOD PACK',
      body: name
        ? `<span class="announce-name" style="color:${col}">${_esc(name)}</span> pulled a GOD PACK!`
        : 'A GOD PACK was pulled!',
      duration: 5000, vibrate: [30, 30, 30],
    });
  }

  // ── Minimized boss HP HUD ───────────────────────────────────────────────────
  function _setHudData() {
    const nameEl = _el('bossHudName');
    if (nameEl) nameEl.textContent = BOSS_NAME;
    _updateHud();
  }
  function _updateHud() {
    const fill = _el('bossHudFill');
    const hpEl = _el('bossHudHp');
    const pct  = _bossMaxHP > 0 ? Math.max(0, Math.min(1, _bossHP / _bossMaxHP)) : 0;
    if (fill) fill.style.width = (pct * 100).toFixed(1) + '%';
    if (hpEl) hpEl.textContent = `${_bossHP}/${_bossMaxHP}`;
  }
  function _showHud() { const h = _el('bossHud'); if (h) h.classList.add('boss-hud--open'); }
  function _hideHud() { const h = _el('bossHud'); if (h) h.classList.remove('boss-hud--open'); }

  // ── Init — tap anywhere on the banner to dismiss early ──────────────────────
  (function _init() {
    const banner = _el('announceBanner');
    if (banner) banner.addEventListener('click', () => _dismiss(_current));
  })();

  return { handleMessage, godPack };

})();

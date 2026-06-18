// sound.js — audio gate for the whole web app.
//
// Mobile browsers block audio until a user gesture. The "sound" toggle on the
// name screen records the player's preference; the enter-world tap (a gesture)
// is where we unlock the AudioContext — see submitPlayerName() in main.js.
//
// Actual sound effects are added later: those features check Sound.ready() and
// play through Sound.ctx() (or a Sound.play() we add then). For now this is just
// the gate + preference, wired to the name-screen checkbox.

const Sound = (() => {

  let _enabled  = true;    // player preference (name-screen toggle, default ON)
  let _ctx      = null;    // Web Audio context, created on the unlock gesture
  let _unlocked = false;

  function setEnabled(on) {
    _enabled = !!on;
    // If they switch sound off after unlocking, leave the context alone — it's
    // harmless suspended; ready() gates playback on _enabled anyway.
  }
  function isEnabled() { return _enabled; }

  // Must be called from inside a user gesture (the enter-world tap). Creates and
  // resumes the AudioContext so later playback isn't blocked by autoplay policy.
  // No-op when sound is disabled.
  function unlock() {
    if (!_enabled) return;
    try {
      if (!_ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (AC) _ctx = new AC();
      }
      if (_ctx && _ctx.state === 'suspended') _ctx.resume();
      _unlocked = true;
    } catch (e) { /* audio unavailable — stay silent */ }
  }

  // The gate later SFX should check before playing.
  function ready() {
    return !!(_enabled && _unlocked && _ctx && _ctx.state === 'running');
  }
  function ctx() { return _ctx; }

  return { setEnabled, isEnabled, unlock, ready, ctx };

})();

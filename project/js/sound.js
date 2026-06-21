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
  let _master   = null;    // master gain — all SFX route through this
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
        if (AC) {
          _ctx = new AC();
          _master = _ctx.createGain();
          _master.gain.value = 0.5;          // overall volume + clip headroom
          _master.connect(_ctx.destination);
        }
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

  // ── Tiny synth helpers (no audio assets — everything is generated) ──────────

  // A single enveloped oscillator note (optional pitch glide).
  function _tone(freq, start, dur, type, gain, glideTo) {
    const o = _ctx.createOscillator();
    const g = _ctx.createGain();
    o.type = type || 'square';
    o.frequency.setValueAtTime(freq, start);
    if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, start + dur);
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(gain, start + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    o.connect(g).connect(_master);
    o.start(start);
    o.stop(start + dur + 0.03);
  }

  // A short decaying noise burst through a swept band-pass — used for the "tear".
  function _noise(start, dur, gain, fFrom, fTo) {
    const n   = Math.max(1, Math.floor(_ctx.sampleRate * dur));
    const buf = _ctx.createBuffer(1, n, _ctx.sampleRate);
    const d   = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = _ctx.createBufferSource(); src.buffer = buf;
    const filt = _ctx.createBiquadFilter(); filt.type = 'bandpass';
    filt.frequency.setValueAtTime(fFrom, start);
    filt.frequency.exponentialRampToValueAtTime(fTo, start + dur);
    const g = _ctx.createGain();
    g.gain.setValueAtTime(gain, start);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    src.connect(filt).connect(g).connect(_master);
    src.start(start); src.stop(start + dur + 0.03);
  }

  // Pack open — foil "tear" then a bright chiptune reveal arpeggio + shimmer.
  function _packOpen() {
    const t = _ctx.currentTime + 0.01;
    _noise(t, 0.16, 0.13, 5000, 600);                          // rip
    const notes = [523.25, 659.25, 783.99, 1046.50];           // C5 E5 G5 C6
    notes.forEach((f, i) => _tone(f, t + 0.10 + i * 0.05, 0.13, 'square', 0.13));
    _tone(1568.0, t + 0.32, 0.20, 'triangle', 0.10);           // shimmer on top
  }

  // Shop open — a 2-note "ding-dong" door chime, rising a fifth. Soft triangle
  // bells, deliberately unlike the pack's square arpeggio.
  function _shopOpen() {
    const t = _ctx.currentTime + 0.01;
    const notes = [1046.50, 1567.98];   // C6 → G6 (up a fifth)
    notes.forEach((f, i) => {
      _tone(f,     t + i * 0.08, 0.15, 'triangle', 0.14);
      _tone(f * 2, t + i * 0.08, 0.05, 'sine',     0.04);   // bell shimmer
    });
  }

  // Shop close — the same 2 notes mirrored, falling a fifth.
  function _shopClose() {
    const t = _ctx.currentTime + 0.01;
    const notes = [1567.98, 1046.50];   // G6 → C6 (down a fifth)
    notes.forEach((f, i) => {
      _tone(f,     t + i * 0.08, 0.15, 'triangle', 0.12);
      _tone(f * 2, t + i * 0.08, 0.05, 'sine',     0.03);
    });
  }

  // Card placement — a soft, rounded "plop" (pitch drops as it lands).
  function _place() {
    const t = _ctx.currentTime + 0.005;
    _noise(t, 0.04, 0.06, 2200, 500);                 // contact tick
    _tone(440, t, 0.13, 'triangle', 0.16, 170);       // glide down = plop
  }

  // Star earned — soft wind-chimes: a few high pentatonic bells, lightly
  // randomised in pitch + timing so no two earns ring quite the same.
  function _star() {
    const t0 = _ctx.currentTime + 0.005;
    // High major pentatonic — any subset is consonant, like tuned chimes.
    const scale = [1046.50, 1174.66, 1318.51, 1567.98, 1760.00, 2093.00]; // C6 D6 E6 G6 A6 C7
    const n = 3 + (Math.random() < 0.5 ? 0 : 1);        // 3 or 4 chimes
    for (let i = 0; i < n; i++) {
      const f     = scale[(Math.random() * scale.length) | 0];
      const start = t0 + i * (0.05 + Math.random() * 0.05);   // gentle stagger
      _tone(f,     start, 0.45, 'triangle', 0.10);      // soft bell with a ring-out
      _tone(f * 2, start, 0.30, 'sine',     0.035);     // shimmer partial
    }
  }

  // Can't afford — a short low sawtooth "bzzt" (two descending blips).
  function _deny() {
    const t = _ctx.currentTime + 0.005;
    _tone(196.00, t,        0.10, 'sawtooth', 0.13);  // G3
    _tone(146.83, t + 0.10, 0.16, 'sawtooth', 0.13);  // D3 (lower)
  }

  // Generic UI panel open — a single soft note (cards / tasks side panels).
  function _uiOpen() {
    const t = _ctx.currentTime + 0.005;
    _tone(987.77, t, 0.13, 'triangle', 0.11);   // single soft B5 note
  }

  // Play a named effect. No-op unless the gate is ready (sound on + unlocked).
  function play(name) {
    if (!ready()) return;
    try {
      if      (name === 'packOpen')  _packOpen();
      else if (name === 'shopOpen')  _shopOpen();
      else if (name === 'shopClose') _shopClose();
      else if (name === 'place')     _place();
      else if (name === 'star')      _star();
      else if (name === 'deny')      _deny();
      else if (name === 'uiOpen')    _uiOpen();
    } catch (e) { /* never let audio break gameplay */ }
  }

  return { setEnabled, isEnabled, unlock, ready, ctx, play };

})();

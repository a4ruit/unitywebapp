/**
 * possession.js  —  plain script, no ES modules. Load BEFORE main.js.
 *
 * Exposes two globals used by main.js:
 *
 *   updatePossessionWS()
 *     Call inside connect() → ws.onopen so the module always has the
 *     current WebSocket reference after a reconnect.
 *
 *   handlePossessionMessage(data)
 *     Call inside ws.onmessage. Returns true if the message was a
 *     possession message (so main.js knows to skip its own routing).
 *
 * Uses the global send() helper from main.js — no direct ws.send() calls.
 *
 * ── Message protocol (plain text strings) ────────────────────────────────
 *  Outbound → server → Unity:
 *    possess_request|<clientId>
 *    sheep_input|<clientId>|<x>|<y>   (-1..1 normalised, sent at 20 fps)
 *    possess_end|<clientId>
 *
 *  Inbound ← Unity ← server:
 *    possess_granted|<clientId>|<durationSecs>
 *    possess_denied|<clientId>
 *    possess_ended|<clientId>
 *    possess_tick|<clientId>|<secsLeft>
 */

// ── Version stamp ──────────────────────────────────────────────────────────
// If you don't see this in the console on page load, your browser is serving
// cached possession.js — hard refresh (Ctrl+Shift+R) or disable cache in DevTools.
console.log('%c[possession.js] v2025-05-17 — WebRTC stats poller + MediaStream fallback',
  'color:#00c8b4; font-weight:bold');

// ── Unique ID per page load — survives reconnects, lost on refresh ─────────
const CLIENT_ID = 'web_' + Math.random().toString(36).slice(2, 11);

// ── Module-private state ───────────────────────────────────────────────────
let _possessed      = false;
let _inputInterval  = null;
let _joystickActive = false;
let _joyX           = 0;
let _joyY           = 0;
let _ui             = null;   // DOM refs, built once on load
let _peerConnection = null;   // RTCPeerConnection for the sheep-cam video stream
let _pendingIce     = [];     // ICE candidates that arrived before setRemoteDescription
let _placing        = false;  // true while user is moving a placement preview
let _placementInputInterval = null;
// Session-only: button only unlocks after the user clicks a sheep card in the
// CURRENT page-life. Reload = locked again. No persistence on purpose.
let _sheepAvailable = false;
// Clean up any leftover flag from prior versions that persisted across reloads.
try { localStorage.removeItem('possession_sheep_pulled'); } catch (e) {}

// ── Globals called by main.js ──────────────────────────────────────────────

/**
 * Re-reference the WebSocket after every (re)connect.
 * The global send() in main.js already handles the ws reference internally,
 * so we only need this to reset the "Requesting…" state if ws dropped mid-request.
 */
function updatePossessionWS() {
  // If we were waiting on a grant that never came (ws dropped), reset the button
  if (_ui && !_possessed) {
    _ui.btn.textContent   = 'Inhabit a sheep';
    _ui.btn.style.opacity = '1';
  }
}

/**
 * Route inbound WebSocket messages.
 * Returns true if the message was a possession message (main.js should skip it).
 */
function handlePossessionMessage(data) {
  if (typeof data !== 'string') return false;

  // Server may prefix with "web:" — strip it
  const msg = data.startsWith('web:') ? data.slice(4).trim() : data.trim();

  if (msg.startsWith('possess_granted|')) {
    const parts = msg.split('|');            // [0]=cmd [1]=clientId [2]=duration
    if (parts[1] === CLIENT_ID) { _onGranted(Number(parts[2])); return true; }
  }
  if (msg.startsWith('possess_denied|')) {
    const parts = msg.split('|');
    if (parts[1] === CLIENT_ID) { _onDenied(); return true; }
  }
  if (msg.startsWith('possess_ended|')) {
    const parts = msg.split('|');
    if (parts[1] === CLIENT_ID) { _onEnded(); return true; }
  }
  if (msg.startsWith('possess_tick|')) {
    const parts = msg.split('|');            // [1]=clientId [2]=secsLeft
    if (parts[1] === CLIENT_ID) { _onTick(Number(parts[2])); return true; }
  }

  // Unity broadcasts this every time the possessed sheep eats a Resource.
  // Format: sheep_ate|clientId|totalEaten
  if (msg.startsWith('sheep_ate|')) {
    const parts = msg.split('|');
    if (parts[1] === CLIENT_ID) { _onSheepAte(Number(parts[2])); return true; }
  }

  // ── Placement lifecycle ──────────────────────────────────────────────────
  if (msg.startsWith('placement_granted|')) {
    const parts = msg.split('|');     // [1]=clientId [2]=duration [3]=cardName
    if (parts[1] === CLIENT_ID) { _onPlacementGranted(parts[3]); return true; }
  }
  if (msg.startsWith('placement_denied|')) {
    const parts = msg.split('|');
    if (parts[1] === CLIENT_ID) { _onPlacementDenied(); return true; }
  }
  if (msg.startsWith('placement_done|')) {
    const parts = msg.split('|');
    if (parts[1] === CLIENT_ID) { _onPlacementDone(); return true; }
  }

  // Unity announces this every time a critter-pack common card spawns a sheep.
  // Unlocks the "Inhabit a sheep" button (and remembers across page reloads).
  // Match defensively: trims, accepts pipe-suffixed variants too.
  if (msg === 'sheep_spawned' || msg.startsWith('sheep_spawned|') || msg.startsWith('sheep_spawned ')) {
    _onSheepSpawned();
    return true;
  }

  // Unity sends the WebRTC offer once the possession camera is ready.
  // SDP may contain '|', so we rejoin everything after the clientId field.
  if (msg.startsWith('webrtc_offer|')) {
    const firstPipe  = msg.indexOf('|');
    const secondPipe = msg.indexOf('|', firstPipe + 1);
    if (secondPipe >= 0) {
      const clientId = msg.slice(firstPipe + 1, secondPipe);
      if (clientId === CLIENT_ID) {
        const sdp = msg.slice(secondPipe + 1);
        _handleOffer(sdp);   // async — returns a promise we intentionally don't await
        return true;
      }
    }
  }

  // Trickle ICE candidate from Unity (offerer side).
  // Format: webrtc_offer_ice|clientId|candidate|sdpMid|sdpMLineIndex
  if (msg.startsWith('webrtc_offer_ice|')) {
    const p = msg.split('|');
    if (p.length >= 5 && p[1] === CLIENT_ID) {
      const ice = {
        candidate:     p[2],
        sdpMid:        p[3],
        sdpMLineIndex: parseInt(p[4], 10),
      };
      if (!ice.candidate) return true;   // end-of-candidates sentinel

      // If remote description isn't set yet, queue. Otherwise add immediately.
      if (_peerConnection && _peerConnection.remoteDescription) {
        _peerConnection.addIceCandidate(new RTCIceCandidate(ice))
          .catch(err => console.warn('[WebRTC] addIceCandidate failed:', err));
      } else {
        _pendingIce.push(ice);
      }
      return true;
    }
  }

  return false;
}

// ── UI ─────────────────────────────────────────────────────────────────────

function _buildUI() {
  const style = document.createElement('style');
  style.textContent = `
    #poss-root {
      position: fixed;
      inset: 0;
      pointer-events: none;
      z-index: 9999;
      font-family: monospace;
    }

    /* ── Possess button ── */
    #poss-btn {
      pointer-events: all;
      position: absolute;
      bottom: 140px;
      left: 50%;
      transform: translateX(-50%);
      padding: 12px 28px;
      background: rgba(0,200,180,0.12);
      border: 2px solid rgba(0,200,180,0.6);
      color: #00c8b4;
      font-size: 13px;
      letter-spacing: 2px;
      text-transform: uppercase;
      cursor: pointer;
      border-radius: 3px;
      transition: background 0.2s, opacity 0.2s;
      white-space: nowrap;
    }
    #poss-btn:active { background: rgba(0,200,180,0.3); }
    #poss-btn.poss-hidden { display: none; }

    /* ── Countdown bar ── */
    #poss-timer {
      position: absolute;
      top: 22px;
      left: 50%;
      transform: translateX(-50%);
      color: rgba(255,255,255,0.85);
      font-size: 12px;
      letter-spacing: 2px;
      text-transform: uppercase;
      text-shadow: 0 0 10px #00c8b4;
      display: none;
      white-space: nowrap;
      z-index: 2;
    }
    /* ── Eaten counter ── */
    #poss-eaten {
      position: absolute;
      top: 46px;
      left: 50%;
      transform: translateX(-50%);
      color: #ffb030;
      font-size: 11px;
      letter-spacing: 3px;
      text-transform: uppercase;
      text-shadow: 0 0 8px rgba(255,176,48,0.7);
      display: none;
      white-space: nowrap;
      z-index: 2;
      transition: transform 0.15s ease-out;
    }
    #poss-eaten.bump {
      transform: translateX(-50%) scale(1.25);
    }

    /* ── Sheep-cam framed as a trading card ──
       Wrap is 5:7 portrait (matches three.js card aspect).
       Video fills the entire card space. Frame overlays on top so its
       pixel-art border decoration sits ON the video edges. */
    #poss-video-wrap {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -54%);   /* vertical center, slight upward bias for the joystick below */
      width: min(55vw, 220px);
      aspect-ratio: 5 / 7;
      display: none;
    }
    /* Art window fills the ENTIRE wrap — video covers the whole card area. */
    #poss-art-window {
      position: absolute;
      inset: 0;
      overflow: hidden;
      background: #000;
    }
    #poss-video {
      width: 100%;
      height: 100%;
      /* cover = scales video to fill, cropping sides — gives the
         "vertical slice" look without squishing the source. */
      object-fit: cover;
      display: block;
      background: #000;
    }
    /* Frame is the LAST child so it renders ON TOP of the video. */
    #poss-card-frame {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      image-rendering: pixelated;
      user-select: none;
      -webkit-user-drag: none;
    }
    #poss-video-label {
      position: absolute;
      inset: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 10px;
      color: rgba(0,200,180,0.85);
      font-size: 11px;
      letter-spacing: 3px;
      text-shadow: 0 0 8px rgba(0,200,180,0.4);
    }
    #poss-video-label .dots span {
      display: inline-block;
      opacity: 0.2;
      animation: poss-dot-fade 1.4s infinite;
    }
    #poss-video-label .dots span:nth-child(2) { animation-delay: 0.2s; }
    #poss-video-label .dots span:nth-child(3) { animation-delay: 0.4s; }
    @keyframes poss-dot-fade {
      0%, 100% { opacity: 0.2; }
      40%      { opacity: 1; }
    }
    #poss-loading-bar {
      position: relative;
      width: 65%;
      height: 10px;
      background: rgba(0,200,180,0.10);
      border: 1px solid rgba(0,200,180,0.6);
      overflow: hidden;
      image-rendering: pixelated;
      padding: 1px;
      box-sizing: border-box;
    }
    /* The fill: 20 discrete chunks over 10 seconds, holds at 100%.
       Animation only runs while the .is-loading class is present. */
    #poss-loading-bar::after {
      content: '';
      display: block;
      height: 100%;
      width: 0%;
      background: #00c8b4;
      box-shadow: 0 0 6px rgba(0,200,180,0.5);
    }
    #poss-loading-bar.is-loading::after {
      animation: poss-pixel-fill 10s steps(20) forwards;
    }
    @keyframes poss-pixel-fill {
      from { width: 0%;   }
      to   { width: 100%; }
    }

    /* ── Virtual joystick ── */
    #poss-joy-zone {
      pointer-events: all;
      position: absolute;
      bottom: 28px;
      left: 50%;
      transform: translateX(-50%);
      width: 156px;
      height: 156px;
      display: none;
      touch-action: none;
    }
    #poss-joy-bg {
      position: absolute;
      inset: 0;
      border-radius: 50%;
      background: rgba(255,255,255,0.05);
      border: 2px solid rgba(255,255,255,0.15);
    }
    #poss-joy-knob {
      position: absolute;
      width: 54px;
      height: 54px;
      border-radius: 50%;
      background: rgba(0,200,180,0.5);
      border: 2px solid rgba(0,200,180,0.85);
      top: 50%;
      left: 50%;
      transform: translate(-50%,-50%);
    }

    /* ── Placement modal — fullscreen overlay + card housing the joystick ── */
    #poss-place-overlay {
      pointer-events: all;             /* catches ALL events, blocks background */
      position: fixed;
      inset: 0;
      background: rgba(5, 8, 12, 0.75);
      z-index: 100;                    /* above all other poss-root children */
      display: none;
      align-items: center;
      justify-content: center;
      animation: poss-overlay-fade 0.22s ease-out;
    }
    #poss-place-overlay.active { display: flex; }
    @keyframes poss-overlay-fade {
      from { background: rgba(5, 8, 12, 0); }
      to   { background: rgba(5, 8, 12, 0.75); }
    }

    #poss-place-card {
      position: relative;
      width: min(82vw, 320px);
      /* Height auto-derived from the PNG's natural aspect ratio. */
    }
    /* Opaque backdrop INSIDE the frame's art window — kills page bleed-through
       while leaving the frame's transparent corners untouched. Adjust the
       inset to match your frame's actual visible-edge if needed. */
    #poss-place-card-backdrop {
      position: absolute;
      top: 6%;
      bottom: 6%;
      left: 6%;
      right: 6%;
      background: rgba(8, 12, 18, 0.95);
      z-index: 0;
    }
    #poss-place-card-frame {
      display: block;
      width: 100%;
      height: auto;                    /* preserve PNG's native aspect ratio */
      pointer-events: none;
      image-rendering: pixelated;
      user-select: none;
      -webkit-user-drag: none;
      position: relative;
      z-index: 2;                      /* on top of backdrop AND content */
    }
    #poss-place-card-content {
      position: absolute;
      top: 13%;
      bottom: 11%;
      left: 14%;
      right: 14%;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: space-between;
      z-index: 1;                      /* above backdrop, below frame border */
    }
    #poss-place-card-header {
      color: #ffb030;
      font-family: monospace;
      font-size: 11px;
      letter-spacing: 3px;
      text-transform: uppercase;
      text-shadow: 0 0 8px rgba(255,176,48,0.7);
      text-align: center;
      line-height: 1.5;
      padding-top: 4%;
    }

    /* When joystick + PLACE button are children of the card, override their
       fixed bottom/right positioning so they flow inside the card content. */
    #poss-place-card-content #poss-joy-zone {
      position: relative !important;
      top: auto !important; bottom: auto !important;
      left: auto !important; right: auto !important;
      transform: none !important;
    }
    #poss-place-card-content #poss-place {
      position: relative !important;
      top: auto !important; bottom: auto !important;
      left: auto !important; right: auto !important;
    }

    /* ── PLACE button (right thumb, replaces EAT during placement) ── */
    #poss-place {
      pointer-events: all;
      position: absolute;
      bottom: 56px;
      right: 24px;
      width: 86px;
      height: 86px;
      border-radius: 50%;
      background: rgba(80,220,140,0.18);
      border: 2px solid rgba(80,220,140,0.85);
      color: #50dc8c;
      font-family: monospace;
      font-size: 16px;
      letter-spacing: 3px;
      text-transform: uppercase;
      cursor: pointer;
      display: none;
      align-items: center;        /* centers PLACE text vertically inside the circle */
      justify-content: center;    /* centers it horizontally */
      text-align: center;
      padding: 0;                 /* button user-agent style adds asymmetric padding */
      text-shadow: 0 0 8px rgba(80,220,140,0.7);
      box-shadow: 0 0 12px rgba(80,220,140,0.4);
      transition: transform 0.08s ease-out, background 0.1s;
      user-select: none;
      -webkit-tap-highlight-color: transparent;
      touch-action: manipulation;
    }
    #poss-place:active {
      background: rgba(80,220,140,0.45);
      transform: scale(0.92);
    }

    /* ── Eat button (right thumb, mirrors joystick) ── */
    #poss-eat {
      pointer-events: all;
      position: absolute;
      bottom: 56px;
      right: 24px;
      width: 86px;
      height: 86px;
      border-radius: 50%;
      background: rgba(255,176,48,0.18);
      border: 2px solid rgba(255,176,48,0.85);
      color: #ffb030;
      font-family: monospace;
      font-size: 16px;
      letter-spacing: 3px;
      text-transform: uppercase;
      cursor: pointer;
      display: none;
      align-items: center;
      justify-content: center;
      text-align: center;
      padding: 0;
      text-shadow: 0 0 8px rgba(255,176,48,0.7);
      box-shadow: 0 0 12px rgba(255,176,48,0.4);
      transition: transform 0.08s ease-out, background 0.1s;
      user-select: none;
      -webkit-tap-highlight-color: transparent;
      touch-action: manipulation;
    }
    #poss-eat:active {
      background: rgba(255,176,48,0.45);
      transform: scale(0.92);
    }

    /* ── Release button (appears during possession) ── */
    #poss-release {
      pointer-events: all;
      position: absolute;
      bottom: 202px;
      left: 50%;
      transform: translateX(-50%);
      padding: 6px 18px;
      background: transparent;
      border: 1px solid rgba(255,255,255,0.2);
      color: rgba(255,255,255,0.35);
      font-size: 11px;
      letter-spacing: 1px;
      cursor: pointer;
      border-radius: 3px;
      display: none;
      white-space: nowrap;
    }
  `;
  document.head.appendChild(style);

  const root = document.createElement('div');
  root.id = 'poss-root';
  root.innerHTML = `
    <button id="poss-btn">Inhabit a sheep</button>
    <div id="poss-timer">INHABITING — <span id="poss-secs">30</span>s</div>
    <div id="poss-eaten">EATEN — <span id="poss-eaten-count">0</span></div>
    <div id="poss-video-wrap">
      <div id="poss-art-window">
        <video id="poss-video" autoplay playsinline webkit-playsinline muted disablePictureInPicture x-webkit-airplay="deny"></video>
        <div id="poss-video-label">
          <div>CONNECTING<span class="dots"><span>.</span><span>.</span><span>.</span></span></div>
          <div id="poss-loading-bar"></div>
        </div>
      </div>
      <img id="poss-card-frame" src="assets/common-card-sheep-stream.png" alt="" />
    </div>
    <div id="poss-joy-zone">
      <div id="poss-joy-bg"></div>
      <div id="poss-joy-knob"></div>
    </div>
    <button id="poss-eat">EAT</button>
    <button id="poss-place">PLACE</button>
    <button id="poss-release">release</button>

    <!-- Placement modal: blocks background, houses joystick + PLACE button -->
    <div id="poss-place-overlay">
      <div id="poss-place-card">
        <div id="poss-place-card-backdrop"></div>
        <div id="poss-place-card-content">
          <div id="poss-place-card-header">WILDFLOWER<br>PLACEMENT</div>
          <!-- joystick and PLACE button are moved here when placement starts -->
        </div>
        <img id="poss-place-card-frame" src="assets/common-card-sheep-stream.png" alt="" />
      </div>
    </div>
  `;
  document.body.appendChild(root);

  _ui = {
    root:             root,
    btn:              root.querySelector('#poss-btn'),
    timer:            root.querySelector('#poss-timer'),
    secs:             root.querySelector('#poss-secs'),
    eaten:            root.querySelector('#poss-eaten'),
    eatenCount:       root.querySelector('#poss-eaten-count'),
    vidWrap:          root.querySelector('#poss-video-wrap'),
    video:            root.querySelector('#poss-video'),
    vidLabel:         root.querySelector('#poss-video-label'),
    loadingBar:       root.querySelector('#poss-loading-bar'),
    joyZone:          root.querySelector('#poss-joy-zone'),
    joyKnob:          root.querySelector('#poss-joy-knob'),
    release:          root.querySelector('#poss-release'),
    eat:              root.querySelector('#poss-eat'),
    place:            root.querySelector('#poss-place'),
    placeOverlay:     root.querySelector('#poss-place-overlay'),
    placeCardContent: root.querySelector('#poss-place-card-content'),
    placeCardHeader:  root.querySelector('#poss-place-card-header'),
  };

  _ui.btn.addEventListener('click',     _requestPossession);
  _ui.release.addEventListener('click', _releasePossession);
  // Use 'touchstart' (with 'click' fallback) for zero-latency tactile feedback
  _ui.eat.addEventListener('touchstart',   e => { e.preventDefault(); _eat();          }, { passive: false });
  _ui.eat.addEventListener('click',        _eat);
  _ui.place.addEventListener('touchstart', e => { e.preventDefault(); _confirmPlace(); }, { passive: false });
  _ui.place.addEventListener('click',      _confirmPlace);
  _setupJoystick();

  // Hide the Inhabit button until at least one sheep has been pulled.
  // _sheepAvailable starts as true if localStorage remembers a prior pull.
  if (!_sheepAvailable) {
    _ui.btn.classList.add('poss-hidden');
    console.log('[possession.js] Inhabit button locked — waiting for first sheep_spawned');
  }
}

// ── Joystick ───────────────────────────────────────────────────────────────

function _setupJoystick() {
  const zone = _ui.joyZone;
  const knob = _ui.joyKnob;
  const R    = 50;   // max travel radius in px
  let ox = 0, oy = 0;

  function start(cx, cy) {
    const r = zone.getBoundingClientRect();
    ox = r.left + r.width  * 0.5;
    oy = r.top  + r.height * 0.5;
    _joystickActive = true;
    move(cx, cy);
  }

  function move(cx, cy) {
    if (!_joystickActive) return;
    let dx = cx - ox, dy = cy - oy;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d > R) { dx = dx / d * R; dy = dy / d * R; }
    knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    _joyX =  dx / R;
    _joyY = -dy / R;   // screen-Y up = Unity-Z forward
  }

  function end() {
    _joystickActive = false;
    _joyX = 0; _joyY = 0;
    knob.style.transform = 'translate(-50%,-50%)';
  }

  // Touch
  zone.addEventListener('touchstart',  e => { e.preventDefault(); start(e.touches[0].clientX, e.touches[0].clientY); }, { passive: false });
  zone.addEventListener('touchmove',   e => { e.preventDefault(); move(e.touches[0].clientX,  e.touches[0].clientY);  }, { passive: false });
  zone.addEventListener('touchend',    end);
  zone.addEventListener('touchcancel', end);

  // Mouse (for desktop testing)
  zone.addEventListener('mousedown', e => start(e.clientX, e.clientY));
  window.addEventListener('mousemove', e => { if (_joystickActive) move(e.clientX, e.clientY); });
  window.addEventListener('mouseup',   () => { if (_joystickActive) end(); });
}

// ── Possession lifecycle ───────────────────────────────────────────────────

function _requestPossession() {
  _ui.btn.textContent   = 'Requesting…';
  _ui.btn.style.opacity = '0.5';

  // ── iOS Safari autoplay priming ─────────────────────────────────────────
  // iOS only allows autoplay on a <video> if .play() was invoked at least
  // once inside a user-gesture handler. Our actual .play() happens later in
  // pc.ontrack — by then the gesture has expired. Calling .play() here
  // (synchronously, while the click event is still on the stack) gives the
  // element a "user-approved" token so it can autoplay when the stream
  // arrives asynchronously. Source-less play() throws — we swallow it.
  _ui.video.muted = true;            // double-insurance for autoplay rules
  _ui.video.play().catch(() => {});  // silent — expected to reject (no src)

  // Uses main.js global send() — already handles ws.readyState check
  send(`possess_request|${CLIENT_ID}`);
}

function _releasePossession() {
  send(`possess_end|${CLIENT_ID}`);
  _onEnded();   // optimistic — server will confirm with possess_ended
}

function _eat() {
  if (!_possessed) return;
  send(`sheep_eat|${CLIENT_ID}`);
}

function _onGranted(duration) {
  _possessed = true;

  _ui.btn.classList.add('poss-hidden');
  _ui.timer.style.display    = 'block';
  _ui.eaten.style.display    = 'block';
  _ui.eatenCount.textContent = '0';
  _ui.vidWrap.style.display  = 'block';
  _ui.vidLabel.style.display = 'flex';   // show "CONNECTING…" until first frame
  _ui.joyZone.style.display  = 'flex';
  _ui.release.style.display  = 'block';
  _ui.eat.style.display      = 'flex';
  _ui.secs.textContent       = duration;

  // Restart the 10s loading-bar animation by toggling the class with a reflow
  _ui.loadingBar.classList.remove('is-loading');
  void _ui.loadingBar.offsetWidth;        // force reflow to reset animation
  _ui.loadingBar.classList.add('is-loading');

  // Send joystick at 20 fps — always send so sheep stops when stick is centred
  _inputInterval = setInterval(() => {
    send(`sheep_input|${CLIENT_ID}|${_joyX.toFixed(3)}|${_joyY.toFixed(3)}`);
  }, 50);

  // WebRTC video: Unity will send a 'webrtc_offer|' message shortly after
  // granting possession. The offer is handled in handlePossessionMessage above.
}

function _onDenied() {
  _ui.btn.textContent   = 'Inhabit a sheep';
  _ui.btn.style.opacity = '1';
}

/**
 * Called when Unity broadcasts that a sheep has joined the colony
 * (i.e. the user pulled the common card in a critter pack).
 * Unlocks the Inhabit button and persists across reloads.
 */
function _onSheepSpawned() {
  _sheepAvailable = true;
  if (_ui && !_possessed) {
    _ui.btn.classList.remove('poss-hidden');
    console.log('[possession.js] Sheep card pulled — Inhabit button unlocked');
  }
}

function _onTick(secsLeft) {
  _ui.secs.textContent = secsLeft;
}

/**
 * Called when Unity tells us the sheep just ate something.
 * Updates the eaten counter with a brief scale-bump for feedback.
 */
function _onSheepAte(total) {
  _ui.eatenCount.textContent = total;
  _ui.eaten.classList.add('bump');
  setTimeout(() => _ui.eaten && _ui.eaten.classList.remove('bump'), 150);
}

// ── Placement (user-driven card spawning) ──────────────────────────────────

function _onPlacementGranted(cardName) {
  _placing = true;

  // Update the card header dynamically — e.g. "WILDFLOWER PLACEMENT" vs "FLOWER BUSH PLACEMENT"
  if (_ui.placeCardHeader) {
    const label = (cardName || 'WILDFLOWER').toString().toUpperCase();
    _ui.placeCardHeader.innerHTML = label + '<br>PLACEMENT';
  }

  // Move joystick + PLACE button INTO the placement card so they live
  // inside the framed modal. They retain their event listeners.
  _ui.placeCardContent.appendChild(_ui.joyZone);
  _ui.placeCardContent.appendChild(_ui.place);
  _ui.joyZone.style.display = 'flex';
  _ui.place.style.display   = 'flex';

  // Show the overlay — pointer-events:all means the entire background
  // (pack carousel, shop, stars, everything) is now uninteractable
  // until placement completes.
  _ui.placeOverlay.classList.add('active');

  // Hide the inhabit button while placing
  _ui.btn.classList.add('poss-hidden');

  // Stream joystick magnitude/direction to Unity at 20fps as placement_move
  _placementInputInterval = setInterval(() => {
    send(`placement_move|${CLIENT_ID}|${_joyX.toFixed(3)}|${_joyY.toFixed(3)}`);
  }, 50);

  console.log('[possession.js] Placement started — UI modal active, background blocked');
}

function _onPlacementDenied() {
  console.log('[possession.js] Placement denied (someone else is placing)');
  if (_sheepAvailable && _ui) _ui.btn.classList.remove('poss-hidden');
}

function _onPlacementDone() {
  _placing = false;
  clearInterval(_placementInputInterval);
  _placementInputInterval = null;
  _joyX = 0; _joyY = 0;

  // Move joystick + PLACE button back to the root so their default
  // CSS positioning takes over again for the next possession session.
  _ui.root.appendChild(_ui.joyZone);
  _ui.root.appendChild(_ui.place);

  _ui.joyZone.style.display   = 'none';
  _ui.place.style.display     = 'none';
  _ui.joyKnob.style.transform = 'translate(-50%,-50%)';

  // Hide overlay (unblocks the pack screen)
  _ui.placeOverlay.classList.remove('active');

  // Restore the inhabit button if a sheep is still available
  if (_sheepAvailable) _ui.btn.classList.remove('poss-hidden');

  console.log('[possession.js] Placement done — modal closed, background unblocked');
}

function _confirmPlace() {
  if (!_placing) return;
  send(`placement_confirm|${CLIENT_ID}`);
}

function _onEnded() {
  _possessed = false;
  clearInterval(_inputInterval);
  _joystickActive = false;
  _joyX = 0; _joyY = 0;

  // Tear down the WebRTC peer connection and clear the video element
  if (_peerConnection) {
    _peerConnection.close();
    _peerConnection = null;
  }
  _pendingIce = [];   // drop any candidates still in the queue
  _ui.video.srcObject        = null;
  _ui.vidLabel.style.display = 'flex';   // restore "CONNECTING…" loader for next session
  _ui.loadingBar.classList.remove('is-loading');  // reset bar to empty

  // ── Consume the sheep-card credit ───────────────────────────────────────
  // Each card pull grants ONE possession. Now that this one is done, lock
  // the button until a NEW sheep_spawned message arrives.
  _sheepAvailable = false;

  _ui.btn.textContent   = 'Inhabit a sheep';
  _ui.btn.style.opacity = '1';
  // Button stays hidden — _sheepAvailable is false now, so this is a no-op
  // unless the user pulls another sheep card later.
  if (_sheepAvailable) _ui.btn.classList.remove('poss-hidden');
  _ui.timer.style.display   = 'none';
  _ui.eaten.style.display   = 'none';
  _ui.vidWrap.style.display = 'none';
  _ui.joyZone.style.display = 'none';
  _ui.release.style.display = 'none';
  _ui.eat.style.display     = 'none';
  _ui.joyKnob.style.transform = 'translate(-50%,-50%)';
}

// ── WebRTC receive ─────────────────────────────────────────────────────────
//
// Called when Unity sends 'webrtc_offer|clientId|<sdp>'.
// Uses vanilla ICE: we wait for ICE gathering to complete before sending the
// answer, so no separate ICE candidate messages are needed over the broadcast
// server (which would echo them back to Unity and cause confusion).

async function _handleOffer(sdp) {
  try {
    // Ensure SDP ends with CRLF — the outer message .trim() may have stripped it
    if (!sdp.endsWith('\r\n')) sdp += '\r\n';

    const pc = new RTCPeerConnection({
      // STUN + TURN: STUN handles open NAT, TURN relays through a public
      // server for networks that block peer-to-peer (uni WiFi, guest WiFi,
      // mobile carriers with symmetric NAT). Open Relay Project — free
      // public TURN for testing. Swap for your own coturn in production.
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        {
          urls: [
            'turn:openrelay.metered.ca:80',
            'turn:openrelay.metered.ca:443',
            'turn:openrelay.metered.ca:443?transport=tcp',
          ],
          username:   'openrelayproject',
          credential: 'openrelayproject'
        }
      ]
    });

    // ── Diagnostic logging ────────────────────────────────────────────────
    pc.oniceconnectionstatechange = () =>
      console.log('[WebRTC] ICE state:', pc.iceConnectionState);
    pc.onconnectionstatechange    = () =>
      console.log('[WebRTC] Connection state:', pc.connectionState);
    pc.onsignalingstatechange     = () =>
      console.log('[WebRTC] Signaling state:', pc.signalingState);

    // ── Trickle ICE: send each browser-side candidate to Unity ────────────
    pc.onicecandidate = e => {
      if (!e.candidate) return;   // null = end-of-candidates
      const c = e.candidate;
      send(`webrtc_answer_ice|${CLIENT_ID}|${c.candidate}|${c.sdpMid}|${c.sdpMLineIndex}`);
    };

    // When the video track arrives, push it into the sheep-cam <video> element.
    // Unity WebRTC does NOT always populate e.streams[], so fall back to
    // wrapping the bare track in a new MediaStream.
    pc.ontrack = e => {
      console.log('[WebRTC] ontrack fired — kind:', e.track.kind,
                  '| streams:', e.streams.length);

      const stream = (e.streams && e.streams[0])
        ? e.streams[0]
        : new MediaStream([e.track]);

      _ui.video.srcObject = stream;

      // DON'T hide the loading label yet — wait for the first real frame.
      _ui.video.addEventListener('loadeddata', () => {
        _ui.vidLabel.style.display = 'none';
        console.log('[WebRTC] First video frame decoded — hiding loader');
      }, { once: true });

      // Aggressive play attempt — also try on 'playing' and 'canplay' events
      const tryPlay = () => _ui.video.play().catch(err => {
        console.warn('[WebRTC] video.play() rejected:', err.name);
        // If autoplay was blocked, swap the loader for a "TAP TO PLAY" prompt
        if (err.name === 'NotAllowedError') {
          _ui.vidLabel.innerHTML =
            '<div style="cursor:pointer;padding:14px 22px;border:1px solid #00c8b4;' +
            'background:rgba(0,200,180,0.15);">▶  TAP TO START</div>';
          _ui.vidLabel.onclick = () => {
            _ui.video.play().then(() => {
              _ui.vidLabel.style.display = 'none';
              _ui.vidLabel.onclick = null;
            });
          };
        }
      });
      tryPlay();
      _ui.video.addEventListener('canplay', tryPlay, { once: true });

      console.log('[WebRTC] Sheep-cam stream attached to video element');

      // ── Diagnostic: poll inbound video stats every 1s ───────────────────
      // Tells us EXACTLY whether bytes are arriving, frames are decoding, etc.
      const pollStats = async () => {
        if (!_peerConnection || _peerConnection.connectionState === 'closed') {
          clearInterval(statsTimer);
          return;
        }
        const stats = await _peerConnection.getStats();
        let found = false;
        stats.forEach(r => {
          if (r.type === 'inbound-rtp' && r.kind === 'video') {
            found = true;
            console.log('%c[WebRTC] inbound-rtp:',
              'color:#00c8b4;font-weight:bold',
              'bytes=' + r.bytesReceived,
              'packets=' + r.packetsReceived,
              'framesDecoded=' + r.framesDecoded,
              'framesDropped=' + r.framesDropped,
              'fps=' + (r.framesPerSecond || 0),
              '| <video>:', _ui.video.videoWidth + 'x' + _ui.video.videoHeight,
              'paused=' + _ui.video.paused,
              'readyState=' + _ui.video.readyState);
          }
        });
        if (!found) console.log('[WebRTC] (no inbound-rtp report yet)');
      };
      // Fire once after 500ms, then every 1s
      setTimeout(pollStats, 500);
      const statsTimer = setInterval(pollStats, 1000);
    };

    _peerConnection = pc;

    await pc.setRemoteDescription({ type: 'offer', sdp });

    // Flush any ICE candidates that arrived before we'd set remote description
    if (_pendingIce.length > 0) {
      console.log(`[WebRTC] Flushing ${_pendingIce.length} queued ICE candidates`);
      for (const ice of _pendingIce) {
        try { await pc.addIceCandidate(new RTCIceCandidate(ice)); }
        catch (err) { console.warn('[WebRTC] queued addIceCandidate failed:', err); }
      }
      _pendingIce = [];
    }

    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    // Trickle ICE: send the answer IMMEDIATELY (no candidates yet).
    // Browser candidates trickle out via pc.onicecandidate above.
    send(`webrtc_answer|${CLIENT_ID}|${pc.localDescription.sdp}`);
    console.log('[WebRTC] Answer sent to Unity — candidates trickling…');

  } catch (err) {
    console.error('[WebRTC] _handleOffer error:', err);
  }
}

// ── Boot ───────────────────────────────────────────────────────────────────
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', _buildUI);
} else {
  _buildUI();
}

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

// ── Unique ID per page load — survives reconnects, lost on refresh ─────────
const CLIENT_ID = 'web_' + Math.random().toString(36).slice(2, 11);

// ── Module-private state ───────────────────────────────────────────────────
let _possessed      = false;
let _inputInterval  = null;
let _joystickActive = false;
let _joyX           = 0;
let _joyY           = 0;
let _ui             = null;   // DOM refs, built once on load

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
      top: 18px;
      left: 50%;
      transform: translateX(-50%);
      color: rgba(255,255,255,0.85);
      font-size: 12px;
      letter-spacing: 2px;
      text-transform: uppercase;
      text-shadow: 0 0 10px #00c8b4;
      display: none;
      white-space: nowrap;
    }

    /* ── Video / sheep-cam ── */
    #poss-video-wrap {
      position: absolute;
      top: 52px;
      left: 50%;
      transform: translateX(-50%);
      width: min(90vw, 340px);
      aspect-ratio: 16/9;
      background: #000;
      border: 1px solid rgba(0,200,180,0.35);
      display: none;
      overflow: hidden;
    }
    #poss-video {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    #poss-video-label {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      color: rgba(255,255,255,0.25);
      font-size: 11px;
      letter-spacing: 2px;
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
    <div id="poss-video-wrap">
      <video id="poss-video" autoplay playsinline muted></video>
      <div id="poss-video-label">SHEEP CAM</div>
    </div>
    <div id="poss-joy-zone">
      <div id="poss-joy-bg"></div>
      <div id="poss-joy-knob"></div>
    </div>
    <button id="poss-release">release</button>
  `;
  document.body.appendChild(root);

  _ui = {
    btn:      root.querySelector('#poss-btn'),
    timer:    root.querySelector('#poss-timer'),
    secs:     root.querySelector('#poss-secs'),
    vidWrap:  root.querySelector('#poss-video-wrap'),
    video:    root.querySelector('#poss-video'),
    vidLabel: root.querySelector('#poss-video-label'),
    joyZone:  root.querySelector('#poss-joy-zone'),
    joyKnob:  root.querySelector('#poss-joy-knob'),
    release:  root.querySelector('#poss-release'),
  };

  _ui.btn.addEventListener('click',     _requestPossession);
  _ui.release.addEventListener('click', _releasePossession);
  _setupJoystick();
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
  // Uses main.js global send() — already handles ws.readyState check
  send(`possess_request|${CLIENT_ID}`);
}

function _releasePossession() {
  send(`possess_end|${CLIENT_ID}`);
  _onEnded();   // optimistic — server will confirm with possess_ended
}

function _onGranted(duration) {
  _possessed = true;

  _ui.btn.classList.add('poss-hidden');
  _ui.timer.style.display   = 'block';
  _ui.vidWrap.style.display = 'block';
  _ui.joyZone.style.display = 'flex';
  _ui.release.style.display = 'block';
  _ui.secs.textContent      = duration;

  // Send joystick at 20 fps — always send so sheep stops when stick is centred
  _inputInterval = setInterval(() => {
    send(`sheep_input|${CLIENT_ID}|${_joyX.toFixed(3)}|${_joyY.toFixed(3)}`);
  }, 50);

  // ── WebRTC video slot ────────────────────────────────────────────────────
  // Uncomment when Unity WebRTC package is wired up:
  //   _startWebRTCReceive();
  // ────────────────────────────────────────────────────────────────────────
}

function _onDenied() {
  _ui.btn.textContent   = 'Inhabit a sheep';
  _ui.btn.style.opacity = '1';
}

function _onTick(secsLeft) {
  _ui.secs.textContent = secsLeft;
}

function _onEnded() {
  _possessed = false;
  clearInterval(_inputInterval);
  _joystickActive = false;
  _joyX = 0; _joyY = 0;

  _ui.btn.textContent   = 'Inhabit a sheep';
  _ui.btn.style.opacity = '1';
  _ui.btn.classList.remove('poss-hidden');
  _ui.timer.style.display   = 'none';
  _ui.vidWrap.style.display = 'none';
  _ui.joyZone.style.display = 'none';
  _ui.release.style.display = 'none';
  _ui.joyKnob.style.transform = 'translate(-50%,-50%)';
}

// ── WebRTC scaffold (future — requires com.unity.webrtc on Unity side) ─────
//
// async function _startWebRTCReceive() {
//   const pc = new RTCPeerConnection({
//     iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
//   });
//   pc.ontrack = (e) => {
//     _ui.video.srcObject        = e.streams[0];
//     _ui.vidLabel.style.display = 'none';
//   };
//   pc.onicecandidate = (e) => {
//     if (e.candidate)
//       send(`webrtc_ice|${CLIENT_ID}|${JSON.stringify(e.candidate)}`);
//   };
//   // Add to handlePossessionMessage:
//   // if (msg.startsWith('webrtc_offer|')) {
//   //   const [,cid,...rest] = msg.split('|'); const sdp = rest.join('|');
//   //   if (cid === CLIENT_ID) {
//   //     await pc.setRemoteDescription({ type:'offer', sdp });
//   //     const ans = await pc.createAnswer();
//   //     await pc.setLocalDescription(ans);
//   //     send(`webrtc_answer|${CLIENT_ID}|${ans.sdp}`);
//   //   }
//   // }
// }

// ── Boot ───────────────────────────────────────────────────────────────────
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', _buildUI);
} else {
  _buildUI();
}

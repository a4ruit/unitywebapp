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
      width: 60%;
      height: 2px;
      background: rgba(0,200,180,0.15);
      overflow: hidden;
    }
    #poss-loading-bar::after {
      content: '';
      position: absolute;
      top: 0; bottom: 0;
      width: 40%;
      background: linear-gradient(90deg, transparent, #00c8b4, transparent);
      animation: poss-loading-slide 1.4s ease-in-out infinite;
    }
    @keyframes poss-loading-slide {
      0%   { left: -40%; }
      100% { left: 100%; }
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
      <div id="poss-video-label">
        <div>CONNECTING<span class="dots"><span>.</span><span>.</span><span>.</span></span></div>
        <div id="poss-loading-bar"></div>
      </div>
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
  _ui.timer.style.display    = 'block';
  _ui.vidWrap.style.display  = 'block';
  _ui.vidLabel.style.display = 'flex';   // show "CONNECTING…" until first frame
  _ui.joyZone.style.display  = 'flex';
  _ui.release.style.display  = 'block';
  _ui.secs.textContent       = duration;

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

function _onTick(secsLeft) {
  _ui.secs.textContent = secsLeft;
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
  _ui.video.srcObject        = null;
  _ui.vidLabel.style.display = 'flex';   // restore "CONNECTING…" loader for next session

  _ui.btn.textContent   = 'Inhabit a sheep';
  _ui.btn.style.opacity = '1';
  _ui.btn.classList.remove('poss-hidden');
  _ui.timer.style.display   = 'none';
  _ui.vidWrap.style.display = 'none';
  _ui.joyZone.style.display = 'none';
  _ui.release.style.display = 'none';
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
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    });

    // ── Diagnostic logging ────────────────────────────────────────────────
    pc.oniceconnectionstatechange = () =>
      console.log('[WebRTC] ICE state:', pc.iceConnectionState);
    pc.onconnectionstatechange    = () =>
      console.log('[WebRTC] Connection state:', pc.connectionState);
    pc.onsignalingstatechange     = () =>
      console.log('[WebRTC] Signaling state:', pc.signalingState);

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
      // The 'loadeddata' event fires when the browser has decoded a frame.
      _ui.video.addEventListener('loadeddata', () => {
        _ui.vidLabel.style.display = 'none';
        console.log('[WebRTC] First video frame decoded — hiding loader');
      }, { once: true });

      // Some browsers (mobile Safari) don't autoplay even with `autoplay muted`
      _ui.video.play().catch(err =>
        console.warn('[WebRTC] video.play() rejected:', err));

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

    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    // Vanilla ICE: wait until all candidates are gathered before sending the answer
    if (pc.iceGatheringState !== 'complete') {
      await new Promise(resolve => {
        pc.addEventListener('icegatheringstatechange', function handler() {
          if (pc.iceGatheringState === 'complete') {
            pc.removeEventListener('icegatheringstatechange', handler);
            resolve();
          }
        });
      });
    }

    // Send the full answer SDP (ICE bundled) back to Unity via the server
    send(`webrtc_answer|${CLIENT_ID}|${pc.localDescription.sdp}`);
    console.log('[WebRTC] Answer sent to Unity');

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

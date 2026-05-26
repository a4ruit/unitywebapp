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
console.log('%c[possession.js] v2026-05-26d — boss spawn haptics',
  'color:#00c8b4; font-weight:bold');

// ── TURN server configuration ──────────────────────────────────────────────
// Fill these in with your self-hosted coturn VPS details. Leave host empty
// to fall through to the openrelay public TURN only.
// (When you deploy to production, sync these with the Inspector values on
// SheepPossessionManager so Unity & browser hit the SAME TURN server.)
const TURN_HOST     = '209.38.22.49';
const TURN_PORT     = 3478;
const TURN_USERNAME = 'swipe2pull';
const TURN_PASSWORD = 'Tan440tive4!!';

// ── Unique ID per page load — survives reconnects, lost on refresh ─────────
const CLIENT_ID = 'web_' + Math.random().toString(36).slice(2, 11);

// ── Module-private state ───────────────────────────────────────────────────
let _possessed      = false;
let _inputInterval  = null;
let _joystickActive = false;
let _joyX           = 0;
let _joyY           = 0;

// ── Joystick send-rate limiter ──────────────────────────────────────────────
// The input loops below tick at 20 Hz, but we only actually transmit when
// the stick value has changed (with a small deadzone) OR when the keep-alive
// window has elapsed. With 3–4 simultaneous players this drops idle traffic
// from constant 80–160 msg/sec down to ~4 msg/sec, which keeps the WS server
// (and the Node event loop hosting it) from getting flooded.
//
// _markInputSent() is called immediately AFTER every send; _shouldSendInput()
// is what each interval polls to decide whether this tick gets transmitted.
// Calling _resetInputSendTracking() forces the next tick to send unconditionally
// — used at the start of every new possession / placement session so Unity
// always gets a fresh authoritative value at hand-over.
const INPUT_DEADZONE     = 0.015;   // ~1.5% of full stick deflection
const INPUT_KEEPALIVE_MS = 750;     // worst-case "I'm still here, stick is X"
let _lastSentX = 0;
let _lastSentY = 0;
let _lastSentT = 0;
function _shouldSendInput() {
  if (Math.abs(_joyX - _lastSentX) > INPUT_DEADZONE) return true;
  if (Math.abs(_joyY - _lastSentY) > INPUT_DEADZONE) return true;
  if (performance.now() - _lastSentT > INPUT_KEEPALIVE_MS) return true;
  return false;
}
function _markInputSent() {
  _lastSentX = _joyX;
  _lastSentY = _joyY;
  _lastSentT = performance.now();
}
function _resetInputSendTracking() {
  // Setting _lastSentT to 0 forces _shouldSendInput() to return true on the
  // first poll (since now - 0 always exceeds KEEPALIVE_MS), so the next
  // tick fires regardless of joystick state.
  _lastSentX = NaN;   // NaN compares >DEADZONE for any real value
  _lastSentY = NaN;
  _lastSentT = 0;
}
let _ui             = null;   // DOM refs, built once on load
let _peerConnection = null;   // RTCPeerConnection for the sheep-cam video stream
let _pendingIce     = [];     // ICE candidates that arrived before setRemoteDescription
let _placing        = false;  // true while user is moving a placement preview
let _placementInputInterval = null;
// Duration of the current possession session — captured at _onGranted time so
// the GBC "TIME" stat can render as "cur/total" (e.g. 023/030) like an RPG HP bar.
let _grantDuration  = 30;
// Session-only: button only unlocks after the user clicks a sheep card in the
// CURRENT page-life. Reload = locked again. No persistence on purpose.
let _sheepAvailable = false;
let _duckAvailable  = false;
let _foxAvailable   = false;
// Which creature is currently possessed — drives which WS verbs to send for
// joystick input + action button. Null when nothing is being possessed.
//   'sheep' → sheep_input / sheep_eat / possess_end
//   'duck'  → duck_input  / duck_flap / duck_possess_end
//   'fox'   → fox_input   / fox_pounce / fox_possess_end
//   'box'   → box_input   / box_open  / box_possess_end
let _creatureType   = null;
// Clean up any leftover flag from prior versions that persisted across reloads.
try { localStorage.removeItem('possession_sheep_pulled'); } catch (e) {}

// ── Blind Box possession state ────────────────────────────────────────────
// Entirely independent of critter possession. The box is a horror-phase
// object that stays in the world after each session, so the credit is
// NOT consumed — the same player can re-inhabit it until the box is eaten.
let _blindBoxAvailable = false;

// ── Fungi spore state ─────────────────────────────────────────────────────
// Entirely independent of possession sessions — the mushroom keeps existing
// on the ground after the possession timer expires.
let _sporeOwned         = false;  // this client has a living placed mushroom
let _sporeCooldownTimer = null;   // setInterval counting down active + cooldown
let _sporeCooldownSecs  = 0;      // seconds remaining in the blocked window

// ── Globals called by main.js ──────────────────────────────────────────────

/**
 * Re-reference the WebSocket after every (re)connect.
 * The global send() in main.js already handles the ws reference internally,
 * so we only need this to reset the "Requesting…" state if ws dropped mid-request.
 */
function updatePossessionWS() {
  // If we were waiting on a grant that never came (ws dropped), reset both
  // buttons so the user isn't stuck looking at "Requesting…".
  if (_ui && !_possessed) {
    _ui.btn.textContent       = 'Inhabit a sheep';
    _ui.btn.style.opacity     = '1';
    _ui.duckBtn.textContent   = 'Inhabit a duck';
    _ui.duckBtn.style.opacity = '1';
    _ui.foxBtn.textContent    = 'Inhabit a fox';
    _ui.foxBtn.style.opacity  = '1';
    _ui.boxBtn.textContent    = 'Inhabit the Blind Box';
    _ui.boxBtn.style.opacity  = '1';
  }

  // ── Connected-clients heartbeat ──────────────────────────────────────────
  // Tell Unity we're here. Unity tracks the count via the QR banner's
  // "X / Y PLAYERS" counter so visitors can see how busy the install is
  // BEFORE they tap "Inhabit". Without these pings, Unity only knows about
  // phones that are mid-possession — idle browsers wouldn't be counted.
  _startHeartbeat();
}

/**
 * Called by main.js when a placement-eligible card (wildflower, flower bush,
 * fungi) is tapped. Sends the placement request to Unity via the WebSocket.
 *   cardType  — 'wildflower' | 'flowerbush' | 'fungi' | 'mushroom'
 *   rarity    — 'common' | 'uncommon' | 'rare' …
 *   cardName  — display label used for the placement modal header
 */
function requestPlacement(cardType, rarity, cardName) {
  send(`placement_request|${CLIENT_ID}|${cardType}|${rarity}|${cardName || cardType}`);
  console.log('[possession.js] Placement requested:', cardType, rarity, cardName);
}

// Internal heartbeat machinery — kept module-private so main.js doesn't need
// to know it exists. _startHeartbeat is idempotent (safe to call on every WS
// reconnect; only one interval ever runs).
let _heartbeatInterval = null;
function _startHeartbeat() {
  // Fire an immediate hello so Unity counts us before the first ping interval
  send(`client_hello|${CLIENT_ID}`);

  if (_heartbeatInterval) return;   // already running

  _heartbeatInterval = setInterval(() => {
    send(`client_ping|${CLIENT_ID}`);
  }, 5000);   // every 5s — matches Unity's clientStaleSeconds=15 budget (3 pings of grace)

  // Best-effort goodbye on page close. Mobile browsers often kill the WS
  // before this fires, which is why Unity prunes by heartbeat staleness too.
  window.addEventListener('beforeunload', () => {
    try { send(`client_bye|${CLIENT_ID}`); } catch (e) {}
  });
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
    if (parts[1] === CLIENT_ID) { _onGranted(Number(parts[2]), 'sheep'); return true; }
  }
  if (msg.startsWith('possess_denied|')) {
    const parts = msg.split('|');
    if (parts[1] === CLIENT_ID) { _onDenied('sheep'); return true; }
  }
  if (msg.startsWith('possess_ended|')) {
    const parts = msg.split('|');
    if (parts[1] === CLIENT_ID) { _onEnded(); return true; }
  }
  if (msg.startsWith('possess_tick|')) {
    const parts = msg.split('|');            // [1]=clientId [2]=secsLeft
    if (parts[1] === CLIENT_ID) { _onTick(Number(parts[2])); return true; }
  }

  // ── Duck possession lifecycle (mirrors sheep) ──────────────────────────────
  if (msg.startsWith('duck_possess_granted|')) {
    const parts = msg.split('|');
    if (parts[1] === CLIENT_ID) { _onGranted(Number(parts[2]), 'duck'); return true; }
  }
  if (msg.startsWith('duck_possess_denied|')) {
    const parts = msg.split('|');
    if (parts[1] === CLIENT_ID) { _onDenied('duck'); return true; }
  }
  if (msg.startsWith('duck_possess_ended|')) {
    const parts = msg.split('|');
    if (parts[1] === CLIENT_ID) { _onEnded(); return true; }
  }
  if (msg.startsWith('duck_possess_tick|')) {
    const parts = msg.split('|');
    if (parts[1] === CLIENT_ID) { _onTick(Number(parts[2])); return true; }
  }
  // Optional confirmation from Unity each time the duck successfully flapped
  // (matches sheep_ate pattern). Currently we don't display a counter for it,
  // but we swallow the message so the routing log stays clean.
  if (msg.startsWith('duck_flapped|')) {
    const parts = msg.split('|');
    if (parts[1] === CLIENT_ID) { _onDuckFlapped(Number(parts[2])); return true; }
  }
  // Same per-phone filter as sheep_spawned — only the originating CLIENT_ID
  // unlocks. Untagged broadcasts are ignored (cross-tenant safety).
  if (msg === 'duck_spawned' || msg.startsWith('duck_spawned|') || msg.startsWith('duck_spawned ')) {
    const parts     = msg.split('|');
    const spawnerId = parts[1];
    if (spawnerId === CLIENT_ID) _onDuckSpawned();
    return true;
  }

  // ── Fox possession lifecycle ───────────────────────────────────────────────
  if (msg.startsWith('fox_possess_granted|')) {
    const parts = msg.split('|');
    if (parts[1] === CLIENT_ID) { _onGranted(Number(parts[2]), 'fox'); return true; }
  }
  if (msg.startsWith('fox_possess_denied|')) {
    const parts = msg.split('|');
    if (parts[1] === CLIENT_ID) { _onDenied('fox'); return true; }
  }
  if (msg.startsWith('fox_possess_ended|')) {
    const parts = msg.split('|');
    if (parts[1] === CLIENT_ID) { _onEnded(); return true; }
  }
  if (msg.startsWith('fox_possess_tick|')) {
    const parts = msg.split('|');
    if (parts[1] === CLIENT_ID) { _onTick(Number(parts[2])); return true; }
  }
  if (msg.startsWith('fox_pounced|')) {
    const parts = msg.split('|');
    if (parts[1] === CLIENT_ID) { _onFoxPounced(Number(parts[2])); return true; }
  }
  if (msg === 'fox_spawned' || msg.startsWith('fox_spawned|') || msg.startsWith('fox_spawned ')) {
    const parts     = msg.split('|');
    const spawnerId = parts[1];
    if (spawnerId === CLIENT_ID) _onFoxSpawned();
    return true;
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
  // The broadcast goes to EVERY connected phone, so we filter by the trailing
  // clientId tag — only the phone that actually pulled the card unlocks its
  // button. Bare "sheep_spawned" (no tag) is treated as legacy/global noise
  // and ignored, since otherwise idle phones would falsely unlock.
  if (msg === 'sheep_spawned' || msg.startsWith('sheep_spawned|') || msg.startsWith('sheep_spawned ')) {
    const parts     = msg.split('|');
    const spawnerId = parts[1];
    if (spawnerId === CLIENT_ID) _onSheepSpawned();
    return true;
  }

  // ── Fungi spore lifecycle ──────────────────────────────────────────────────
  // fungi_placed|clientId|cooldownSecs — mushroom confirmed on ground, show spore panel
  if (msg.startsWith('fungi_placed|')) {
    const parts = msg.split('|');
    if (parts[1] === CLIENT_ID) { _onFungiPlaced(Number(parts[2])); return true; }
  }
  // fungi_spore_activated|clientId|duration|cooldown — cloud is now live in Unity
  if (msg.startsWith('fungi_spore_activated|')) {
    const parts = msg.split('|');
    if (parts[1] === CLIENT_ID) { _onSporeActivated(Number(parts[2]), Number(parts[3])); return true; }
  }
  // fungi_spore_cooldown|clientId|secsLeft — Unity rejected request (already on cooldown)
  if (msg.startsWith('fungi_spore_cooldown|')) {
    const parts = msg.split('|');
    if (parts[1] === CLIENT_ID) { _onSporeOnCooldown(Number(parts[2])); return true; }
  }
  // fungi_destroyed|clientId — mushroom was eaten; dismiss the spore panel
  if (msg.startsWith('fungi_destroyed|')) {
    const parts = msg.split('|');
    if (parts[1] === CLIENT_ID) { _onFungiDestroyed(); return true; }
  }

  // ── Blind Box lifecycle ───────────────────────────────────────────────────
  // Only the player who pulled the card receives blind_box_spawned — same
  // clientId-tag filter as sheep_spawned / duck_spawned.
  if (msg.startsWith('blind_box_spawned|')) {
    const parts     = msg.split('|');
    const spawnerId = parts[1];
    if (spawnerId === CLIENT_ID) _onBoxSpawned();
    return true;
  }
  if (msg.startsWith('box_possess_granted|')) {
    const parts = msg.split('|');
    if (parts[1] === CLIENT_ID) { _onBoxGranted(Number(parts[2])); return true; }
  }
  if (msg.startsWith('box_possess_denied|')) {
    const parts = msg.split('|');
    if (parts[1] === CLIENT_ID) { _onBoxDenied(); return true; }
  }
  if (msg.startsWith('box_possess_ended|')) {
    const parts = msg.split('|');
    if (parts[1] === CLIENT_ID) { _onEnded(); return true; }
  }
  if (msg.startsWith('box_possess_tick|')) {
    const parts = msg.split('|');
    if (parts[1] === CLIENT_ID) { _onBoxTick(Number(parts[2])); return true; }
  }
  if (msg.startsWith('box_lings_released|')) {
    const parts = msg.split('|');
    if (parts[1] === CLIENT_ID) {
      // Disable the OPEN BOX button — one shot per session
      if (_ui.openBox) {
        _ui.openBox.disabled  = true;
        _ui.openBox.innerHTML = '&#x2713; RELEASED';
      }
      return true;
    }
  }

  // ── Horror phase broadcasts (no clientId filter — sent to ALL phones) ────────
  // Format: boss_spawned|{maxHP}
  // Unity broadcasts this the moment FleshBoss.Spawn() completes. Every
  // connected phone receives it, so we vibrate all of them simultaneously.
  if (msg.startsWith('boss_spawned|') || msg === 'boss_spawned') {
    _onBossSpawned();
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

    /* ── Duck inhabit button (sits above the sheep button) ── */
    #poss-duck-btn {
      pointer-events: all;
      position: absolute;
      bottom: 184px;   /* stacked above #poss-btn: sheep=140 duck=184 fox=228 box=272 */
      left: 50%;
      transform: translateX(-50%);
      padding: 12px 28px;
      background: rgba(255,176,48,0.12);
      border: 2px solid rgba(255,176,48,0.6);
      color: #ffb030;
      font-size: 13px;
      letter-spacing: 2px;
      text-transform: uppercase;
      cursor: pointer;
      border-radius: 3px;
      transition: background 0.2s, opacity 0.2s;
      white-space: nowrap;
    }
    #poss-duck-btn:active { background: rgba(255,176,48,0.3); }
    #poss-duck-btn.poss-hidden { display: none; }

    /* ── Fox inhabit button (sits above the duck button) ── */
    #poss-fox-btn {
      pointer-events: all;
      position: absolute;
      bottom: 228px;
      left: 50%;
      transform: translateX(-50%);
      padding: 12px 28px;
      background: rgba(255,100,10,0.12);
      border: 2px solid rgba(255,100,10,0.6);
      color: #ff640a;
      font-size: 13px;
      letter-spacing: 2px;
      text-transform: uppercase;
      cursor: pointer;
      border-radius: 3px;
      transition: background 0.2s, opacity 0.2s;
      white-space: nowrap;
    }
    #poss-fox-btn:active { background: rgba(255,100,10,0.3); }
    #poss-fox-btn.poss-hidden { display: none; }

    /* ── Pounce button (right thumb, replaces EAT/FLAP during FOX possession) ── */
    #poss-pounce {
      pointer-events: all;
      position: absolute;
      bottom: 56px;
      right: 24px;
      width: 86px;
      height: 86px;
      border-radius: 50%;
      background: rgba(255,100,10,0.18);
      border: 2px solid rgba(255,100,10,0.85);
      color: #ff640a;
      font-family: monospace;
      font-size: 14px;
      letter-spacing: 2px;
      text-transform: uppercase;
      cursor: pointer;
      display: none;
      align-items: center;
      justify-content: center;
      text-align: center;
      padding: 0;
      text-shadow: 0 0 8px rgba(255,100,10,0.7);
      box-shadow: 0 0 12px rgba(255,100,10,0.4);
      transition: transform 0.08s ease-out, background 0.1s;
      user-select: none;
      -webkit-tap-highlight-color: transparent;
      touch-action: manipulation;
    }
    #poss-pounce:active {
      background: rgba(255,100,10,0.45);
      transform: scale(0.92);
    }

    /* ── Flap button (right thumb, replaces EAT during DUCK possession) ── */
    #poss-flap {
      pointer-events: all;
      position: absolute;
      bottom: 56px;
      right: 24px;
      width: 86px;
      height: 86px;
      border-radius: 50%;
      background: rgba(255,210,90,0.18);
      border: 2px solid rgba(255,210,90,0.85);
      color: #ffd25a;
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
      text-shadow: 0 0 8px rgba(255,210,90,0.7);
      box-shadow: 0 0 12px rgba(255,210,90,0.4);
      transition: transform 0.08s ease-out, background 0.1s;
      user-select: none;
      -webkit-tap-highlight-color: transparent;
      touch-action: manipulation;
    }
    #poss-flap:active {
      background: rgba(255,210,90,0.45);
      transform: scale(0.92);
    }

    /* Legacy floating timer / eaten labels — kept in the DOM so existing JS
       references still resolve, but visually replaced by the in-card Game
       Boy Color footer. Force display:none even when JS toggles them. */
    #poss-timer, #poss-eaten { display: none !important; }

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
    /* Art window sits INSIDE the card frame's visible center — the
       trading-card border (poss-card-frame img) overlays the outer rim.
       The Game Boy Color chrome (#gb-frame) flex-fills this area. */
    #poss-art-window {
      position: absolute;
      top: 6%;
      bottom: 6%;
      left: 7%;
      right: 7%;
      overflow: hidden;
      background: #0d1a0d;   /* dark olive — visible if the frame is taller than the screen */
    }

    /* ── Game Boy Color frame ──────────────────────────────────────────
       Three-row flex: header (wordmark), screen (video), footer (stats).
       The header/footer are flat pixel-art green; the screen window has
       a sunken black surround like a real GBC LCD bezel.                */
    #gb-frame {
      position: absolute;
      inset: 0;
      display: flex;
      flex-direction: column;
      background: #2d4a2d;   /* GBC cartridge green */
      color: #d8f0c8;
      font-family: "Share Tech Mono", "VT323", monospace;
      letter-spacing: 1px;
      image-rendering: pixelated;
    }

    /* ── Header: wordmark strip ── */
    #gb-header {
      flex: 0 0 12%;
      display: flex;
      align-items: center;
      justify-content: center;
      background: linear-gradient(to bottom, #3a5e3a 0%, #243e24 100%);
      border-bottom: 2px solid #0d1a0d;
      box-shadow: inset 0 -2px 0 #4a7a4a;
      text-transform: uppercase;
      font-size: 10px;
      font-weight: bold;
      color: #ffe7a0;
      text-shadow: 1px 1px 0 #000;
      letter-spacing: 3px;
    }
    #gb-title::before { content: '▸ '; color: #ff5050; }
    #gb-title::after  { content: ' ◂'; color: #ff5050; }

    /* ── Middle: the LCD screen ── */
    #gb-screen {
      flex: 1 1 auto;
      position: relative;
      background: #000;
      /* sunken bezel — thick dark inset to evoke the GBC's screen well */
      border: 3px solid #0d1a0d;
      box-shadow:
        inset  1px  1px 0 #4a7a4a,
        inset -1px -1px 0 #1a3a1a;
      overflow: hidden;
    }

    /* ── LCD pixel grid overlay ──
       A repeating mask of thin dark lines, laid on top of the video. Roughly
       aligns with the upscaled source pixels: 160-wide stream into a ~220-px
       card cropped via object-fit:cover shows ~62 source pixels across, so
       each source pixel ≈ 3-4 display pixels — the grid lands close to the
       seams and reads as a real LCD pixel matrix.                          */
    #gb-lcd-grid {
      position: absolute;
      inset: 0;
      pointer-events: none;
      background-image:
        linear-gradient(rgba(0,30,0,0.18) 1px, transparent 1px),
        linear-gradient(90deg, rgba(0,30,0,0.18) 1px, transparent 1px);
      background-size: 3px 3px;
      mix-blend-mode: multiply;   /* darkens the underlying pixels, doesn't blow out colour */
      z-index: 2;
    }

    /* ── Footer: collapsed — timer moved into the screen as an overlay ── */
    #gb-footer { display: none; }

    /* ── In-screen countdown timer ────────────────────────────────────────
       Sits at the bottom-centre of #gb-screen, above the LCD pixel grid
       (z-index 3 > grid's 2). Large enough to read at a glance.
       Blinks red when time is low (≤ 9 s).                               */
    #gb-timer {
      position: absolute;
      bottom: 7px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 3;
      font-family: "Share Tech Mono", "VT323", monospace;
      font-size: 22px;
      font-weight: bold;
      color: #ffe7a0;
      /* Dark halo so it pops against any video background */
      text-shadow:
        0 0 6px rgba(0,0,0,0.95),
        1px  1px 0 #000,
       -1px -1px 0 #000,
        1px -1px 0 #000,
       -1px  1px 0 #000;
      letter-spacing: 3px;
      pointer-events: none;
      white-space: nowrap;
    }
    #gb-timer.timer-low {
      color: #ff5050;
      animation: gb-timer-blink 0.65s step-end infinite;
    }
    @keyframes gb-timer-blink {
      0%, 100% { opacity: 1;   }
      50%      { opacity: 0.25; }
    }
    /* Horror-theme override during Blind Box possession */
    #gb-frame.box-mode #gb-timer { color: #ffaaaa; }

    /* Kept for any residual CSS refs (box-mode overrides etc.) — no DOM use */
    .gb-stat, .gb-stat-label, .gb-stat-value { /* legacy, not rendered */ }
    #poss-video {
      width: 100%;
      height: 100%;
      /* cover = scales video to fill, cropping sides — gives the
         "vertical slice" look without squishing the source. */
      object-fit: cover;
      display: block;
      background: #000;
      /* ── Pixel-art upscaling ──────────────────────────────────────────
         Unity captures the stream at low resolution (e.g. 160×90) to keep
         bandwidth tiny AND to lean into the game's pixel aesthetic. By
         default browsers bilinear-smooth video as it scales — we want
         hard, chunky pixel blocks instead. Each property is a vendor
         spelling; the browser picks the one it understands.            */
      image-rendering: pixelated;            /* Chrome / Edge / modern Safari */
      image-rendering: -moz-crisp-edges;     /* Firefox */
      image-rendering: crisp-edges;          /* spec name (some Safari) */
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

    /* ── Virtual joystick — Game Boy layout: LEFT side ── */
    #poss-joy-zone {
      pointer-events: all;
      position: absolute;
      bottom: 28px;
      left: 24px;
      transform: none;
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

    /* ── Block overlay — transparent full-screen div that eats all pointer
       events while a creature is possessed, preventing accidental pack-
       opening behind the possession cam window. Sits as the first child of
       #poss-root so every button and joystick (later in DOM, higher in
       stacking order) remains fully clickable on top of it.
       z-index is irrelevant inside poss-root's stacking context; DOM order
       is what matters — first = lowest = beneath all interactive children. */
    #poss-block-overlay {
      position: fixed;
      inset: 0;
      pointer-events: all;
      display: none;
      background: transparent;
    }

    /* ── Placement controls row — Game Boy layout: joystick LEFT, PLACE RIGHT.
       Fills the bottom portion of the placement card, below the header text.  */
    #poss-place-controls {
      display: flex;
      flex-direction: row;
      align-items: center;
      justify-content: space-between;
      width: 100%;
      box-sizing: border-box;
    }
    /* When joystick + PLACE button are children of the controls row, override
       their fixed absolute positioning so they flow inside the flex row.
       Joystick is scaled down slightly (120 → fits beside the 86px button). */
    #poss-place-controls #poss-joy-zone {
      position: relative !important;
      top: auto !important; bottom: auto !important;
      left: auto !important; right: auto !important;
      transform: none !important;
      width: 120px !important;
      height: 120px !important;
    }
    #poss-place-controls #poss-place {
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

    /* ── Open Box button (box possession only, once per session) ── */
    #poss-open-box {
      pointer-events: all;
      position: absolute;
      bottom: 56px;
      right: 24px;
      width: 86px;
      height: 86px;
      border-radius: 50%;
      background: rgba(140,16,16,0.20);
      border: 2px solid rgba(200,28,28,0.75);
      color: #e85050;
      font-family: monospace;
      font-size: 13px;
      font-weight: bold;
      letter-spacing: 1px;
      text-transform: uppercase;
      cursor: pointer;
      display: none;
      align-items: center;
      justify-content: center;
      text-align: center;
      padding: 0;
      line-height: 1.25;
      text-shadow: 0 0 10px rgba(220,40,40,0.8);
      box-shadow: 0 0 14px rgba(180,20,20,0.45);
      transition: transform 0.08s ease-out, background 0.1s, opacity 0.2s;
      user-select: none;
      -webkit-tap-highlight-color: transparent;
      touch-action: manipulation;
    }
    #poss-open-box:active {
      background: rgba(180,20,20,0.40);
      transform: scale(0.91);
    }
    #poss-open-box:disabled {
      opacity: 0.28;
      pointer-events: none;
      box-shadow: none;
      text-shadow: none;
    }

    /* ── Fungi spore panel ───────────────────────────────────────────────────
       Persistent top-left overlay shown after the user places a mushroom.
       Stays alive independently of possession sessions — the mushroom keeps
       existing on the ground after the possession timer expires.
       Dismissed only when fungi_destroyed arrives (boss/fleshling ate it). */
    #poss-spore-panel {
      pointer-events: all;
      position: fixed;
      top: 24px;
      left: 24px;
      display: none;
      flex-direction: column;
      align-items: flex-start;
      gap: 6px;
      z-index: 10000;
    }
    #poss-spore-btn {
      padding: 12px 20px;
      background: rgba(101,255,76,0.12);
      border: 2px solid rgba(101,255,76,0.68);
      color: #65ff4c;
      font-family: monospace;
      font-size: 12px;
      letter-spacing: 3px;
      text-transform: uppercase;
      cursor: pointer;
      border-radius: 3px;
      white-space: nowrap;
      text-shadow: 0 0 10px rgba(101,255,76,0.55);
      box-shadow: 0 0 12px rgba(101,255,76,0.25);
      transition: background 0.15s, transform 0.08s;
      user-select: none;
      touch-action: manipulation;
      -webkit-tap-highlight-color: transparent;
    }
    #poss-spore-btn:active {
      background: rgba(101,255,76,0.38);
      transform: scale(0.93);
    }
    /* Pulsing glow when ready to fire */
    #poss-spore-btn.spore-ready {
      animation: spore-pulse 1.8s ease-in-out infinite;
    }
    /* Rapid pulse while the cloud is live in Unity */
    #poss-spore-btn.spore-active {
      background: rgba(101,255,76,0.28);
      opacity: 0.80;
      cursor: default;
      animation: spore-pulse 0.55s ease-in-out infinite;
    }
    /* Dimmed, non-interactive during cooldown */
    #poss-spore-btn.spore-cooldown {
      opacity: 0.38;
      cursor: not-allowed;
      animation: none;
      box-shadow: none;
    }
    @keyframes spore-pulse {
      0%, 100% { box-shadow: 0 0 12px rgba(101,255,76,0.25); }
      50%       { box-shadow: 0 0 26px rgba(101,255,76,0.80), 0 0 6px rgba(101,255,76,0.95); }
    }
    /* Status line: READY / ACTIVE Xs / COOLDOWN Xs */
    #poss-spore-status {
      color: rgba(101,255,76,0.58);
      font-family: monospace;
      font-size: 10px;
      letter-spacing: 2px;
      text-transform: uppercase;
      padding-left: 2px;
    }

    /* ── Blind Box inhabit button ──────────────────────────────────────────
       Horror red — sits above the sheep, duck, and fox buttons. Pulses
       with a slow blood-glow so it reads as "wrong" in the nature phase
       and "inevitable" in the horror phase.                               */
    #poss-box-btn {
      pointer-events: all;
      position: absolute;
      bottom: 272px;
      left: 50%;
      transform: translateX(-50%);
      padding: 12px 28px;
      background: rgba(200, 28, 28, 0.12);
      border: 2px solid rgba(200, 28, 28, 0.70);
      color: #c81c1c;
      font-size: 13px;
      letter-spacing: 2px;
      text-transform: uppercase;
      cursor: pointer;
      border-radius: 3px;
      transition: background 0.2s, opacity 0.2s;
      white-space: nowrap;
      animation: box-btn-bleed 2.6s ease-in-out infinite;
    }
    #poss-box-btn:active { background: rgba(200, 28, 28, 0.38); }
    #poss-box-btn.poss-hidden { display: none; }
    @keyframes box-btn-bleed {
      0%, 100% { box-shadow: 0 0  6px rgba(200, 28, 28, 0.30); }
      50%      { box-shadow: 0 0 20px rgba(200, 28, 28, 0.80),
                             0 0  5px rgba(200, 28, 28, 0.95); }
    }

    /* ── Blind screen — degraded vision overlay ───────────────────────────
       Sits on top of the blurry WebRTC video feed during Blind Box
       possession. Background is transparent so the video shows through.
       Layers: thin drifting film-grain + edge vignette that's fully clear
       at the centre. Together they create a cataract-like effect — you can
       make out rough shapes and colours but can't navigate cleanly.       */
    #poss-blind-screen {
      position: absolute;
      inset: 0;
      background: transparent;   /* video shows through — not a solid block */
      display: none;
      overflow: hidden;
      pointer-events: none;
      z-index: 1;                /* sits above video, below lcd-grid */
    }

    /* Film-grain layer: lighter opacity than before so the video shows. */
    #poss-blind-screen::before {
      content: '';
      position: absolute;
      inset: -10%;
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='256' height='256'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
      background-size: 160px 160px;
      opacity: 0.09;
      mix-blend-mode: screen;
      filter: blur(0.6px);
      animation: blind-grain-drift 0.28s steps(3) infinite;
    }
    @keyframes blind-grain-drift {
      0%   { transform: translate(  0px,  0px); }
      33%  { transform: translate( -4px,  2px); }
      66%  { transform: translate(  3px, -3px); }
      100% { transform: translate( -2px,  4px); }
    }

    /* Cataract vignette: fully transparent at the centre (video visible),
       dark red at the edges — biological signature of clouded lenses.
       The player can see shapes near centre, nothing at the periphery.   */
    #poss-blind-screen::after {
      content: '';
      position: absolute;
      inset: 0;
      background: radial-gradient(
        ellipse at 50% 48%,
        rgba(200, 155, 110, 0.00)  0%,    /* centre: fully transparent */
        rgba( 90,  35,  20, 0.18) 38%,    /* mild amber ring */
        rgba( 12,   2,   2, 0.72) 68%,    /* deep red approaching edges */
        rgba(  3,   0,   0, 0.97) 100%);  /* near-black corners */
      animation: cataract-pulse 3.8s ease-in-out infinite alternate;
    }
    @keyframes cataract-pulse {
      from { transform: scale(1.00); opacity: 1.00; }
      to   { transform: scale(1.06); opacity: 0.88; }
    }

    /* ── Box-mode video filter ─────────────────────────────────────────────
       The WebRTC stream from the overhead box camera is deliberately degraded:
       moderate blur removes fine detail while preserving rough shapes and
       colours — the player can make out the environment but not navigate
       cleanly. Slightly more visible than before (blur reduced, saturation
       and brightness raised) while still keeping the disorienting feel.   */
    #gb-frame.box-mode #poss-video {
      filter: blur(6px) saturate(0.35) brightness(0.68) contrast(0.85);
    }

    /* Horror colour overrides for the GBC chrome during Box possession.
       The trading-card frame goes dark, wordmark turns blood-red.         */
    #gb-frame.box-mode {
      background: #190606;
    }
    #gb-frame.box-mode #gb-header {
      background: linear-gradient(to bottom, #2e0e0e 0%, #160606 100%);
      color: #c81c1c;
      text-shadow: 0 0 8px rgba(200,28,28,0.7), 1px 1px 0 #000;
    }
    #gb-frame.box-mode #gb-header #gb-title::before { content: '✕ '; color: #8c1010; }
    #gb-frame.box-mode #gb-header #gb-title::after  { content: ' ✕'; color: #8c1010; }
    #gb-frame.box-mode #gb-screen {
      border-color: #1e0808;
      box-shadow:
        inset  1px  1px 0 #4a1010,
        inset -1px -1px 0 #0e0404;
    }
    #gb-frame.box-mode #gb-footer {
      background: linear-gradient(to top, #2e0e0e 0%, #160606 100%);
      border-top-color: #1e0808;
    }
    #gb-frame.box-mode .gb-stat-label { color: #c81c1c; }
    #gb-frame.box-mode .gb-stat-value { color: #ffaaaa; }
  `;
  document.head.appendChild(style);

  const root = document.createElement('div');
  root.id = 'poss-root';
  root.innerHTML = `
    <!-- Block overlay — first in DOM = lowest stacking order within poss-root.
         All buttons/joystick rendered on top; background page blocked below. -->
    <div id="poss-block-overlay"></div>
    <button id="poss-box-btn">Inhabit the Blind Box</button>
    <button id="poss-fox-btn">Inhabit a fox</button>
    <button id="poss-duck-btn">Inhabit a duck</button>
    <button id="poss-btn">Inhabit a sheep</button>
    <div id="poss-timer">INHABITING — <span id="poss-secs">30</span>s</div>
    <div id="poss-eaten">EATEN — <span id="poss-eaten-count">0</span></div>
    <div id="poss-video-wrap">
      <div id="poss-art-window">
        <!-- ── Game Boy Color chrome ────────────────────────────────────────
             Three rows: wordmark header, LCD screen with grid overlay, and
             HP-style stat bars at the bottom. Sits INSIDE the trading-card
             frame so we get pixel-card-outer + GBC-screen-inner.           -->
        <div id="gb-frame">
          <div id="gb-header">
            <span id="gb-title">SHEEP CAM</span>
          </div>

          <div id="gb-screen">
            <video id="poss-video" autoplay playsinline webkit-playsinline muted disablePictureInPicture x-webkit-airplay="deny"></video>
            <!-- Blind Box "vision" — shown instead of the video feed during
                 box possession. CSS noise + cataract vignette. No signal. -->
            <div id="poss-blind-screen"></div>
            <!-- LCD pixel grid: thin dark lines every few pixels so the
                 upscaled video reads as a real-LCD pixel matrix.          -->
            <div id="gb-lcd-grid"></div>
            <!-- Countdown timer — centered at the bottom of the screen -->
            <div id="gb-timer">0:30</div>
            <div id="poss-video-label">
              <div>CONNECTING<span class="dots"><span>.</span><span>.</span><span>.</span></span></div>
              <div id="poss-loading-bar"></div>
            </div>
          </div>

          <div id="gb-footer">
            <div class="gb-stat">
              <span class="gb-stat-label">TIME</span>
              <span class="gb-stat-value" id="gb-time">030/030</span>
            </div>
            <div class="gb-stat">
              <span class="gb-stat-label" id="gb-action-label">EAT</span>
              <span class="gb-stat-value" id="gb-action-value">000</span>
            </div>
          </div>
        </div>
      </div>
      <img id="poss-card-frame" src="assets/common-card-sheep-stream.png" alt="" />
    </div>
    <div id="poss-joy-zone">
      <div id="poss-joy-bg"></div>
      <div id="poss-joy-knob"></div>
    </div>
    <button id="poss-eat">EAT</button>
    <button id="poss-flap">FLAP</button>
    <button id="poss-pounce">POUNCE</button>
    <button id="poss-place">PLACE</button>
    <button id="poss-open-box">OPEN<br>BOX</button>
    <button id="poss-release">release</button>

    <!-- Placement modal: blocks background, houses joystick + PLACE button -->
    <div id="poss-place-overlay">
      <div id="poss-place-card">
        <div id="poss-place-card-backdrop"></div>
        <div id="poss-place-card-content">
          <div id="poss-place-card-header">WILDFLOWER<br>PLACEMENT</div>
          <!-- controls row: joystick appended LEFT, PLACE button appended RIGHT -->
          <div id="poss-place-controls"></div>
        </div>
        <img id="poss-place-card-frame" src="assets/common-card-sheep-stream.png" alt="" />
      </div>
    </div>

    <!-- Fungi spore panel — top-left corner, persists after mushroom placement.
         Hidden by default; shown on fungi_placed, dismissed on fungi_destroyed. -->
    <div id="poss-spore-panel">
      <button id="poss-spore-btn">&#x2601; SPORE CLOUD</button>
      <div id="poss-spore-status">READY</div>
    </div>
  `;
  document.body.appendChild(root);

  _ui = {
    root:             root,
    btn:              root.querySelector('#poss-btn'),
    duckBtn:          root.querySelector('#poss-duck-btn'),
    foxBtn:           root.querySelector('#poss-fox-btn'),
    boxBtn:           root.querySelector('#poss-box-btn'),
    blindScreen:      root.querySelector('#poss-blind-screen'),
    timer:            root.querySelector('#poss-timer'),
    secs:             root.querySelector('#poss-secs'),
    eaten:            root.querySelector('#poss-eaten'),
    eatenCount:       root.querySelector('#poss-eaten-count'),
    // Game Boy Color in-card readouts
    gbTitle:          root.querySelector('#gb-title'),
    gbTimer:          root.querySelector('#gb-timer'),
    vidWrap:          root.querySelector('#poss-video-wrap'),
    video:            root.querySelector('#poss-video'),
    vidLabel:         root.querySelector('#poss-video-label'),
    loadingBar:       root.querySelector('#poss-loading-bar'),
    joyZone:          root.querySelector('#poss-joy-zone'),
    joyKnob:          root.querySelector('#poss-joy-knob'),
    release:          root.querySelector('#poss-release'),
    openBox:          root.querySelector('#poss-open-box'),
    eat:              root.querySelector('#poss-eat'),
    flap:             root.querySelector('#poss-flap'),
    pounce:           root.querySelector('#poss-pounce'),
    place:            root.querySelector('#poss-place'),
    placeOverlay:     root.querySelector('#poss-place-overlay'),
    placeCardContent: root.querySelector('#poss-place-card-content'),
    placeCardHeader:  root.querySelector('#poss-place-card-header'),
    placeControls:    root.querySelector('#poss-place-controls'),
    blockOverlay:     root.querySelector('#poss-block-overlay'),
    // Fungi spore panel
    sporePanel:       root.querySelector('#poss-spore-panel'),
    sporeBtn:         root.querySelector('#poss-spore-btn'),
    sporeStatus:      root.querySelector('#poss-spore-status'),
  };

  _ui.btn.addEventListener('click',        _requestPossession);
  _ui.duckBtn.addEventListener('click',    _requestDuckPossession);
  _ui.foxBtn.addEventListener('click',     _requestFoxPossession);
  _ui.boxBtn.addEventListener('click',     _requestBoxPossession);
  _ui.openBox.addEventListener('click',    _openBox);
  _ui.release.addEventListener('click',    _releasePossession);
  // Use 'touchstart' (with 'click' fallback) for zero-latency tactile feedback
  _ui.eat.addEventListener('touchstart',    e => { e.preventDefault(); _eat();          }, { passive: false });
  _ui.eat.addEventListener('click',         _eat);
  _ui.flap.addEventListener('touchstart',   e => { e.preventDefault(); _flap();         }, { passive: false });
  _ui.flap.addEventListener('click',        _flap);
  _ui.pounce.addEventListener('touchstart', e => { e.preventDefault(); _pounce();       }, { passive: false });
  _ui.pounce.addEventListener('click',      _pounce);
  _ui.place.addEventListener('touchstart',  e => { e.preventDefault(); _confirmPlace(); }, { passive: false });
  _ui.place.addEventListener('click',       _confirmPlace);
  // Spore button — touchstart for zero-latency on mobile, click as desktop fallback
  _ui.sporeBtn.addEventListener('touchstart', e => { e.preventDefault(); _triggerSpore(); }, { passive: false });
  _ui.sporeBtn.addEventListener('click',      _triggerSpore);
  _setupJoystick();

  // Hide all Inhabit buttons until the matching creature has been pulled.
  if (!_sheepAvailable) {
    _ui.btn.classList.add('poss-hidden');
    console.log('[possession.js] Sheep button locked — waiting for first sheep_spawned');
  }
  if (!_duckAvailable) {
    _ui.duckBtn.classList.add('poss-hidden');
    console.log('[possession.js] Duck button locked — waiting for first duck_spawned');
  }
  if (!_foxAvailable) {
    _ui.foxBtn.classList.add('poss-hidden');
    console.log('[possession.js] Fox button locked — waiting for first fox_spawned');
  }
  // Box button is always hidden until blind_box_spawned|clientId arrives
  _ui.boxBtn.classList.add('poss-hidden');
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

function _requestDuckPossession() {
  _ui.duckBtn.textContent   = 'Requesting…';
  _ui.duckBtn.style.opacity = '0.5';

  // Same iOS autoplay priming as sheep — pre-arms the video element so the
  // WebRTC stream can autoplay when it arrives.
  _ui.video.muted = true;
  _ui.video.play().catch(() => {});

  send(`duck_possess_request|${CLIENT_ID}`);
}

function _requestFoxPossession() {
  _ui.foxBtn.textContent   = 'Requesting…';
  _ui.foxBtn.style.opacity = '0.5';
  // iOS Safari autoplay priming — same as sheep/duck
  _ui.video.muted = true;
  _ui.video.play().catch(() => {});
  send(`fox_possess_request|${CLIENT_ID}`);
}

function _pounce() {
  if (!_possessed || _creatureType !== 'fox') return;
  send(`fox_pounce|${CLIENT_ID}`);
}

function _releasePossession() {
  // Send the verb that matches whichever creature we currently inhabit
  if      (_creatureType === 'duck') send(`duck_possess_end|${CLIENT_ID}`);
  else if (_creatureType === 'fox')  send(`fox_possess_end|${CLIENT_ID}`);
  else if (_creatureType === 'box')  send(`box_possess_end|${CLIENT_ID}`);
  else                               send(`possess_end|${CLIENT_ID}`);
  _onEnded();   // optimistic — server will confirm with the matching ended message
}

function _eat() {
  if (!_possessed || _creatureType !== 'sheep') return;
  send(`sheep_eat|${CLIENT_ID}`);
}

function _flap() {
  if (!_possessed || _creatureType !== 'duck') return;
  send(`duck_flap|${CLIENT_ID}`);
}

// Writes the countdown into #gb-timer and adds .timer-low when ≤ 9 s.
function _setGbTimer(secsLeft) {
  if (!_ui || !_ui.gbTimer) return;
  const s = Math.max(0, secsLeft | 0);
  const mm = Math.floor(s / 60);
  const ss = s % 60;
  _ui.gbTimer.textContent = mm + ':' + String(ss).padStart(2, '0');
  _ui.gbTimer.classList.toggle('timer-low', s <= 9);
}

function _onGranted(duration, creature) {
  _possessed     = true;
  _creatureType  = creature;   // 'sheep' | 'duck' | 'fox'
  _grantDuration = duration;

  // Hide ALL inhabit buttons during a possession (regardless of which one
  // was just granted). They come back via _onEnded if credits are still live.
  _ui.btn.classList.add('poss-hidden');
  _ui.duckBtn.classList.add('poss-hidden');
  _ui.foxBtn.classList.add('poss-hidden');

  _ui.vidWrap.style.display  = 'block';
  _ui.vidLabel.style.display = 'flex';   // show "CONNECTING…" until first frame
  _ui.joyZone.style.display  = 'flex';
  _ui.release.style.display  = 'block';
  _ui.secs.textContent       = duration;
  // Block the background (pack carousel, shop) — see #poss-block-overlay CSS
  if (_ui.blockOverlay) _ui.blockOverlay.style.display = 'block';

  // ── Game Boy Color in-card readouts ──
  if (_ui.gbTitle) _ui.gbTitle.textContent = creature === 'fox'  ? 'FOX CAM'  :
                                             creature === 'duck' ? 'DUCK CAM' : 'SHEEP CAM';
  _setGbTimer(duration);

  // Show the action button that matches the creature
  if (creature === 'duck') {
    _ui.flap.style.display   = 'flex';
    _ui.eat.style.display    = 'none';
    _ui.pounce.style.display = 'none';
  } else if (creature === 'fox') {
    _ui.pounce.style.display = 'flex';
    _ui.eat.style.display    = 'none';
    _ui.flap.style.display   = 'none';
  } else {
    _ui.eat.style.display        = 'flex';
    _ui.flap.style.display       = 'none';
    _ui.pounce.style.display     = 'none';
    _ui.eatenCount.textContent   = '0';
  }

  // Restart the 10s loading-bar animation by toggling the class with a reflow
  _ui.loadingBar.classList.remove('is-loading');
  void _ui.loadingBar.offsetWidth;        // force reflow to reset animation
  _ui.loadingBar.classList.add('is-loading');

  // Send joystick at 20 fps — but only when the stick value has actually
  // changed, with a keep-alive every ~750ms so Unity knows we're still
  // connected even while idle. Drops the per-player message rate from a
  // constant 20/s to ~1–2/s when the stick is centred. Verb depends on
  // what's being possessed.
  const inputVerb = creature === 'fox'  ? 'fox_input'  :
                    creature === 'duck' ? 'duck_input' : 'sheep_input';
  _resetInputSendTracking();  // first tick always fires
  _inputInterval = setInterval(() => {
    if (_shouldSendInput()) {
      send(`${inputVerb}|${CLIENT_ID}|${_joyX.toFixed(3)}|${_joyY.toFixed(3)}`);
      _markInputSent();
    }
  }, 50);

  // WebRTC video: Unity will send a 'webrtc_offer|' message shortly after
  // granting possession. The offer is handled in handlePossessionMessage above.
}

function _onDenied(creature) {
  // Denial can mean (a) someone else grabbed this creature, (b) the manager
  // is at its concurrent-stream cap, or (c) no spawned creatures remain.
  // Flash a short "STREAMS FULL" label, then restore the normal button text.
  const btn     = creature === 'fox'  ? _ui.foxBtn  :
                  creature === 'duck' ? _ui.duckBtn : _ui.btn;
  const restore = creature === 'fox'  ? 'Inhabit a fox'  :
                  creature === 'duck' ? 'Inhabit a duck' : 'Inhabit a sheep';
  btn.textContent   = 'Streams full — wait';
  btn.style.opacity = '0.6';
  setTimeout(() => {
    if (btn) {
      btn.textContent   = restore;
      btn.style.opacity = '1';
    }
  }, 1800);
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

/**
 * Called when Unity broadcasts that a duck has spawned (uncommon critter pack).
 * Unlocks the duck inhabit button. Each duck card grants one possession.
 */
function _onDuckSpawned() {
  _duckAvailable = true;
  if (_ui && !_possessed) {
    _ui.duckBtn.classList.remove('poss-hidden');
    console.log('[possession.js] Duck card pulled — duck Inhabit button unlocked');
  }
}

function _onTick(secsLeft) {
  _ui.secs.textContent = secsLeft;
  _setGbTimer(secsLeft);
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

/**
 * Called when Unity confirms a duck flap succeeded. Currently no on-screen
 * counter for it (we use the visual feather burst + wing animation in the
 * stream instead), but the hook is here for future UI feedback.
 */
function _onDuckFlapped(total) {
  // Hook retained for future UI feedback — currently no counter displayed
}

/**
 * Called when Unity broadcasts that a fox has spawned (rare critter pack).
 * Unlocks the fox inhabit button. Each fox card grants one possession.
 */
function _onFoxSpawned() {
  _foxAvailable = true;
  if (_ui && !_possessed) {
    _ui.foxBtn.classList.remove('poss-hidden');
    console.log('[possession.js] Fox card pulled — fox Inhabit button unlocked');
  }
}

/**
 * Called when Unity confirms the fox successfully pounced.
 * Updates the GBC POUNCE counter in the in-card HUD.
 */
function _onFoxPounced(total) {
  // Hook retained — pounce count could be shown here in future
}

// ── Horror phase lifecycle ─────────────────────────────────────────────────

/**
 * FleshBoss has entered the world. Vibrate every connected phone simultaneously
 * so the arrival is felt, not just seen.
 *
 * Pattern: two short warning pulses → one long deep impact.
 * Reads as "WARNING… WARNING… [THUD]" — unavoidable on Android.
 * iOS Safari silently ignores navigator.vibrate(), so it degrades gracefully.
 */
function _onBossSpawned() {
  if (navigator.vibrate) {
    navigator.vibrate([200, 80, 200, 80, 600]);
  }
  console.log('[possession.js] Boss spawned — haptic fired');
}

// ── Placement (user-driven card spawning) ──────────────────────────────────

function _onPlacementGranted(cardName) {
  _placing = true;

  // Update the card header dynamically — e.g. "WILDFLOWER PLACEMENT" vs "FLOWER BUSH PLACEMENT"
  if (_ui.placeCardHeader) {
    const label = (cardName || 'WILDFLOWER').toString().toUpperCase();
    _ui.placeCardHeader.innerHTML = label + '<br>PLACEMENT';
  }

  // Move joystick (left) + PLACE button (right) into the controls row so
  // they sit side-by-side Game Boy-style inside the framed placement modal.
  // They retain all existing event listeners after the DOM move.
  const _placeTarget = _ui.placeControls || _ui.placeCardContent;
  _placeTarget.appendChild(_ui.joyZone);
  _placeTarget.appendChild(_ui.place);
  _ui.joyZone.style.display = 'flex';
  _ui.place.style.display   = 'flex';

  // Show the overlay — pointer-events:all means the entire background
  // (pack carousel, shop, stars, everything) is now uninteractable
  // until placement completes.
  _ui.placeOverlay.classList.add('active');

  // Hide the inhabit button while placing
  _ui.btn.classList.add('poss-hidden');

  // Stream joystick to Unity as placement_move at up to 20 fps — gated by
  // the dirty-flag helpers so idle ticks don't waste WS bandwidth.
  _resetInputSendTracking();  // first tick always fires
  _placementInputInterval = setInterval(() => {
    if (_shouldSendInput()) {
      send(`placement_move|${CLIENT_ID}|${_joyX.toFixed(3)}|${_joyY.toFixed(3)}`);
      _markInputSent();
    }
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

// ── Fungi spore panel ──────────────────────────────────────────────────────

/**
 * Unity confirmed the mushroom is planted and registered.
 * Show the spore panel in the READY state.
 */
function _onFungiPlaced(cooldownSecs) {
  _sporeOwned        = true;
  _sporeCooldownSecs = 0;
  clearInterval(_sporeCooldownTimer);
  _sporeCooldownTimer = null;

  _ui.sporePanel.style.display = 'flex';
  _ui.sporeBtn.classList.remove('spore-cooldown', 'spore-active');
  _ui.sporeBtn.classList.add('spore-ready');
  _ui.sporeStatus.textContent = 'READY';

  console.log('[possession.js] Fungi placed — spore panel shown (cooldown:', cooldownSecs + 's)');
}

/**
 * User presses SPORE CLOUD. Ignored if already on cooldown or no mushroom placed.
 */
function _triggerSpore() {
  if (!_sporeOwned || _sporeCooldownSecs > 0) return;
  send(`fungi_spore|${CLIENT_ID}`);
}

/**
 * Unity confirms the cloud fired.
 * The spore ability is ONE-SHOT per placed mushroom — flash "ACTIVE!" briefly
 * for confirmation, then hide the panel entirely. It only reappears when the
 * player pulls another fungi card and places a new mushroom.
 */
function _onSporeActivated(duration, cooldown) {
  // Consume the ability immediately so a second tap cannot fire
  _sporeOwned        = false;
  _sporeCooldownSecs = duration + cooldown;
  clearInterval(_sporeCooldownTimer);
  _sporeCooldownTimer = null;

  // Brief "ACTIVE!" visual confirmation before the panel vanishes
  _ui.sporeBtn.classList.remove('spore-ready', 'spore-cooldown');
  _ui.sporeBtn.classList.add('spore-active');
  _ui.sporeStatus.textContent = 'ACTIVE!';

  setTimeout(() => {
    if (_ui && _ui.sporePanel) _ui.sporePanel.style.display = 'none';
    // Reset button state for next time it appears
    _ui.sporeBtn.classList.remove('spore-active', 'spore-cooldown');
    _ui.sporeBtn.classList.add('spore-ready');
    _ui.sporeStatus.textContent = 'READY';
    _sporeCooldownSecs = 0;
  }, 1400);   // 1.4s — long enough to read, short enough to feel responsive

  console.log('[possession.js] Spore fired — panel will dismiss after flash');
}

/**
 * Unity rejected the spore request (race condition — panel should already be
 * hidden by this point, but hide it defensively just in case).
 */
function _onSporeOnCooldown(secsLeft) {
  _sporeOwned = false;
  if (_ui && _ui.sporePanel) _ui.sporePanel.style.display = 'none';
}

/**
 * The mushroom was eaten by a boss or fleshling — close the spore panel.
 */
function _onFungiDestroyed() {
  _sporeOwned        = false;
  _sporeCooldownSecs = 0;
  clearInterval(_sporeCooldownTimer);
  _sporeCooldownTimer = null;

  if (_ui && _ui.sporePanel) _ui.sporePanel.style.display = 'none';
  console.log('[possession.js] Fungi destroyed — spore panel dismissed');
}

// ── Blind Box possession ───────────────────────────────────────────────────

/**
 * Player pressed OPEN BOX. Disable the button immediately for optimistic UI,
 * then tell Unity to flip the lid and fountain 3 Glitchlings into the world.
 * Unity confirms with box_lings_released|clientId, which locks the button
 * permanently for this session with a ✓ RELEASED label.
 */
function _openBox() {
  if (!_possessed || _creatureType !== 'box') return;
  if (!_ui.openBox || _ui.openBox.disabled) return;

  // Optimistic disable so rapid taps don't double-fire
  _ui.openBox.disabled  = true;
  _ui.openBox.innerHTML = 'OPENING&hellip;';

  send(`box_open|${CLIENT_ID}`);
}

function _requestBoxPossession() {
  _ui.boxBtn.textContent   = 'Entering…';
  _ui.boxBtn.style.opacity = '0.5';
  // iOS Safari autoplay priming — same as sheep/duck. The WebRTC stream will
  // arrive asynchronously; pre-arming .play() here (inside the user gesture)
  // gives the video element autoplay permission before the stream lands.
  _ui.video.muted = true;
  _ui.video.play().catch(() => {});
  send(`box_possess_request|${CLIENT_ID}`);
}

function _onBoxSpawned() {
  _blindBoxAvailable = true;
  if (_ui && !_possessed) {
    _ui.boxBtn.classList.remove('poss-hidden');
    console.log('[possession.js] Blind Box spawned — inhabit button unlocked');
  }
}

function _onBoxGranted(duration) {
  _possessed     = true;
  _creatureType  = 'box';
  _grantDuration = duration;

  // Hide all inhabit buttons while inside the box
  _ui.btn.classList.add('poss-hidden');
  _ui.duckBtn.classList.add('poss-hidden');
  _ui.foxBtn.classList.add('poss-hidden');
  _ui.boxBtn.classList.add('poss-hidden');

  // Show GBC card. The video element receives a blurry WebRTC overhead feed —
  // Unity mounts a camera above the box and streams it here. Vision is deliberately
  // degraded via CSS (heavy blur + desaturation) so the player can make out rough
  // shapes and colours but can't navigate clearly. The blind-screen layer sits on
  // top as a thin grain + edge-vignette overlay to enhance the cataract feeling.
  _ui.vidWrap.style.display     = 'block';
  _ui.vidLabel.style.display    = 'flex';       // show "CONNECTING…" until first frame
  _ui.video.style.display       = '';           // show video — receives WebRTC stream
  _ui.blindScreen.style.display = 'block';      // grain + cataract vignette overlay

  // Restart loading-bar animation (same flow as sheep)
  _ui.loadingBar.classList.remove('is-loading');
  void _ui.loadingBar.offsetWidth;
  _ui.loadingBar.classList.add('is-loading');

  // Horror-theme the GBC chrome
  const gbFrame = _ui.root.querySelector('#gb-frame');
  if (gbFrame) gbFrame.classList.add('box-mode');

  // GBC readouts
  if (_ui.gbTitle) _ui.gbTitle.textContent = 'BOX CAM';
  _setGbTimer(duration);

  // Joystick + release + OPEN BOX; no EAT or FLAP — boxes don't have mouths or wings
  _ui.joyZone.style.display    = 'flex';
  _ui.release.style.display    = 'block';
  // Block background — same guard as critter possession
  if (_ui.blockOverlay) _ui.blockOverlay.style.display = 'block';
  _ui.eat.style.display        = 'none';
  _ui.flap.style.display       = 'none';
  // OPEN BOX button — starts enabled; consumed once the lings are released
  _ui.openBox.style.display    = 'flex';
  _ui.openBox.disabled         = false;
  _ui.openBox.innerHTML        = 'OPEN<br>BOX';

  // Send joystick at up to 20 fps — same dirty-flag gating as sheep/duck.
  _resetInputSendTracking();  // first tick always fires
  _inputInterval = setInterval(() => {
    if (_shouldSendInput()) {
      send(`box_input|${CLIENT_ID}|${_joyX.toFixed(3)}|${_joyY.toFixed(3)}`);
      _markInputSent();
    }
  }, 50);

  console.log('[possession.js] Inside the Blind Box — no vision. Roll anyway.');
}

function _onBoxDenied() {
  _ui.boxBtn.textContent   = 'Box is occupied';
  _ui.boxBtn.style.opacity = '0.6';
  setTimeout(() => {
    if (_ui.boxBtn) {
      _ui.boxBtn.textContent   = 'Inhabit the Blind Box';
      _ui.boxBtn.style.opacity = '1';
    }
  }, 1800);
}

function _onBoxTick(secsLeft) {
  _setGbTimer(secsLeft);
}

function _onEnded() {
  const wasDuck = _creatureType === 'duck';
  const wasFox  = _creatureType === 'fox';
  const wasBox  = _creatureType === 'box';
  _possessed    = false;
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

  // ── Credit handling — differs by creature type ────────────────────────────
  if (wasBox) {
    // Session over — the box still exists in the world, but the inhabit
    // credit is consumed for this pull. The button stays hidden until a new
    // blind_box_spawned|clientId arrives (i.e. another card is pulled or a
    // new box is debug-spawned). This prevents re-entry after release.
    _blindBoxAvailable = false;
    const gbFrame = _ui.root && _ui.root.querySelector('#gb-frame');
    if (gbFrame) gbFrame.classList.remove('box-mode');
    if (_ui.blindScreen) _ui.blindScreen.style.display = 'none';
    if (_ui.video)       _ui.video.style.display        = '';  // restore for next sheep/duck
    _ui.boxBtn.textContent   = 'Inhabit the Blind Box';
    _ui.boxBtn.style.opacity = '1';
    // button stays poss-hidden — _blindBoxAvailable is now false
    // Hide and reset the OPEN BOX button for next session
    if (_ui.openBox) {
      _ui.openBox.style.display = 'none';
      _ui.openBox.disabled      = false;
      _ui.openBox.innerHTML     = 'OPEN<br>BOX';
    }
  } else if (wasFox) {
    // Each fox card pull = one possession. Lock the button until next fox card.
    _foxAvailable = false;
    _ui.foxBtn.textContent   = 'Inhabit a fox';
    _ui.foxBtn.style.opacity = '1';
  } else if (wasDuck) {
    // Each duck card pull = one possession. Lock the button until next duck card.
    _duckAvailable = false;
    _ui.duckBtn.textContent   = 'Inhabit a duck';
    _ui.duckBtn.style.opacity = '1';
  } else {
    // Same one-per-pull model for sheep
    _sheepAvailable = false;
    _ui.btn.textContent   = 'Inhabit a sheep';
    _ui.btn.style.opacity = '1';
  }

  // Restore buttons whose credits are still live
  if (_sheepAvailable) _ui.btn.classList.remove('poss-hidden');
  if (_duckAvailable)  _ui.duckBtn.classList.remove('poss-hidden');
  if (_foxAvailable)   _ui.foxBtn.classList.remove('poss-hidden');

  // Lift the background block — pack carousel is interactive again
  if (_ui.blockOverlay) _ui.blockOverlay.style.display = 'none';
  // Reset timer so it never starts the next session in the red-blink state
  if (_ui.gbTimer) _ui.gbTimer.classList.remove('timer-low');
  _ui.timer.style.display    = 'none';
  _ui.eaten.style.display    = 'none';
  _ui.vidWrap.style.display  = 'none';
  _ui.joyZone.style.display  = 'none';
  _ui.release.style.display  = 'none';
  _ui.eat.style.display      = 'none';
  _ui.flap.style.display     = 'none';
  _ui.pounce.style.display   = 'none';
  _ui.joyKnob.style.transform = 'translate(-50%,-50%)';

  _creatureType = null;
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
      // STUN + TURN. Production = self-hosted coturn; Open Relay as fallback.
      iceServers: (() => {
        const list = [{ urls: 'stun:stun.l.google.com:19302' }];
        if (TURN_HOST && TURN_USERNAME) {
          list.push({
            urls: [
              `turn:${TURN_HOST}:${TURN_PORT}`,
              `turn:${TURN_HOST}:${TURN_PORT}?transport=tcp`,
            ],
            username:   TURN_USERNAME,
            credential: TURN_PASSWORD,
          });
          console.log(`[WebRTC] Using self-hosted TURN: turn:${TURN_HOST}:${TURN_PORT}`);
        }
        list.push({
          urls: [
            'turn:openrelay.metered.ca:80',
            'turn:openrelay.metered.ca:443',
            'turn:openrelay.metered.ca:443?transport=tcp',
          ],
          username:   'openrelayproject',
          credential: 'openrelayproject',
        });
        return list;
      })()
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

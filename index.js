// ────────────────────────────────────────────────────────────────────────────
// Bloom & Ruin — WebSocket relay server
//
// Hosts the static web app (project/) and relays plain-text messages between
// Unity and the player phones. Most messages are forwarded immediately, but
// high-frequency joystick inputs are coalesced server-side so a flood of
// stick samples can't block the Node event loop when multiple players are
// connected.
// ────────────────────────────────────────────────────────────────────────────

const express   = require('express');
const http      = require('http');
const WebSocket = require('ws');

const app    = express();
const server = http.createServer(app);
const wss    = new WebSocket.Server({ server });

app.use(express.static('project'));

// ── Verbose logging ─────────────────────────────────────────────────────────
// Console writes are SYNCHRONOUS in Node and block the event loop. At
// 4 players × 20 Hz × 4 input verbs that's ~320 log lines/sec — enough to
// add hundreds of ms of input latency on its own. Off by default; set the
// LOG_WS environment variable to anything truthy to re-enable for debugging.
const DEBUG_LOG = !!process.env.LOG_WS;
const dlog = DEBUG_LOG ? (...a) => console.log(...a) : () => {};

// ── Joystick input coalescing ──────────────────────────────────────────────
// Web clients send joystick samples up to ~20 Hz. With multiple players
// each sample is also broadcast to every other connected socket, so 4
// active phones can balloon into hundreds of WS writes/sec. We buffer
// these high-frequency inputs per (verb, clientId) and flush only the
// most recent value at FLUSH_HZ. Intermediate samples get dropped — they
// were stale by the time they'd be forwarded anyway.
//
// Non-input messages (possess_request, sheep_eat, placement_confirm,
// WebRTC signalling, etc.) bypass this and forward immediately.
const INPUT_VERBS = new Set([
  'sheep_input',
  'duck_input',
  'box_input',
  'placement_move',
]);
const FLUSH_HZ = 30;
const FLUSH_MS = Math.round(1000 / FLUSH_HZ);

/** key: `${verb}|${clientId}` → { sender, msg } */
const pendingInputs = new Map();

function broadcastExceptSender(sender, msg) {
  // Sender already knows what it sent; echoing back wastes CPU + bandwidth
  // and triggers the client's parse pipeline for nothing.
  wss.clients.forEach(client => {
    if (client !== sender && client.readyState === WebSocket.OPEN) {
      client.send(msg);
    }
  });
}

// Flush the most-recent input per (verb, client) on a fixed 30 Hz cadence.
// Cheap when idle — the Map is empty most of the time.
setInterval(() => {
  if (pendingInputs.size === 0) return;
  for (const entry of pendingInputs.values()) {
    broadcastExceptSender(entry.sender, entry.msg);
  }
  pendingInputs.clear();
}, FLUSH_MS);

wss.on('connection', (ws) => {
  dlog('Client connected');
  ws.send('welcome');

  ws.on('message', (raw) => {
    const msg = raw.toString();
    dlog('Received:', msg);

    // Joystick stream detection: `verb|clientId|x|y`.
    // We coalesce on (verb, clientId) so each player's latest stick state
    // overwrites prior unsent samples for that same player.
    const firstPipe = msg.indexOf('|');
    if (firstPipe > 0) {
      const verb = msg.slice(0, firstPipe);
      if (INPUT_VERBS.has(verb)) {
        const secondPipe = msg.indexOf('|', firstPipe + 1);
        const clientId = secondPipe > 0
          ? msg.slice(firstPipe + 1, secondPipe)
          : '';
        pendingInputs.set(verb + '|' + clientId, { sender: ws, msg });
        return; // flushed by the 30 Hz interval above
      }
    }

    // Everything else (lifecycle verbs, taps, WebRTC signalling, heartbeats)
    // forwards immediately so latency-sensitive events aren't held up by a
    // tick boundary.
    broadcastExceptSender(ws, msg);
  });

  ws.on('close', () => {
    dlog('Client disconnected');
    // If this client had a pending input, drop it — it can't be delivered
    // and would just sit in the Map until the next flush no-op anyway.
    for (const [key, entry] of pendingInputs) {
      if (entry.sender === ws) pendingInputs.delete(key);
    }
  });
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}` +
              (DEBUG_LOG ? '  [verbose WS logging ON — set LOG_WS=0 for prod]' : ''));
});

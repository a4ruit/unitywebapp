const WS_URL = 'wss://unitywebapp.onrender.com';

let ws = null;
let reconnectTimer = null;

const dot = document.getElementById('wsDot');
const label = document.getElementById('wsLabel');
const overlay = document.getElementById('overlay');

// ─── WebSocket ────────────────────────────────────────────────────────────────

function setStatus(connected) {
  dot.classList.toggle('live', connected);
  label.textContent = connected ? 'live' : 'offline';
}

function connect() {
  try {
    ws = new WebSocket(WS_URL);

    ws.onopen = () => {
      setStatus(true);
      ws.send('web_client');
      clearTimeout(reconnectTimer);
    };

    ws.onclose = () => {
      setStatus(false);
      reconnectTimer = setTimeout(connect, 3000);
    };

    ws.onerror = () => {
      ws.close();
    };

    ws.onmessage = (e) => {
      console.log('From server:', e.data);
    };

  } catch (e) {
    setStatus(false);
    reconnectTimer = setTimeout(connect, 3000);
  }
}

function send(msg) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(msg);
  }
}

// ─── App card interactions ────────────────────────────────────────────────────

document.querySelectorAll('.app-card').forEach(card => {
  card.addEventListener('click', () => {
    if (card.dataset.app === 'unknown') return;

    const cameraCmd = card.dataset.camera;
    const appName   = card.dataset.app;

    // Visual feedback
    card.classList.add('launching');

    // Send camera transition command to Unity
    send(cameraCmd);
    send('spawn_cube');
    console.log(`Sent: ${cameraCmd} → ${card.dataset.label}`);

    // Fade to black then navigate to sub-app
    overlay.classList.add('active');

    setTimeout(() => {
      // Uncomment once sub-app files exist:
      // window.location.href = `./apps/${appName}/index.html`;

      // Placeholder: fade back in
      setTimeout(() => {
        overlay.classList.remove('active');
        card.classList.remove('launching');
      }, 600);
    }, 400);
  });
});

// ─── Init ─────────────────────────────────────────────────────────────────────

connect();
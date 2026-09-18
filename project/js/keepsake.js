// keepsake.js — the post-game plaque. Unity uploads this player's best-moment
// frame when the credits roll and sends:
//   keepsake|clientId|title|teammate,teammate,...
// The phone fetches its own frame once and composes the plaque on a canvas, so
// the server never renders anything.

const KeepsakeUI = (() => {

  const W = 600, H = 820;

  function handle(msg) {
    if (typeof msg !== 'string' || !msg.startsWith('keepsake|')) return false;
    const p = msg.split('|');
    if (p[1] !== CLIENT_ID) return true;
    const title = p[2] || '';
    const team  = (p[3] || '').split(',').map(s => s.trim()).filter(Boolean);
    _load(title, team);
    return true;
  }

  function _myName() {
    return (typeof playerName === 'string' && playerName) ? playerName : 'YOU';
  }

  function _load(title, team) {
    const img = new Image();
    img.onload  = () => _show(_compose(img, title, team));
    img.onerror = () => console.warn('[keepsake] frame not available');
    img.src = `/keepsake/${encodeURIComponent(CLIENT_ID)}?t=${Date.now()}`;
  }

  function _compose(img, title, team) {
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = false;

    g.fillStyle = '#0b0a10';
    g.fillRect(0, 0, W, H);

    // Frame: gold outer, dark inner, stepped corners.
    g.fillStyle = '#c89030'; g.fillRect(12, 12, W - 24, H - 24);
    g.fillStyle = '#0b0a10'; g.fillRect(20, 20, W - 40, H - 40);
    g.fillStyle = '#6a4a18'; g.fillRect(28, 28, W - 56, 2); g.fillRect(28, H - 30, W - 56, 2);

    // The moment, with a vignette closing in.
    const ix = 44, iy = 64, iw = W - 88;
    const ih = Math.round(iw * img.height / img.width);
    g.drawImage(img, ix, iy, iw, ih);
    const v = g.createRadialGradient(ix + iw / 2, iy + ih / 2, ih * 0.25, ix + iw / 2, iy + ih / 2, iw * 0.62);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(0,0,0,0.75)');
    g.fillStyle = v; g.fillRect(ix, iy, iw, ih);
    g.strokeStyle = '#c89030'; g.lineWidth = 3; g.strokeRect(ix - 2, iy - 2, iw + 4, ih + 4);

    g.textAlign = 'center';
    g.fillStyle = '#e8c070';
    g.font = '18px "Pixelify Sans", monospace';
    g.fillText('PACK MENTALITY', W / 2, 48);

    let y = iy + ih + 50;
    g.fillStyle = '#ffffff';
    g.font = '26px "Pixelify Sans", monospace';
    g.fillText(title, W / 2, y);

    // Plaque plate.
    y += 30;
    const px = 70, pw = W - 140, ph = H - y - 70;
    g.fillStyle = '#2a1e0c'; g.fillRect(px, y, pw, ph);
    g.strokeStyle = '#c89030'; g.lineWidth = 3; g.strokeRect(px, y, pw, ph);

    let ty = y + 50;
    g.fillStyle = '#ffe3a0';
    g.font = '34px "Pixelify Sans", monospace';
    g.fillText(_myName().toUpperCase(), W / 2, ty);

    if (team.length) {
      ty += 34;
      g.fillStyle = '#b89060';
      g.font = '14px "Pixelify Sans", monospace';
      g.fillText('ALONGSIDE', W / 2, ty);
      g.fillStyle = '#e8d8b0';
      g.font = '18px "Pixelify Sans", monospace';
      const rows = Math.max(1, Math.floor((y + ph - 24 - ty) / 24));
      team.slice(0, rows).forEach((n, i) => g.fillText(n.toUpperCase(), W / 2, ty + 28 + i * 24));
    }

    g.fillStyle = '#6a5a40';
    g.font = '12px "Pixelify Sans", monospace';
    g.fillText(new Date().toLocaleDateString(), W / 2, H - 42);
    return c;
  }

  function _show(canvas) {
    const wrap = document.createElement('div');
    wrap.style.cssText =
      'position:fixed;inset:0;z-index:2147483100;background:rgba(0,0,0,0.85);' +
      'display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:16px;';
    canvas.style.cssText = 'max-width:100%;max-height:74vh;image-rendering:pixelated;';
    wrap.appendChild(canvas);

    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:12px;';
    const btn = (label, fn) => {
      const b = document.createElement('button');
      b.textContent = label;
      b.style.cssText = 'font-family:"Pixelify Sans",monospace;font-size:16px;padding:10px 22px;' +
        'background:#2a1e0c;color:#ffe3a0;border:2px solid #c89030;border-radius:6px;';
      b.addEventListener('click', fn);
      row.appendChild(b);
    };
    btn('SAVE', () => _save(canvas));
    btn('CLOSE', () => wrap.remove());
    wrap.appendChild(row);
    document.body.appendChild(wrap);
  }

  function _save(canvas) {
    canvas.toBlob(async blob => {
      if (!blob) return;
      const file = new File([blob], 'pack-mentality.png', { type: 'image/png' });
      try {
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file] });
          return;
        }
      } catch (e) { if (e && e.name === 'AbortError') return; }
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'pack-mentality.png';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    }, 'image/png');
  }

  return { handle };
})();

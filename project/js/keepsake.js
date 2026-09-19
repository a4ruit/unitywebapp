// keepsake.js — the post-game plaque. Unity uploads this player's best-moment
// frame when the credits roll and sends:
//   keepsake|clientId|title|placed|damage|teammate,teammate,...
// The phone fetches its own frame once and composes the plaque on a canvas, so
// the server never renders anything.

const KeepsakeUI = (() => {

  const W = 540, H = 960;   // 9:16, the projection's own aspect

  function handle(msg) {
    if (typeof msg !== 'string' || !msg.startsWith('keepsake|')) return false;
    const p = msg.split('|');
    if (p[1] !== CLIENT_ID) return true;
    const title  = p[2] || '';
    const placed = parseInt(p[3]) || 0;
    const damage = parseInt(p[4]) || 0;
    const team   = (p[5] || '').split(',').map(s => s.trim()).filter(Boolean);
    _load(title, team, placed, damage);
    return true;
  }

  function _myColor() {
    const c = (typeof playerColor === 'string' && playerColor) ? playerColor : '#c89030';
    return c.startsWith('#') ? c : '#' + c;
  }

  function _favourite() {
    if (typeof cardUse !== 'object' || !cardUse) return null;
    let best = null;
    for (const k in cardUse) if (!best || cardUse[k].count > best.count) best = cardUse[k];
    return best;
  }

  function _myName() {
    return (typeof playerName === 'string' && playerName) ? playerName : 'YOU';
  }

  function _load(title, team, placed, damage) {
    const img = new Image();
    img.onload  = () => _show(_compose(img, title, team, placed, damage));
    img.onerror = () => console.warn('[keepsake] frame not available');
    img.src = `/keepsake/${encodeURIComponent(CLIENT_ID)}?t=${Date.now()}`;
  }

  // Largest font size (down to min) at which the text fits the width.
  function _fit(g, text, max, min, width, family) {
    let size = max;
    for (; size > min; size -= 2) {
      g.font = `${size}px ${family}`;
      if (g.measureText(text).width <= width) break;
    }
    g.font = `${size}px ${family}`;
    return size;
  }

  function _wrap(g, words, width) {
    const lines = [];
    let line = '';
    words.forEach(w => {
      const next = line ? line + '  ·  ' + w : w;
      if (g.measureText(next).width > width && line) { lines.push(line); line = w; }
      else line = next;
    });
    if (line) lines.push(line);
    return lines;
  }

  // Poster composition: the moment fills the card, the names carry it, and a
  // couple of numbers sit between them. Laid out bottom-up so nothing can run
  // off the edge.
  function _compose(img, title, team, placed, damage) {
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    const F = '"Pixelify Sans", monospace';

    const s  = Math.max(W / img.width, H / img.height);
    const dw = img.width * s, dh = img.height * s;
    g.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh);

    let gr = g.createLinearGradient(0, 0, 0, H * 0.16);
    gr.addColorStop(0, 'rgba(5,4,10,0.75)');
    gr.addColorStop(1, 'rgba(5,4,10,0)');
    g.fillStyle = gr; g.fillRect(0, 0, W, H * 0.16);

    gr = g.createLinearGradient(0, H * 0.42, 0, H);
    gr.addColorStop(0,    'rgba(5,4,10,0)');
    gr.addColorStop(0.45, 'rgba(5,4,10,0.82)');
    gr.addColorStop(1,    'rgba(5,4,10,0.97)');
    g.fillStyle = gr; g.fillRect(0, H * 0.42, W, H * 0.58);

    g.textAlign = 'center';
    const inner = W - 80;

    g.fillStyle = '#e8c070';
    _fit(g, title, 18, 12, inner, F);
    g.fillText(title, W / 2, 50);

    let y = H - 34;
    g.fillStyle = '#7a6c50';
    g.font = `12px ${F}`;
    g.fillText(`PACK MENTALITY  ·  ${new Date().toLocaleDateString()}`, W / 2, y);

    if (team.length) {
      g.font = `18px ${F}`;
      const lines = _wrap(g, team.map(n => n.toUpperCase()), inner).slice(0, 4);
      y -= 40;
      g.fillStyle = '#d8ccb0';
      for (let i = lines.length - 1; i >= 0; i--) { g.fillText(lines[i], W / 2, y); y -= 24; }
      y -= 6;
    }

    // Most used card: a small face of it, with how often it was played.
    const fav = _favourite();
    if (fav && typeof CardTextures !== 'undefined') {
      const face = CardTextures.buildFace(fav.card);
      const cw = 58, ch = 87;
      y -= ch + 10;
      g.font = `14px ${F}`;
      const label = `MOST USED  ·  ×${fav.count}`;
      const tw = g.measureText(label).width;
      const x0 = W / 2 - (cw + 14 + tw) / 2;
      g.drawImage(face, x0, y, cw, ch);
      g.textAlign = 'left';
      g.fillStyle = '#b89060';
      g.fillText(label, x0 + cw + 14, y + ch / 2 + 5);
      g.textAlign = 'center';
      y -= 6;
    }

    // Numbers, in the world's terms: what you sent into it, what you cleared.
    const stats = [];
    if (placed > 0) stats.push(`${placed} SEEDS SENT`);
    if (damage > 0) stats.push(`${damage} GLITCH CLEARED`);
    if (stats.length) {
      y -= 22;
      g.fillStyle = '#b89060';
      g.font = `15px ${F}`;
      g.fillText(stats.join('   ·   '), W / 2, y);
    }

    y -= 30;
    const name = _myName().toUpperCase();
    _fit(g, name, 88, 28, inner, F);
    g.fillStyle = '#000';
    g.fillText(name, W / 2 + 3, y + 3);
    g.fillStyle = '#ffe3a0';
    g.fillText(name, W / 2, y);

    // Border in the colour the player picked when they joined.
    const tint = _myColor();
    g.strokeStyle = tint; g.lineWidth = 6; g.strokeRect(9, 9, W - 18, H - 18);
    g.globalAlpha = 0.45;
    g.lineWidth = 2; g.strokeRect(17, 17, W - 34, H - 34);
    g.globalAlpha = 1;
    return c;
  }

  function _show(canvas) {
    const wrap = document.createElement('div');
    wrap.style.cssText =
      'position:fixed;inset:0;z-index:2147483100;background:rgba(0,0,0,0.85);' +
      'display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:16px;';
    canvas.style.cssText = 'width:auto;height:auto;max-width:100%;max-height:calc(100vh - 110px);image-rendering:pixelated;';
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

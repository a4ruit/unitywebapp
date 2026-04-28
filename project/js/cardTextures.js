// cardTextures.js — shared animated card face/back texture builders
// Reskinned: shapes now represent consumer waste items
// Exposes: CardTextures.buildFace(card, t), CardTextures.buildBack(), CardTextures.isAnimated(rarity)

const CardTextures = (() => {

  const RARITY_CFG = {
    common:           { border:'#607060', emissive:0x101810, emissiveIntensity:0.05, light:null },
    uncommon:         { border:'#4a8aaa', emissive:0x0a1820, emissiveIntensity:0.2,  light:{ color:0x4a8aaa, intensity:1.2, dist:5 } },
    rare:             { border:'#9a6ab8', emissive:0x120a1a, emissiveIntensity:0.3,  light:{ color:0x9a6ab8, intensity:1.8, dist:5 } },
    legendary:        { border:'#c89030', emissive:0x201000, emissiveIntensity:0.5,  light:{ color:0xc89030, intensity:2.5, dist:6 } },
    mythical:         { border:'#cc2200', emissive:0x200400, emissiveIntensity:0.6,  light:{ color:0xcc2200, intensity:3.0, dist:6 } },
    'luck-maxxing':   { border:'#cc44aa', emissive:0x1a0414, emissiveIntensity:0.65, light:{ color:0xcc44aa, intensity:3.2, dist:7 } },
    'legendary-alpha':{ border:'#ffffff', emissive:0x101010, emissiveIntensity:0.8,  light:{ color:0xffffff, intensity:4.0, dist:8 } },
  };

  const ANIMATED = new Set(['mythical','luck-maxxing','legendary-alpha']);

  function isAnimated(rarity) { return ANIMATED.has(rarity); }
  function getCfg(rarity)     { return RARITY_CFG[rarity] || RARITY_CFG.common; }

  function hexToRgb(hex) {
    const r = parseInt(hex.slice(1,3),16);
    const g = parseInt(hex.slice(3,5),16);
    const b = parseInt(hex.slice(5,7),16);
    return `${r},${g},${b}`;
  }

  function rainbow(t, offset = 0) {
    const h = ((t * 60 + offset) % 360 + 360) % 360;
    return `hsl(${h},100%,60%)`;
  }

  // ─── Shape drawers — reskinned as waste items ────────────────────────────────

  function drawShape(ctx, rarity, t) {
    const packType = typeof window !== 'undefined' ? window.activePackType : 'garbage';
    if (packType === 'ewaste')  { drawShapeEwaste(ctx, rarity, t);  return; }
    if (packType === 'adpack')  { drawShapeAdpack(ctx, rarity, t);  return; }

    ctx.save();
    ctx.translate(128, 148);

    if (rarity === 'common') {
      // Plastic bag — thin irregular trapezoid with a knotted top
      ctx.fillStyle = 'rgba(96,112,96,0.7)';
      ctx.strokeStyle = '#607060';
      ctx.lineWidth = 2;
      // Bag body
      ctx.beginPath();
      ctx.moveTo(-18, -28);
      ctx.lineTo(-24, 28);
      ctx.lineTo(24, 28);
      ctx.lineTo(18, -28);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
      // Knot at top
      ctx.beginPath();
      ctx.arc(0, -30, 5, 0, Math.PI * 2);
      ctx.fillStyle = '#607060'; ctx.fill();
      // Handles
      ctx.beginPath();
      ctx.moveTo(-8, -28); ctx.quadraticCurveTo(-14, -42, -6, -44);
      ctx.moveTo(8, -28);  ctx.quadraticCurveTo(14, -42, 6, -44);
      ctx.strokeStyle = '#607060'; ctx.lineWidth = 2; ctx.stroke();

    } else if (rarity === 'uncommon') {
      // Cardboard box — slightly crushed perspective box
      ctx.fillStyle = 'rgba(74,138,170,0.3)';
      ctx.strokeStyle = '#4a8aaa';
      ctx.lineWidth = 2;
      // Front face
      ctx.beginPath();
      ctx.rect(-28, -12, 56, 40);
      ctx.fill(); ctx.stroke();
      // Top flaps — open
      ctx.beginPath();
      ctx.moveTo(-28, -12); ctx.lineTo(-20, -32); ctx.lineTo(12, -32); ctx.lineTo(4, -12);
      ctx.fillStyle = 'rgba(74,138,170,0.2)'; ctx.fill(); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(28, -12); ctx.lineTo(36, -32); ctx.lineTo(12, -32); ctx.lineTo(4, -12);
      ctx.fillStyle = 'rgba(74,138,170,0.15)'; ctx.fill(); ctx.stroke();
      // Side face
      ctx.beginPath();
      ctx.moveTo(28, -12); ctx.lineTo(36, -4); ctx.lineTo(36, 36); ctx.lineTo(28, 28);
      ctx.fillStyle = 'rgba(74,138,170,0.2)'; ctx.fill(); ctx.stroke();
      // Tape line
      ctx.strokeStyle = 'rgba(200,180,100,0.5)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(-28, 8); ctx.lineTo(28, 8); ctx.stroke();

    } else if (rarity === 'rare') {
      // Crushed can — cylinder viewed at angle, dented
      ctx.fillStyle = 'rgba(154,106,184,0.5)';
      ctx.strokeStyle = '#9a6ab8';
      ctx.lineWidth = 2;
      // Can body
      ctx.beginPath();
      ctx.ellipse(0, 20, 22, 8, 0, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(0, -20, 22, 8, 0, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-22, -20); ctx.lineTo(-22, 20);
      ctx.moveTo(22, -20);  ctx.lineTo(22, 20);
      ctx.stroke();
      ctx.fillStyle = 'rgba(154,106,184,0.3)';
      ctx.fillRect(-22, -20, 44, 40);
      // Dent
      ctx.strokeStyle = 'rgba(100,60,140,0.8)'; ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-10, -10); ctx.quadraticCurveTo(0, 2, 8, -6);
      ctx.stroke();
      // Tab
      ctx.fillStyle = '#9a6ab8';
      ctx.beginPath();
      ctx.ellipse(0, -22, 6, 2, 0, 0, Math.PI * 2);
      ctx.fill();

    } else if (rarity === 'legendary') {
      // Glass bottle — tall elegant silhouette
      ctx.fillStyle = 'rgba(200,144,48,0.25)';
      ctx.strokeStyle = '#c89030';
      ctx.lineWidth = 2;
      // Bottle body
      ctx.beginPath();
      ctx.moveTo(-16, 36);
      ctx.lineTo(-18, 0);
      ctx.quadraticCurveTo(-18, -16, -8, -24);
      ctx.lineTo(-6, -40);
      ctx.lineTo(6, -40);
      ctx.lineTo(8, -24);
      ctx.quadraticCurveTo(18, -16, 18, 0);
      ctx.lineTo(16, 36);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
      // Shine
      ctx.strokeStyle = 'rgba(255,220,100,0.3)'; ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-10, 20); ctx.lineTo(-12, -10);
      ctx.stroke();
      // Label area
      ctx.strokeStyle = 'rgba(200,144,48,0.4)'; ctx.lineWidth = 1;
      ctx.strokeRect(-14, 0, 28, 20);

    } else if (rarity === 'mythical') {
      // Bottle cap — low flat disc, rotates
      const rot = t * Math.PI * 0.4;
      ctx.rotate(rot);
      ctx.fillStyle = `rgba(204,34,0,${0.6 + Math.sin(t*3)*0.2})`;
      ctx.strokeStyle = '#cc2200';
      ctx.lineWidth = 2;
      // Outer disc
      ctx.beginPath();
      ctx.arc(0, 0, 28, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
      // Crimped edge — serrated
      for (let i = 0; i < 21; i++) {
        const a = (i / 21) * Math.PI * 2;
        const r = i % 2 === 0 ? 28 : 24;
        const x = Math.cos(a) * r;
        const y = Math.sin(a) * r;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.strokeStyle = `rgba(255,80,40,${0.4 + Math.sin(t*4)*0.3})`; ctx.lineWidth = 1.5;
      ctx.stroke();
      // Inner circle
      ctx.beginPath();
      ctx.arc(0, 0, 12, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(180,20,0,${0.5 + Math.sin(t*4+1)*0.3})`; ctx.fill();

    } else if (rarity === 'luck-maxxing') {
      // Three cigarette butts — orbit each other
      const orbitR = 20;
      for (let i = 0; i < 3; i++) {
        const angle = (i / 3) * Math.PI * 2 + t * 1.2;
        const cx = Math.cos(angle) * orbitR;
        const cy = Math.sin(angle) * orbitR;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(angle + Math.PI / 4);
        // Butt body
        ctx.fillStyle = `rgba(204,68,170,${0.5 + Math.sin(t*3+i)*0.3})`;
        ctx.strokeStyle = '#cc44aa'; ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.rect(-4, -12, 8, 20);
        ctx.fill(); ctx.stroke();
        // Filter tip
        ctx.fillStyle = `rgba(255,160,80,0.7)`;
        ctx.fillRect(-4, 8, 8, 6);
        // Ash tip
        ctx.fillStyle = 'rgba(200,200,200,0.6)';
        ctx.beginPath();
        ctx.ellipse(0, -12, 4, 2, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

    } else if (rarity === 'legendary-alpha') {
      // Styrofoam chunk — irregular lumpy mass, rainbow shimmer
      const rot    = t * Math.PI * 0.3;
      const pulse  = 1 + Math.sin(t * 2) * 0.08;
      ctx.rotate(rot);
      ctx.scale(pulse, pulse);
      // Irregular blob shape
      ctx.beginPath();
      const points = [
        [0, -40], [28, -28], [38, 0], [28, 30],
        [8, 42], [-20, 36], [-36, 14], [-32, -18], [-14, -38]
      ];
      ctx.moveTo(points[0][0], points[0][1]);
      for (let i = 1; i < points.length; i++) {
        const [x, y] = points[i];
        const [px, py] = points[i-1];
        const cx = (px + x) / 2;
        const cy = (py + y) / 2;
        ctx.quadraticCurveTo(px, py, cx, cy);
      }
      ctx.closePath();
      // Rainbow fill for styrofoam
      const grad = ctx.createLinearGradient(-38,-40,38,42);
      for (let i = 0; i <= 6; i++) {
        grad.addColorStop(i/6, rainbow(t, i*60));
      }
      ctx.fillStyle = grad;
      ctx.fill();
      // White highlight — styrofoam reads as white
      ctx.fillStyle = `rgba(255,255,255,${0.3 + Math.sin(t*4)*0.2})`;
      ctx.beginPath();
      ctx.ellipse(-8, -12, 14, 8, -0.5, 0, Math.PI * 2);
      ctx.fill();
      // Porous texture dots
      ctx.fillStyle = `rgba(255,255,255,${0.15 + Math.sin(t*3)*0.1})`;
      [[-16,0],[8,12],[-4,-24],[20,-8],[-20,20]].forEach(([x,y]) => {
        ctx.beginPath(); ctx.arc(x,y,3,0,Math.PI*2); ctx.fill();
      });
    }

    ctx.restore();
  }

  // ─── E-WASTE shape drawers ─────────────────────────────────────────────────

  function drawShapeEwaste(ctx, rarity, t, cfg) {
    ctx.save();
    ctx.translate(128, 148);

    if (rarity === 'common') {
      // Tangled cable — coiled USB wire
      ctx.strokeStyle = '#607060'; ctx.lineWidth = 3; ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(0, 0, 28, 0, Math.PI * 1.5);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, -8, 18, 0.3, Math.PI * 1.8);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(4, 4, 10, 0.6, Math.PI * 1.6);
      ctx.stroke();
      // USB-A plug at one end
      ctx.fillStyle = '#607060';
      ctx.fillRect(24, -8, 10, 6);
      ctx.strokeStyle = '#404840'; ctx.lineWidth = 1;
      ctx.strokeRect(24, -8, 10, 6);
      // Connector pins
      ctx.fillStyle = '#303830';
      ctx.fillRect(25, -7, 2, 4); ctx.fillRect(29, -7, 2, 4);

    } else if (rarity === 'uncommon') {
      // Dead battery — rectangular battery with low charge indicator
      ctx.fillStyle = 'rgba(74,138,170,0.3)';
      ctx.strokeStyle = '#4a8aaa'; ctx.lineWidth = 2;
      // Battery body
      ctx.beginPath(); ctx.roundRect(-30, -18, 56, 36, 4); ctx.fill(); ctx.stroke();
      // Battery terminal nub
      ctx.fillStyle = 'rgba(74,138,170,0.5)';
      ctx.fillRect(26, -8, 8, 16);
      ctx.strokeRect(26, -8, 8, 16);
      // Charge segments — mostly empty
      ctx.fillStyle = 'rgba(74,138,170,0.8)';
      ctx.fillRect(-26, -12, 8, 24);  // only first segment filled
      ctx.fillStyle = 'rgba(74,138,170,0.2)';
      ctx.fillRect(-14, -12, 8, 24);
      ctx.fillRect(-2,  -12, 8, 24);
      ctx.fillRect(10,  -12, 8, 24);
      // Dividers
      ctx.strokeStyle = '#4a8aaa'; ctx.lineWidth = 1;
      [-14,-2,10].forEach(x=>{ ctx.beginPath(); ctx.moveTo(x,-12); ctx.lineTo(x,12); ctx.stroke(); });
      // Low battery X
      ctx.strokeStyle = 'rgba(200,50,50,0.8)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(-4,-6); ctx.lineTo(4,6); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(4,-6); ctx.lineTo(-4,6); ctx.stroke();

    } else if (rarity === 'rare') {
      // Cracked screen — rectangle with fracture lines
      ctx.fillStyle = 'rgba(154,106,184,0.25)';
      ctx.strokeStyle = '#9a6ab8'; ctx.lineWidth = 2;
      ctx.fillRect(-32, -40, 64, 80);
      ctx.strokeRect(-32, -40, 64, 80);
      // Screen bezel
      ctx.strokeStyle = 'rgba(154,106,184,0.5)'; ctx.lineWidth = 1;
      ctx.strokeRect(-28, -36, 56, 72);
      // Crack pattern from impact point
      ctx.strokeStyle = 'rgba(154,106,184,0.9)'; ctx.lineWidth = 1.5;
      const cracks = [
        [[0,-10],[20,-30]],  [[0,-10],[-25,-25]], [[0,-10],[30,10]],
        [[0,-10],[-30,20]],  [[0,-10],[15,35]],   [[0,-10],[-10,40]],
        [[20,-30],[32,-38]], [[-25,-25],[-30,-40]],
        [[30,10],[32,30]],   [[-30,20],[-32,38]],
      ];
      for (const [[x1,y1],[x2,y2]] of cracks) {
        ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke();
      }
      // Impact point glow
      ctx.beginPath(); ctx.arc(0,-10,3,0,Math.PI*2);
      ctx.fillStyle = 'rgba(200,150,255,0.8)'; ctx.fill();

    } else if (rarity === 'legendary') {
      // Old iPod — classic rounded rectangle with click wheel
      ctx.fillStyle = 'rgba(200,144,48,0.2)';
      ctx.strokeStyle = '#c89030'; ctx.lineWidth = 2;
      // Body
      ctx.beginPath(); ctx.roundRect(-24, -44, 48, 88, 10); ctx.fill(); ctx.stroke();
      // Screen
      ctx.fillStyle = 'rgba(200,144,48,0.15)';
      ctx.strokeStyle = 'rgba(200,144,48,0.5)'; ctx.lineWidth = 1;
      ctx.fillRect(-18, -38, 36, 26); ctx.strokeRect(-18,-38,36,26);
      // Dead screen — X
      ctx.strokeStyle = 'rgba(200,144,48,0.4)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(-14,-34); ctx.lineTo(14,-16); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(14,-34); ctx.lineTo(-14,-16); ctx.stroke();
      // Click wheel
      ctx.beginPath(); ctx.arc(0, 22, 18, 0, Math.PI*2);
      ctx.fillStyle = 'rgba(200,144,48,0.1)'; ctx.fill();
      ctx.strokeStyle = '#c89030'; ctx.lineWidth = 2; ctx.stroke();
      // Inner ring
      ctx.beginPath(); ctx.arc(0, 22, 8, 0, Math.PI*2);
      ctx.strokeStyle = 'rgba(200,144,48,0.5)'; ctx.lineWidth = 1; ctx.stroke();
      // Wheel marks at N/S/E/W
      [[0,-18+22],[0,18+22],[-18,22],[18,22]].forEach(([x,y])=>{
        ctx.beginPath(); ctx.arc(x,y,2,0,Math.PI*2);
        ctx.fillStyle = 'rgba(200,144,48,0.6)'; ctx.fill();
      });

    } else if (rarity === 'mythical') {
      // Laptop shell — open lid perspective
      const rot = t * Math.PI * 0.15;
      ctx.rotate(Math.sin(rot) * 0.1);
      ctx.fillStyle = `rgba(204,34,0,${0.25+Math.sin(t*2)*0.1})`;
      ctx.strokeStyle = '#cc2200'; ctx.lineWidth = 2;
      // Base
      ctx.beginPath();
      ctx.moveTo(-34, 8); ctx.lineTo(34, 8);
      ctx.lineTo(30, 28); ctx.lineTo(-30, 28);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      // Lid — open at angle
      ctx.beginPath();
      ctx.moveTo(-34, 8); ctx.lineTo(34, 8);
      ctx.lineTo(28, -32); ctx.lineTo(-28, -32);
      ctx.closePath();
      ctx.fillStyle = `rgba(204,34,0,${0.2+Math.sin(t*2)*0.08})`;
      ctx.fill(); ctx.stroke();
      // Screen on lid — dead
      ctx.fillStyle = 'rgba(10,4,4,0.8)';
      ctx.fillRect(-22,-28,44,34);
      ctx.strokeStyle = 'rgba(204,34,0,0.4)'; ctx.lineWidth=1;
      ctx.strokeRect(-22,-28,44,34);
      // Hinge
      ctx.fillStyle = 'rgba(204,34,0,0.6)';
      ctx.fillRect(-12, 6, 24, 4);
      // Keyboard dots on base
      for(let r=0;r<2;r++) for(let c=0;c<8;c++) {
        ctx.beginPath(); ctx.arc(-28+c*8, 14+r*6, 2, 0, Math.PI*2);
        ctx.fillStyle=`rgba(204,34,0,${0.3+Math.sin(t*3+c)*0.2})`; ctx.fill();
      }

    } else if (rarity === 'luck-maxxing') {
      // Circuit board — three orbiting component chips
      const orbitR = 20;
      const circR  = 10 + Math.sin(t * 2) * 2;
      for (let i = 0; i < 3; i++) {
        const angle = (i/3)*Math.PI*2 + t * 1.2;
        const cx    = Math.cos(angle) * orbitR;
        const cy    = Math.sin(angle) * orbitR;
        ctx.save(); ctx.translate(cx, cy);
        // IC chip
        ctx.fillStyle = `rgba(204,68,170,${0.5+Math.sin(t*3+i)*0.3})`;
        ctx.strokeStyle = '#cc44aa'; ctx.lineWidth = 1;
        ctx.fillRect(-8,-5,16,10); ctx.strokeRect(-8,-5,16,10);
        // Pins on sides
        for(let p=0;p<3;p++){
          ctx.fillStyle='rgba(204,68,170,0.7)';
          ctx.fillRect(-10,-3+p*3,2,2);
          ctx.fillRect(8,-3+p*3,2,2);
        }
        // Glow ring
        ctx.beginPath(); ctx.arc(0,0,circR,0,Math.PI*2);
        ctx.strokeStyle=`rgba(255,120,210,${0.2+Math.sin(t*2+i)*0.15})`;
        ctx.lineWidth=1; ctx.stroke();
        ctx.restore();
      }
      // Centre PCB trace pattern
      ctx.strokeStyle='rgba(204,68,170,0.4)'; ctx.lineWidth=1;
      [[-12,0,0,0],[12,0,0,0],[0,-12,0,0],[0,12,0,0]].forEach(([x1,y1,x2,y2])=>{
        ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke();
      });

    } else if (rarity === 'legendary-alpha') {
      // RAM stick — long thin board with chips, rainbow shimmer
      const rot     = t * Math.PI * 0.15;
      const pulse   = 1 + Math.sin(t * 2) * 0.05;
      ctx.rotate(rot * 0.3); ctx.scale(pulse, pulse);

      // PCB board
      const grad = ctx.createLinearGradient(-40, -8, 40, -8);
      for(let i=0;i<=6;i++) {
        const h=((t*60+i*60)%360+360)%360;
        grad.addColorStop(i/6,`hsla(${h},100%,60%,0.8)`);
      }
      ctx.fillStyle = grad;
      ctx.fillRect(-40, -8, 80, 16);
      ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth=1;
      ctx.strokeRect(-40, -8, 80, 16);

      // Memory chips along top
      for(let i=0;i<6;i++){
        const cx=-30+i*12;
        ctx.fillStyle=`rgba(255,255,255,${0.4+Math.sin(t*4+i)*0.3})`;
        ctx.fillRect(cx-4,-6,8,7);
        ctx.strokeStyle='rgba(255,255,255,0.3)'; ctx.lineWidth=0.5;
        ctx.strokeRect(cx-4,-6,8,7);
      }

      // Gold edge connector pins at bottom
      for(let i=0;i<16;i++){
        const px=-38+i*5;
        ctx.fillStyle=`rgba(255,220,80,${0.6+Math.sin(t*5+i*0.5)*0.4})`;
        ctx.fillRect(px,6,3,10);
      }

      // Notch in connector
      ctx.fillStyle='rgba(0,0,0,0.8)';
      ctx.fillRect(-2,6,4,10);

      // White core glow
      ctx.beginPath(); ctx.arc(0,0,4+Math.sin(t*4)*1,0,Math.PI*2);
      ctx.fillStyle=`rgba(255,255,255,${0.5+Math.sin(t*5)*0.4})`; ctx.fill();
    }

    ctx.restore();
  }

  // ─── AD PACK shape drawers ──────────────────────────────────────────────────

  function drawShapeAdpack(ctx, rarity, t) {
    ctx.save();
    ctx.translate(128, 148);
    const gold   = '#c8a028';
    const goldDim = 'rgba(200,160,40,0.4)';
    const goldGlow = 'rgba(200,160,40,0.7)';
    const chrome  = 'rgba(220,200,160,0.9)';

    if (rarity === 'common') {
      // Flyer — crumpled paper sheet with text lines
      ctx.fillStyle = 'rgba(200,160,40,0.15)';
      ctx.strokeStyle = gold; ctx.lineWidth = 1.5;
      // Slightly skewed rectangle
      ctx.beginPath();
      ctx.moveTo(-26, -32); ctx.lineTo(28, -30);
      ctx.lineTo(30, 32);   ctx.lineTo(-28, 34);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      // Text lines
      ctx.fillStyle = goldDim;
      [-18,-10,-2,6,14,22].forEach(y => ctx.fillRect(-20, y, Math.random()*10+28, 2));
      // Headline bar
      ctx.fillStyle = 'rgba(200,160,40,0.4)';
      ctx.fillRect(-20, -26, 44, 6);
      // Corner fold
      ctx.fillStyle = 'rgba(200,160,40,0.25)';
      ctx.beginPath(); ctx.moveTo(18,22); ctx.lineTo(30,22); ctx.lineTo(30,34); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = goldDim; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(18,22); ctx.lineTo(30,22); ctx.lineTo(30,34); ctx.stroke();

    } else if (rarity === 'uncommon') {
      // Pop-up ad — rectangle with X button, close button you can't click
      ctx.fillStyle = 'rgba(200,160,40,0.12)';
      ctx.strokeStyle = gold; ctx.lineWidth = 2;
      ctx.fillRect(-32, -24, 64, 48); ctx.strokeRect(-32, -24, 64, 48);
      // Title bar
      ctx.fillStyle = 'rgba(200,160,40,0.35)';
      ctx.fillRect(-32, -24, 64, 10);
      // X button — red, unfunctional
      ctx.fillStyle = 'rgba(220,50,50,0.8)';
      ctx.fillRect(20, -23, 10, 8);
      ctx.strokeStyle = 'rgba(255,100,100,0.9)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(22,-21); ctx.lineTo(28,-17); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(28,-21); ctx.lineTo(22,-17); ctx.stroke();
      // Ad content lines
      ctx.fillStyle = goldDim;
      [-8,0,8].forEach(y => ctx.fillRect(-24, y, 48, 3));
      // Big CTA button
      ctx.fillStyle = 'rgba(200,160,40,0.5)';
      ctx.fillRect(-20, 14, 40, 8);
      ctx.fillStyle = gold;
      ctx.font = '8px "Share Tech Mono", monospace';
      ctx.textAlign = 'center'; ctx.fillText('CLICK HERE', 0, 21);

    } else if (rarity === 'rare') {
      // Digital billboard — tall rectangle, LED-style display
      ctx.fillStyle = 'rgba(200,160,40,0.1)';
      ctx.strokeStyle = gold; ctx.lineWidth = 2;
      ctx.fillRect(-36, -38, 72, 52); ctx.strokeRect(-36, -38, 72, 52);
      // LED dot grid
      ctx.fillStyle = goldDim;
      for (let r=0;r<5;r++) for (let c=0;c<9;c++)
        if (Math.random() > 0.4) {
          ctx.beginPath(); ctx.arc(-30+c*8, -30+r*8, 2, 0, Math.PI*2); ctx.fill();
        }
      // Bright brand line
      ctx.fillStyle = gold;
      ctx.fillRect(-28, -10, 56, 4);
      ctx.fillStyle = 'rgba(200,160,40,0.3)';
      ctx.fillRect(-28, -4, 56, 3); ctx.fillRect(-28, 2, 56, 3);
      // Billboard legs
      ctx.strokeStyle = goldDim; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(-16,14); ctx.lineTo(-12,38); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(16,14);  ctx.lineTo(12,38);  ctx.stroke();
      // Glow
      ctx.shadowColor = goldGlow; ctx.shadowBlur = 8;
      ctx.strokeStyle = gold; ctx.lineWidth = 1;
      ctx.strokeRect(-36,-38,72,52);
      ctx.shadowBlur = 0;

    } else if (rarity === 'legendary') {
      // Loyalty card — credit-card proportions, holographic sheen
      ctx.save();
      ctx.rotate(-0.15);
      // Card body
      const grad = ctx.createLinearGradient(-40,-22,40,22);
      grad.addColorStop(0,   `hsla(${(t*30)%360},70%,40%,0.6)`);
      grad.addColorStop(0.4, `hsla(${(t*30+60)%360},80%,55%,0.6)`);
      grad.addColorStop(0.7, `hsla(${(t*30+120)%360},70%,45%,0.6)`);
      grad.addColorStop(1,   `hsla(${(t*30+180)%360},70%,40%,0.6)`);
      ctx.fillStyle = grad;
      ctx.strokeStyle = gold; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.roundRect(-40,-22,80,44,4);
      ctx.fill(); ctx.stroke();
      // Chip
      ctx.fillStyle = 'rgba(200,160,40,0.6)';
      ctx.fillRect(-32,-10,18,16); ctx.strokeStyle = gold; ctx.lineWidth=1; ctx.strokeRect(-32,-10,18,16);
      ctx.strokeStyle='rgba(200,160,40,0.4)';
      ctx.beginPath();ctx.moveTo(-32,-4);ctx.lineTo(-14,-4);ctx.stroke();
      ctx.beginPath();ctx.moveTo(-32,2);ctx.lineTo(-14,2);ctx.stroke();
      ctx.beginPath();ctx.moveTo(-26,-10);ctx.lineTo(-26,6);ctx.stroke();
      ctx.beginPath();ctx.moveTo(-20,-10);ctx.lineTo(-20,6);ctx.stroke();
      // Numbers
      ctx.fillStyle = gold; ctx.font = '6px "Share Tech Mono",monospace'; ctx.textAlign='center';
      ctx.fillText('**** **** **** CONSUME', 4, 16);
      ctx.restore();

    } else if (rarity === 'mythical') {
      // Sponsored content — document with "AD" stamp, slowly rotates
      ctx.rotate(Math.sin(t*1.5)*0.08);
      ctx.fillStyle = 'rgba(200,160,40,0.1)';
      ctx.strokeStyle = gold; ctx.lineWidth = 1.5;
      ctx.fillRect(-28,-38,56,72); ctx.strokeRect(-28,-38,56,72);
      // Content lines (looks like editorial)
      ctx.fillStyle = goldDim;
      [-28,-20,-12,-4,4,12,20].forEach(y=>ctx.fillRect(-22,y,Math.random()*10+30,2));
      // "AD" stamp — diagonal, red
      ctx.save(); ctx.rotate(0.4);
      ctx.strokeStyle = 'rgba(220,50,50,0.7)'; ctx.lineWidth=3;
      ctx.strokeRect(-18,-12,36,24);
      ctx.fillStyle = 'rgba(220,50,50,0.7)';
      ctx.font = 'bold 20px "VT323",monospace'; ctx.textAlign='center';
      ctx.fillText('AD', 0, 8);
      ctx.restore();
      // "Sponsored" tiny label
      ctx.fillStyle = 'rgba(200,160,40,0.4)';
      ctx.font = '6px "Share Tech Mono",monospace'; ctx.textAlign='center';
      ctx.fillText('SPONSORED CONTENT', 0, -32);

    } else if (rarity === 'luck-maxxing') {
      // Terms & Conditions — towering stack of pages
      const pages = 5;
      for (let i=pages-1;i>=0;i--) {
        const ox=(i-2)*1.5, oy=(i-2)*2;
        ctx.fillStyle = `rgba(200,160,40,${0.06+i*0.03})`;
        ctx.strokeStyle = `rgba(200,160,40,${0.3+i*0.1})`; ctx.lineWidth=1;
        ctx.fillRect(-24+ox,-36+oy,48,68); ctx.strokeRect(-24+ox,-36+oy,48,68);
      }
      // Top page with dense text lines
      [-26,-18,-10,-2,6,14,22].forEach(y=>{
        ctx.fillStyle=`rgba(200,160,40,${0.15+Math.random()*0.2})`;
        ctx.fillRect(-18,y,Math.random()*5+28,1.5);
      });
      // Page count badge
      ctx.fillStyle='rgba(200,160,40,0.5)';
      ctx.beginPath();ctx.arc(18,-28,8,0,Math.PI*2);ctx.fill();
      ctx.fillStyle=gold; ctx.font='6px "Share Tech Mono",monospace'; ctx.textAlign='center';
      ctx.fillText('94',18,-25);
      // Pulsing glow
      ctx.shadowColor=goldGlow; ctx.shadowBlur=6+Math.sin(t*3)*4;
      ctx.strokeStyle=gold; ctx.lineWidth=1;
      ctx.strokeRect(-24,-36,48,68);
      ctx.shadowBlur=0;

    } else if (rarity === 'legendary-alpha') {
      // Data Centre — brutalist building with heat exhaust and server racks
      const pulse = Math.sin(t * 2) * 0.15;

      // Building body
      const bgrad = ctx.createLinearGradient(-36,-44,36,-44);
      bgrad.addColorStop(0, `rgba(200,160,40,${0.35+pulse})`);
      bgrad.addColorStop(0.5, `rgba(220,180,60,${0.5+pulse})`);
      bgrad.addColorStop(1, `rgba(200,160,40,${0.35+pulse})`);
      ctx.fillStyle = bgrad;
      ctx.strokeStyle = gold; ctx.lineWidth = 2;
      ctx.fillRect(-36,-44,72,68); ctx.strokeRect(-36,-44,72,68);

      // Server rack windows — glowing
      for(let r=0;r<4;r++) for(let c=0;c<4;c++){
        const on = Math.sin(t*5+r*1.3+c*0.7)>0;
        ctx.fillStyle = on ? `rgba(200,160,40,0.8)` : `rgba(60,40,10,0.8)`;
        ctx.fillRect(-30+c*16,-38+r*14,10,8);
        if(on){ctx.shadowColor=goldGlow;ctx.shadowBlur=4;}
        ctx.strokeStyle='rgba(200,160,40,0.3)';ctx.lineWidth=0.5;
        ctx.strokeRect(-30+c*16,-38+r*14,10,8);
        ctx.shadowBlur=0;
      }

      // Cooling tower exhaust — animated
      for(let i=0;i<3;i++){
        const ex=-20+i*20;
        const ey=-44-8-Math.sin(t*3+i)*4;
        ctx.fillStyle=`rgba(200,200,200,${0.15+Math.sin(t*2+i)*0.1})`;
        ctx.beginPath();ctx.ellipse(ex,ey,6,10+Math.sin(t*2+i)*3,0,0,Math.PI*2);ctx.fill();
      }

      // Ground — foundation
      ctx.fillStyle='rgba(200,160,40,0.3)';
      ctx.fillRect(-40,24,80,4);

      // "DATA" label
      ctx.fillStyle=gold; ctx.font='10px "VT323",monospace'; ctx.textAlign='center';
      ctx.shadowColor=goldGlow; ctx.shadowBlur=8;
      ctx.fillText('DATA CENTRE',0,36);
      ctx.shadowBlur=0;

      // Pulsing outer glow
      ctx.strokeStyle=`rgba(200,160,40,${0.3+pulse*2})`;
      ctx.lineWidth=1;
      ctx.strokeRect(-38,-46,76,76);
    }

    ctx.restore();
  }

  // ─── Animated border ────────────────────────────────────────────────────────

  function drawBorder(ctx, rarity, t) {
    const cfg = getCfg(rarity);

    if (rarity === 'legendary-alpha') {
      const grad = ctx.createLinearGradient(0,0,256,384);
      for (let i = 0; i <= 8; i++) { grad.addColorStop(i/8, rainbow(t, i*45)); }
      ctx.strokeStyle = grad; ctx.lineWidth = 5;
      ctx.strokeRect(5,5,246,374);
      ctx.strokeStyle = `rgba(255,255,255,0.2)`; ctx.lineWidth = 1.5;
      ctx.strokeRect(10,10,236,364);
    } else if (rarity === 'luck-maxxing') {
      const alpha = 0.7 + Math.sin(t * 3) * 0.3;
      ctx.strokeStyle = `rgba(204,68,170,${alpha})`; ctx.lineWidth = 5;
      ctx.strokeRect(5,5,246,374);
      ctx.strokeStyle = `rgba(255,120,210,0.2)`; ctx.lineWidth = 1.5;
      ctx.strokeRect(10,10,236,364);
    } else if (rarity === 'mythical') {
      const alpha = 0.7 + Math.sin(t * 4) * 0.3;
      ctx.strokeStyle = `rgba(204,34,0,${alpha})`; ctx.lineWidth = 5;
      ctx.strokeRect(5,5,246,374);
      ctx.strokeStyle = `rgba(255,80,40,0.25)`; ctx.lineWidth = 1.5;
      ctx.strokeRect(10,10,236,364);
    } else {
      ctx.strokeStyle = cfg.border; ctx.lineWidth = 5;
      ctx.strokeRect(5,5,246,374);
      ctx.strokeStyle = `rgba(${hexToRgb(cfg.border)},0.3)`; ctx.lineWidth = 1.5;
      ctx.strokeRect(10,10,236,364);
    }
  }

  // ─── Animated background ────────────────────────────────────────────────────

  function drawBackground(ctx, rarity, t) {
    ctx.fillStyle = '#0f160f';
    ctx.fillRect(0,0,256,384);

    const cfg = getCfg(rarity);

    if (rarity === 'legendary-alpha') {
      const grad = ctx.createRadialGradient(128,192,0,128,192,200);
      grad.addColorStop(0, `hsla(${(t*40)%360},80%,20%,0.4)`);
      grad.addColorStop(0.5, `hsla(${(t*40+120)%360},80%,10%,0.2)`);
      grad.addColorStop(1, 'transparent');
      ctx.fillStyle = grad; ctx.fillRect(0,0,256,384);
    } else if (rarity === 'luck-maxxing') {
      const grad = ctx.createRadialGradient(128,192,0,128,192,180);
      grad.addColorStop(0, `rgba(204,68,170,${0.1 + Math.sin(t*2)*0.05})`);
      grad.addColorStop(1, 'transparent');
      ctx.fillStyle = grad; ctx.fillRect(0,0,256,384);
    } else if (rarity === 'mythical') {
      const grad = ctx.createRadialGradient(128,192,0,128,192,180);
      grad.addColorStop(0, `rgba(204,34,0,${0.08 + Math.sin(t*3)*0.04})`);
      grad.addColorStop(1, 'transparent');
      ctx.fillStyle = grad; ctx.fillRect(0,0,256,384);
    } else if (rarity === 'legendary') {
      const grad = ctx.createRadialGradient(128,192,0,128,192,160);
      grad.addColorStop(0,'rgba(200,144,48,0.12)');
      grad.addColorStop(1,'transparent');
      ctx.fillStyle = grad; ctx.fillRect(0,0,256,384);
    }

    const gridColor = rarity === 'legendary-alpha'
      ? `rgba(255,255,255,0.06)`
      : `rgba(${hexToRgb(cfg.border)},0.1)`;
    ctx.strokeStyle = gridColor; ctx.lineWidth = 1;
    for (let x = -384; x < 512; x += 20) {
      ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x+384,384); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x+384,0); ctx.lineTo(x,384); ctx.stroke();
    }

    for (let y = 0; y < 384; y += 4) {
      ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.fillRect(0,y+2,256,2);
    }
  }

  // ─── Corner brackets ────────────────────────────────────────────────────────

  function drawCorners(ctx, rarity, t) {
    const color = rarity === 'legendary-alpha' ? rainbow(t, 0) : getCfg(rarity).border;
    ctx.strokeStyle = color; ctx.lineWidth = 2;
    const b = 14, bp = 14;
    [[bp,bp,1,1],[256-bp,bp,-1,1],[bp,384-bp,1,-1],[256-bp,384-bp,-1,-1]].forEach(([x,y,sx,sy]) => {
      ctx.beginPath(); ctx.moveTo(x,y+sy*b); ctx.lineTo(x,y); ctx.lineTo(x+sx*b,y); ctx.stroke();
    });
  }

  // ─── Text labels ────────────────────────────────────────────────────────────

  function drawLabels(ctx, card, rarity, t) {
    const cfg = getCfg(rarity);

    let nameColor, rarityColor;
    if (rarity === 'legendary-alpha') {
      nameColor   = rainbow(t, 30);
      rarityColor = rainbow(t, 90);
    } else {
      nameColor   = cfg.border;
      rarityColor = `rgba(${hexToRgb(cfg.border)},0.7)`;
    }

    ctx.font = '11px "Share Tech Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = rarityColor;
    ctx.fillText(rarity.toUpperCase(), 128, 218);

    ctx.font = 'bold 30px "VT323", monospace';
    ctx.fillStyle = nameColor;
    if (rarity !== 'legendary-alpha') { ctx.shadowColor = nameColor; ctx.shadowBlur = 8; }
    ctx.fillText(card.name.toUpperCase(), 128, 254);
    ctx.shadowBlur = 0;

    ctx.strokeStyle = `rgba(${rarity === 'legendary-alpha' ? '255,255,255' : hexToRgb(cfg.border)},0.3)`;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(28,266); ctx.lineTo(228,266); ctx.stroke();

    ctx.font = '12px "Share Tech Mono", monospace';
    ctx.fillStyle = 'rgba(232,224,200,0.5)';
    const words = card.desc.split(' ');
    let line = '', lineY = 290;
    words.forEach(w => {
      const test = line ? line+' '+w : w;
      if (ctx.measureText(test).width > 210 && line) {
        ctx.fillText(line,128,lineY); line=w; lineY+=18;
      } else { line=test; }
    });
    if (line) ctx.fillText(line,128,lineY);
  }

  // ─── Public: buildFace ─────────────────────────────────────────────────────

  function buildFace(card, canvas, t = 0) {
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.width = 256; canvas.height = 384;
    }
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0,0,256,384);
    drawBackground(ctx, card.rarity, t);
    drawBorder(ctx, card.rarity, t);
    drawCorners(ctx, card.rarity, t);
    drawShape(ctx, card.rarity, t);
    drawLabels(ctx, card, card.rarity, t);
    return canvas;
  }

  function buildBack() {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 384;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#0a100a'; ctx.fillRect(0,0,256,384);
    ctx.strokeStyle = 'rgba(42,122,42,0.12)'; ctx.lineWidth = 1;
    for (let x = -384; x < 512; x += 20) {
      ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x+384,384); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x+384,0); ctx.lineTo(x,384); ctx.stroke();
    }
    ctx.strokeStyle = '#e85c1a'; ctx.lineWidth = 4;
    ctx.strokeRect(8,8,240,368);
    for (let y = 0; y < 384; y += 4) {
      ctx.fillStyle = 'rgba(0,0,0,0.14)'; ctx.fillRect(0,y+2,256,2);
    }
    ctx.font = '52px "VT323", monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(232,92,26,0.18)';
    ctx.fillText('◈', 128, 210);
    return c;
  }

  return { buildFace, buildBack, isAnimated, getCfg };
})();
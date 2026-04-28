// ─── AD LED MATRIX — fake mobile game ad (endless runner) ────────────────────
// Emulates those predatory "gameplay" ads that show fake game footage.
// Character runs, obstacles approach, dramatic fail, "PLAY NOW" prompt.
// Loops with increasing difficulty — always fails at the last second.

const LED = (() => {

  const COLS = 40;
  const ROWS = 22;

  const C = {
    // Monochrome-first palette with sparse red accents for "alert" moments.
    orange:{ r:224, g:224, b:224 },
    amber: { r:198, g:198, b:198 },
    white: { r:255, g:255, b:255 },
    red:   { r:255, g:36,  b:36  },
    cyan:  { r:168, g:168, b:168 },
    green: { r:236, g:236, b:236 },
    yellow:{ r:210, g:210, b:210 },
    dim:   { r:26,  g:26,  b:26  },
    dark:  { r:6,   g:6,   b:6   },
  };

  let canvas, ctx, offscreen, offCtx, redCanvas, redCtx, blueCanvas, blueCtx;
  let grid      = new Float32Array(COLS * ROWS);
  let colorGrid = new Uint8Array(COLS * ROWS * 3);
  let animFrame = null;
  let gen       = null;
  const rgbOffset = 2;
  let frameCount = 0;

  // ─── Grid ops ─────────────────────────────────────────────────────────────

  function clear(){ grid.fill(0); colorGrid.fill(0); }

  function setLED(x, y, b, col=C.orange){
    if(x<0||x>=COLS||y<0||y>=ROWS) return;
    const i=y*COLS+x;
    if(b>grid[i]){
      grid[i]=Math.min(1,b);
      colorGrid[i*3]=col.r; colorGrid[i*3+1]=col.g; colorGrid[i*3+2]=col.b;
    }
  }

  function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
  function lerp(a,b,t){return a+(b-a)*t;}

  function line(x0,y0,x1,y1,b,col){
    let dx=Math.abs(x1-x0),dy=Math.abs(y1-y0),sx=x0<x1?1:-1,sy=y0<y1?1:-1,err=dx-dy;
    while(true){setLED(x0,y0,b,col);if(x0===x1&&y0===y1)break;const e2=2*err;if(e2>-dy){err-=dy;x0+=sx;}if(e2<dx){err+=dx;y0+=sy;}}
  }

  function rect(x,y,w,h,b,col){
    for(let i=x;i<x+w;i++)for(let j=y;j<y+h;j++) setLED(i,j,b,col);
  }

  function hline(y,b,col){for(let x=0;x<COLS;x++)setLED(x,y,b,col);}

  // ─── Mini 4×5 font ────────────────────────────────────────────────────────

  const F={
    'A':[[0,1,1,0],[1,0,0,1],[1,1,1,1],[1,0,0,1],[1,0,0,1]],
    'B':[[1,1,1,0],[1,0,0,1],[1,1,1,0],[1,0,0,1],[1,1,1,0]],
    'C':[[0,1,1,1],[1,0,0,0],[1,0,0,0],[1,0,0,0],[0,1,1,1]],
    'D':[[1,1,1,0],[1,0,0,1],[1,0,0,1],[1,0,0,1],[1,1,1,0]],
    'E':[[1,1,1,1],[1,0,0,0],[1,1,1,0],[1,0,0,0],[1,1,1,1]],
    'G':[[0,1,1,1],[1,0,0,0],[1,0,1,1],[1,0,0,1],[0,1,1,1]],
    'H':[[1,0,0,1],[1,0,0,1],[1,1,1,1],[1,0,0,1],[1,0,0,1]],
    'I':[[1,1,1],[0,1,0],[0,1,0],[0,1,0],[1,1,1]],
    'J':[[0,0,0,1],[0,0,0,1],[0,0,0,1],[1,0,0,1],[0,1,1,0]],
    'K':[[1,0,0,1],[1,0,1,0],[1,1,0,0],[1,0,1,0],[1,0,0,1]],
    'L':[[1,0,0,0],[1,0,0,0],[1,0,0,0],[1,0,0,0],[1,1,1,1]],
    'M':[[1,0,0,1],[1,1,1,1],[1,0,0,1],[1,0,0,1],[1,0,0,1]],
    'N':[[1,0,0,1],[1,1,0,1],[1,0,1,1],[1,0,0,1],[1,0,0,1]],
    'O':[[0,1,1,0],[1,0,0,1],[1,0,0,1],[1,0,0,1],[0,1,1,0]],
    'P':[[1,1,1,0],[1,0,0,1],[1,1,1,0],[1,0,0,0],[1,0,0,0]],
    'R':[[1,1,1,0],[1,0,0,1],[1,1,1,0],[1,0,1,0],[1,0,0,1]],
    'S':[[0,1,1,1],[1,0,0,0],[0,1,1,0],[0,0,0,1],[1,1,1,0]],
    'T':[[1,1,1,1,1],[0,0,1,0,0],[0,0,1,0,0],[0,0,1,0,0],[0,0,1,0,0]],
    'U':[[1,0,0,1],[1,0,0,1],[1,0,0,1],[1,0,0,1],[0,1,1,0]],
    'V':[[1,0,0,1],[1,0,0,1],[1,0,0,1],[0,1,1,0],[0,0,1,0]],
    'W':[[1,0,0,0,1],[1,0,0,0,1],[1,0,1,0,1],[1,1,0,1,1],[1,0,0,0,1]],
    'Y':[[1,0,0,0,1],[0,1,0,1,0],[0,0,1,0,0],[0,0,1,0,0],[0,0,1,0,0]],
    '!':[[1],[1],[1],[0],[1]],
    '?':[[0,1,1,0],[1,0,0,1],[0,0,1,0],[0,0,0,0],[0,0,1,0]],
    ' ':[[0,0,0],[0,0,0],[0,0,0],[0,0,0],[0,0,0]],
    '>':[[1,0,0],[0,1,0],[0,0,1],[0,1,0],[1,0,0]],
  };

  function drawText(str, ox, oy, b=1, col=C.white){
    let x=ox;
    for(const ch of str.toUpperCase()){
      const g=F[ch]||F[' '];
      const w=g[0].length;
      for(let r=0;r<g.length;r++) for(let c=0;c<w;c++) if(g[r][c]) setLED(x+c,oy+r,b,col);
      x+=w+1;
    }
    return x-ox;
  }

  function textWidth(str){
    let w=0;
    for(const ch of str.toUpperCase()){const g=F[ch]||F[' '];w+=g[0].length+1;}
    return w;
  }

  function centreText(str,y,b=1,col=C.white){
    const w=textWidth(str);
    drawText(str,Math.floor((COLS-w)/2),y,b,col);
  }

  // ─── Pixel art sprites ────────────────────────────────────────────────────

  // Player character — 5×8 pixels, run frames A/B, jump frame, dead frame
  const _ = null;
  const O = C.orange, W = C.white, A = C.amber, R = C.red, G = C.green;

  const PLAYER_RUN_A = [
    [_,O,O,O,_],
    [O,W,O,W,O],
    [O,O,O,O,O],
    [_,O,A,O,_],
    [_,O,O,O,_],
    [O,_,O,_,O],
    [O,_,_,_,_],
    [_,_,_,_,_],
  ];

  const PLAYER_RUN_B = [
    [_,O,O,O,_],
    [O,W,O,W,O],
    [O,O,O,O,O],
    [_,O,A,O,_],
    [_,O,O,O,_],
    [_,O,_,O,_],
    [_,_,_,O,O],
    [_,_,_,_,_],
  ];

  const PLAYER_JUMP = [
    [_,O,O,O,_],
    [O,W,O,W,O],
    [O,O,O,O,O],
    [_,O,A,O,_],
    [O,O,O,O,O],
    [O,_,_,_,O],
    [_,_,_,_,_],
    [_,_,_,_,_],
  ];

  const PLAYER_DEAD = [
    [_,_,_,_,_],
    [O,O,O,O,O],
    [O,W,_,W,O],
    [O,O,O,O,O],
    [_,O,A,O,_],
    [_,O,_,O,_],
    [O,O,_,O,O],
    [_,_,_,_,_],
  ];

  // Obstacles
  const SPIKE = [
    [_,_,A,_,_],
    [_,A,A,A,_],
    [A,A,A,A,A],
  ];

  const CRATE = [
    [A,A,A,A,A],
    [A,_,A,_,A],
    [A,A,A,A,A],
    [A,_,_,_,A],
    [A,A,A,A,A],
  ];

  const BIRD = (flap) => flap ? [
    [_,W,_,_,W,_],
    [W,W,W,W,W,W],
    [_,_,W,W,_,_],
  ] : [
    [W,W,_,_,W,W],
    [_,W,W,W,W,_],
    [_,_,W,W,_,_],
  ];

  const COIN = [
    [_,A,A,_],
    [A,_,_,A],
    [A,_,A,A],
    [A,_,_,A],
    [_,A,A,_],
  ];

  function drawSprite(sprite, ox, oy, b=1){
    for(let r=0;r<sprite.length;r++)
      for(let c=0;c<sprite[r].length;c++)
        if(sprite[r][c]) setLED(ox+c, oy+r, b, sprite[r][c]);
  }

  // ─── Scene elements ───────────────────────────────────────────────────────

  const GROUND_Y = ROWS - 4;

  function drawBackground(scrollX){
    // Sky gradient — dim top
    for(let x=0;x<COLS;x++){
      setLED(x,0,0.08,C.dim); setLED(x,1,0.06,C.dim);
    }
    // Scrolling bg city silhouette
    const buildings=[
      {x:0,w:5,h:6},{x:6,w:3,h:4},{x:10,w:6,h:8},{x:17,w:4,h:5},
      {x:22,w:7,h:9},{x:30,w:4,h:6},{x:35,w:6,h:7},{x:42,w:3,h:5},
      {x:46,w:5,h:8},{x:52,w:4,h:4},{x:57,w:6,h:7},{x:64,w:5,h:6},
    ];
    for(const b of buildings){
      const bx=((b.x-Math.floor(scrollX*0.3))%70+70)%70-5;
      for(let x=bx;x<bx+b.w;x++)
        for(let y=GROUND_Y-b.h;y<GROUND_Y;y++)
          setLED(x,y,0.12,C.dim);
      // Windows
      if(b.h>4){
        setLED(bx+1,GROUND_Y-b.h+1,0.35,C.amber);
        setLED(bx+3,GROUND_Y-b.h+2,0.25,C.amber);
      }
    }
    // Ground
    hline(GROUND_Y,   0.7, C.amber);
    hline(GROUND_Y+1, 0.4, C.orange);
    hline(GROUND_Y+2, 0.2, C.dim);
    // Ground tiles scrolling
    for(let x=0;x<COLS;x++){
      const tile=Math.floor((x+Math.floor(scrollX))%8);
      if(tile===0||tile===4) setLED(x,GROUND_Y,0.9,C.amber);
    }
    // Floor
    rect(0,ROWS-1,COLS,1,0.15,C.dark);
  }

  function drawCoins(coins, scrollX){
    for(const c of coins){
      const cx=Math.round(c.x-scrollX);
      if(cx>-4&&cx<COLS) drawSprite(COIN,cx,c.y,0.9);
    }
  }

  function drawObstacles(obs, scrollX){
    for(const o of obs){
      const ox=Math.round(o.x-scrollX);
      if(ox>-6&&ox<COLS){
        if(o.type==='spike') drawSprite(SPIKE,ox,GROUND_Y-3,1);
        if(o.type==='crate') drawSprite(CRATE,ox,GROUND_Y-5,1);
        if(o.type==='bird')  drawSprite(BIRD(o.flap),ox,GROUND_Y-10,1);
      }
    }
  }

  // ─── HUD ──────────────────────────────────────────────────────────────────

  function drawHUD(score, coins, lives){
    // Score top-left
    drawText(String(score).padStart(5,'0'), 0, 0, 0.7, C.white);
    // Coins top-right
    const coinStr='*'+String(coins).padStart(2,'0');
    drawText(coinStr, COLS-textWidth(coinStr)-1, 0, 0.8, C.amber);
    // Lives — hearts
    for(let i=0;i<lives;i++){
      setLED(COLS-3-i*4,6,0.9,C.red); setLED(COLS-2-i*4,6,0.9,C.red);
      setLED(COLS-3-i*4,7,0.9,C.red); setLED(COLS-2-i*4,7,0.9,C.red);
      setLED(COLS-4-i*4,7,0.7,C.red); setLED(COLS-1-i*4,7,0.7,C.red);
      setLED(COLS-3-i*4,8,0.5,C.red); setLED(COLS-2-i*4,8,0.5,C.red);
      setLED(COLS-2-i*4,9,0.4,C.red);
    }
  }

  // ─── Broadcast interruption layer (self-aware ad language) ────────────────
  function applyInterruptionOverlay(f) {
    // Rolling horizontal bars like a hijacked CRT signal.
    const roll = 3 + Math.floor((f * 0.7) % (ROWS - 7));
    hline(roll, 0.22, C.white);
    hline(roll + 1, 0.14, C.dim);

    // Soft interruptions that acknowledge the ad itself.
    const beats = [
      { at: 0,  lines: ['THIS AD', 'IS LIVE'] },
      { at: 28, lines: ['AD MODE', 'ACTIVE'] },
      { at: 56, lines: ['THANKS', 'FOR VIEW'] },
    ];
    const beat = beats.find(b => ((f - b.at) % 84 + 84) % 84 < 6);
    if (beat) {
      for (let y = 2; y < ROWS - 2; y++) for (let x = 1; x < COLS - 1; x++) setLED(x, y, 0.24, C.dark);
      rect(1, 2, COLS - 2, 1, 0.55, C.white);
      rect(1, ROWS - 3, COLS - 2, 1, 0.55, C.white);
      centreText(beat.lines[0], 7, 1, C.white);
      centreText(beat.lines[1], 13, 0.9, C.amber);
    }
  }

  // ─── Particle system ──────────────────────────────────────────────────────

  function spawnDust(particles, x, y){
    for(let i=0;i<4;i++) particles.push({
      x, y: y+Math.random()*2, vx:(Math.random()-0.5)*0.5,
      vy:-0.3-Math.random()*0.4, life:1, col:C.amber,
    });
  }

  function spawnExplosion(particles, x, y){
    for(let i=0;i<12;i++){
      const a=(i/12)*Math.PI*2;
      particles.push({
        x, y, vx:Math.cos(a)*(0.5+Math.random()*0.8),
        vy:Math.sin(a)*(0.5+Math.random()*0.8)-0.5,
        life:1, col:[C.orange,C.red,C.amber,C.white][Math.floor(Math.random()*4)],
      });
    }
  }

  function updateParticles(particles){
    for(let i=particles.length-1;i>=0;i--){
      const p=particles[i];
      p.x+=p.vx; p.y+=p.vy; p.vy+=0.05; p.life-=0.06;
      if(p.life<=0){particles.splice(i,1);continue;}
      setLED(Math.round(p.x),Math.round(p.y),p.life*0.8,p.col);
    }
  }

  // ─── Main game ad sequence (satirical endless-runner parody) ─────────────

  function laneX(lane, depth){
    const base = COLS * 0.5;
    const spread = lerp(3.4, 12.5, depth);
    return Math.round(base + (lane - 1) * spread);
  }

  function drawCoin3d(x, y, s = 1){
    const r = Math.max(1, Math.round(1.3 * s));
    setLED(x, y, 0.95, C.yellow);
    setLED(x - r, y, 0.65, C.amber); setLED(x + r, y, 0.65, C.amber);
    setLED(x, y - r, 0.65, C.amber); setLED(x, y + r, 0.65, C.amber);
    setLED(x, y, 1, C.white);
  }

  function drawTrain(x, y, s = 1){
    const w = Math.max(5, Math.round(8 * s));
    const h = Math.max(4, Math.round(6 * s));
    rect(x - Math.floor(w/2), y - h, w, h, 0.7, C.red);
    rect(x - Math.floor(w/2) + 1, y - h + 1, w - 2, h - 2, 0.45, C.dim);
    rect(x - Math.floor(w/2) + 1, y - h + 1, w - 2, 1, 0.8, C.white);
  }

  function drawRunner(x, y, frame){
    const spr = frame % 2 === 0 ? PLAYER_RUN_A : PLAYER_RUN_B;
    drawSprite(spr, x - 2, y - 7, 1);
  }

  function drawChaser(x, y){
    const body = [
      [C.white,C.white,C.white,C.white,C.white,C.white],
      [C.white,C.dim,C.white,C.white,C.dim,C.white],
      [C.white,C.white,C.white,C.white,C.white,C.white],
      [C.amber,C.amber,C.amber,C.amber,C.amber,C.amber],
      [C.amber,C.amber,C.amber,C.amber,C.amber,C.amber],
    ];
    drawSprite(body, x - 3, y - 5, 0.9);
  }

  function drawLaneWorld(tick, playerLane, coins, obstacles){
    // Sky / horizon.
    for(let y = 0; y < ROWS; y++){
      const b = y < 5 ? 0.08 : y < 10 ? 0.05 : 0.03;
      for(let x = 0; x < COLS; x++) setLED(x, y, b, C.dark);
    }

    const horizonY = 4;
    hline(horizonY, 0.45, C.white);

    // Three tracks with perspective.
    for(let lane = 0; lane < 3; lane++){
      for(let d = 0; d <= 1; d += 0.05){
        const y = Math.round(lerp(horizonY + 1, ROWS - 2, d));
        const x = laneX(lane, d);
        setLED(x, y, 0.52, C.white);
        if ((Math.floor((tick * 0.8) + d * 20) % 6) < 2) {
          setLED(x + 1, y, 0.3, C.dim);
        }
      }
    }

    // Side walls / billboards to push "familiar ad runner" silhouette.
    for(let d = 0; d <= 1; d += 0.07){
      const y = Math.round(lerp(horizonY + 2, ROWS - 1, d));
      const xl = Math.round(lerp(10, 1, d));
      const xr = Math.round(lerp(COLS - 10, COLS - 2, d));
      setLED(xl, y, 0.22, C.dim);
      setLED(xr, y, 0.22, C.dim);
    }

    // Obstacles (trains).
    obstacles.forEach(o => {
      const d = o.z;
      if (d < 0.05 || d > 1) return;
      const x = laneX(o.lane, d);
      const y = Math.round(lerp(horizonY + 1, ROWS - 2, d));
      drawTrain(x, y, lerp(0.35, 1.2, d));
    });

    // Coins.
    coins.forEach(c => {
      const d = c.z;
      if (d < 0.05 || d > 1) return;
      const x = laneX(c.lane, d);
      const y = Math.round(lerp(horizonY + 1, ROWS - 3, d));
      drawCoin3d(x, y, lerp(0.3, 1, d));
    });

    // Player + chaser near bottom.
    const px = laneX(playerLane, 1);
    const py = ROWS - 3;
    drawRunner(px, py, tick);
    drawChaser(px, py + 2);
  }

  function* seqRunner(){
    let t = 0;
    let score = 0;
    let coinCount = 0;
    let playerLane = 1;
    let scriptedLane = 1;
    let state = 'run'; // run | crash
    let crashTimer = 0;

    // World objects moving toward the player (z: 0 horizon -> 1 foreground).
    let coins = [];
    let obstacles = [];

    const laneScript = [
      { at: 40, lane: 0 },
      { at: 85, lane: 2 },
      { at: 125, lane: 1 },
      { at: 165, lane: 2 }, // bait into failure
    ];
    let scriptIdx = 0;

    // Spawn scripted objects.
    for(let i = 0; i < 26; i++) {
      const lane = i % 3;
      coins.push({ lane, z: 0.1 + i * 0.06 });
    }
    obstacles.push({ lane: 0, z: 0.42 });
    obstacles.push({ lane: 2, z: 0.58 });
    obstacles.push({ lane: 1, z: 0.88 }); // unavoidable "last-second" hit

    // ── PHASE 1: Familiar endless-runner loop ─────────────────────────────
    while(state === 'run'){
      t++;
      score += 3;

      if(scriptIdx < laneScript.length && t >= laneScript[scriptIdx].at){
        scriptedLane = laneScript[scriptIdx].lane;
        scriptIdx++;
      }
      // AI lane easing (looks like autoplay).
      if (playerLane < scriptedLane) playerLane++;
      if (playerLane > scriptedLane) playerLane--;

      // Move objects toward camera.
      coins.forEach(c => c.z += 0.028);
      obstacles.forEach(o => o.z += 0.028);

      // Collect coins near foreground if same lane.
      for (let i = coins.length - 1; i >= 0; i--) {
        const c = coins[i];
        if (c.z > 0.88 && c.z < 1.08 && c.lane === playerLane) {
          coinCount++;
          coins.splice(i, 1);
        } else if (c.z >= 1.1) {
          coins.splice(i, 1);
        }
      }

      // Collision (scripted trap in centre lane).
      for (const o of obstacles) {
        if (o.z > 0.9 && o.z < 1.04 && o.lane === playerLane) {
          state = 'crash';
          crashTimer = 0;
          break;
        }
      }

      clear();
      drawLaneWorld(t, playerLane, coins, obstacles);
      drawHUD(score, coinCount, 1);

      // Self-aware overlay copy.
      if (t % 48 < 20) centreText('FAKE RUN', 1, 0.8, C.white);
      if (t % 64 < 24) centreText('AD LOOP', 18, 0.7, C.amber);

      yield;
      if (t > 220) state = 'crash';
    }

    // ── PHASE 2: Crash + continue prompt ──────────────────────────────────
    for (let f = 0; f < 58; f++) {
      clear();
      drawLaneWorld(t + f, playerLane, [], []);
      if (f < 8) {
        hline(ROWS/2, 0.9, C.red);
        hline(ROWS/2 - 1, 0.5, C.red);
        hline(ROWS/2 + 1, 0.5, C.red);
      }
      if (f % 10 < 8) {
        centreText('CRASH', 6, 1, C.red);
        centreText('CONTINUE?', 12, 1, C.white);
      }
      drawText('SCORE', 3, 18, 0.6, C.dim);
      drawText(String(score).padStart(5,'0'), COLS - textWidth(String(score).padStart(5,'0')) - 3, 18, 0.8, C.amber);
      yield;
    }

    // ── PHASE 3: Self-aware CTA panel ─────────────────────────────────────
    for (let f = 0; f < 112; f++) {
      clear();
      for(let y=0;y<ROWS;y++) for(let x=0;x<COLS;x++) setLED(x,y,0.04+(y/ROWS)*0.08,C.dark);
      rect(2, 3, COLS - 4, ROWS - 6, 0.26, C.dim);
      rect(2, 3, COLS - 4, 1, 0.55, C.white);
      rect(2, ROWS - 4, COLS - 4, 1, 0.55, C.white);

      const prompts = [
        ['AD BONUS', 'ACTIVE'],
        ['WATCH', 'TO PLAY'],
        ['GAMEPLAY', 'VARIES'],
        ['AD LOOP', 'OPTIMISE'],
      ];
      const p = prompts[Math.floor(f / 28) % prompts.length];
      if (f % 14 < 11) {
        centreText(p[0], 7, 1, C.white);
        centreText(p[1], 13, 1, C.amber);
      }
      if (f % 20 < 7) centreText('NO SKIP', 19, 0.75, C.red);
      yield;
    }

    // ── PHASE 4: Quiet self-aware close ───────────────────────────────────
    for (let f = 0; f < 52; f++) {
      clear();
      for(let y=0;y<ROWS;y++) for(let x=0;x<COLS;x++) setLED(x,y,0.03,C.dark);
      if (f < 16) {
        centreText('THIS AD', 6, 0.7, C.white);
        centreText('FAMILIAR', 12, 0.8, C.amber);
      } else if (f < 34) {
        centreText('THIS AD', 5, 0.75, C.amber);
        centreText('SELF AWARE', 12, 0.9, C.red);
      } else {
        centreText('THANK YOU', 7, 0.8, C.white);
        centreText('WATCHING', 14, 0.85, C.amber);
      }
      yield;
    }
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  function render(){
    if(!canvas||!ctx) return;
    const W=canvas.width,H=canvas.height,dotW=W/COLS,dotH=H/ROWS,r=Math.min(dotW,dotH)*0.38;

    ctx.fillStyle='#010201';
    ctx.fillRect(0,0,W,H);

    // Off-state dots
    ctx.fillStyle='rgba(12,4,2,0.95)';
    for(let y=0;y<ROWS;y++) for(let x=0;x<COLS;x++){
      if(grid[y*COLS+x]<0.015){ctx.beginPath();ctx.arc((x+0.5)*dotW,(y+0.5)*dotH,r*0.38,0,Math.PI*2);ctx.fill();}
    }

    // Bloom
    offCtx.clearRect(0,0,W,H);
    for(let y=0;y<ROWS;y++) for(let x=0;x<COLS;x++){
      const i=y*COLS+x,val=grid[i];
      if(val<0.06) continue;
      const cr=colorGrid[i*3],cg=colorGrid[i*3+1],cb=colorGrid[i*3+2];
      const px=(x+0.5)*dotW,py=(y+0.5)*dotH;
      offCtx.fillStyle=`rgba(${cr},${cg},${cb},${val*0.18})`;
      offCtx.beginPath();offCtx.arc(px,py,r*4.5*val,0,Math.PI*2);offCtx.fill();
    }
    ctx.filter='blur(3px)';ctx.drawImage(offscreen,0,0);ctx.filter='none';

    // LED dots to offscreen
    offCtx.clearRect(0,0,W,H);
    for(let y=0;y<ROWS;y++) for(let x=0;x<COLS;x++){
      const i=y*COLS+x,val=grid[i];
      if(val<0.015) continue;
      const cr=colorGrid[i*3],cg=colorGrid[i*3+1],cb=colorGrid[i*3+2];
      const px=(x+0.5)*dotW,py=(y+0.5)*dotH;
      offCtx.fillStyle=`rgba(${Math.min(255,cr+40)},${Math.min(255,cg+30)},${Math.min(255,cb+15)},${val})`;
      offCtx.beginPath();offCtx.arc(px,py,r,0,Math.PI*2);offCtx.fill();
      if(val>0.5){offCtx.fillStyle=`rgba(255,255,255,${(val-0.5)*0.65})`;offCtx.beginPath();offCtx.arc(px-r*0.2,py-r*0.22,r*0.3,0,Math.PI*2);offCtx.fill();}
    }

    // RGB split
    redCtx.clearRect(0,0,W,H);redCtx.drawImage(offscreen,-rgbOffset,0);
    blueCtx.clearRect(0,0,W,H);blueCtx.drawImage(offscreen,rgbOffset,0);
    const rD=redCtx.getImageData(0,0,W,H),bD=blueCtx.getImageData(0,0,W,H),oD=offCtx.getImageData(0,0,W,H);
    const out=ctx.createImageData(W,H);
    for(let i=0;i<out.data.length;i+=4){
      out.data[i]=rD.data[i];out.data[i+1]=oD.data[i+1];out.data[i+2]=bD.data[i+2];
      out.data[i+3]=Math.max(rD.data[i+3],oD.data[i+3],bD.data[i+3]);
    }
    ctx.putImageData(out,0,0);

    // CRT skew + unstable signal drift for hostile broadcast feel.
    canvas.style.transform=`rotateX(2deg) scaleX(0.97) skewX(${Math.sin(Date.now()*0.0009)*1.6}deg) translateX(${Math.sin(Date.now()*0.0017)*1.8}px)`;
  }

  // ─── Loop ─────────────────────────────────────────────────────────────────

  function tick(){
    if(!gen||gen.next().done) gen=(function*(){while(true)yield* seqRunner();}());
    frameCount++;
    applyInterruptionOverlay(frameCount);
    render();
    animFrame=requestAnimationFrame(tick);
  }

  function init(canvasEl){
    canvas=canvasEl;ctx=canvas.getContext('2d');
    canvas.width=COLS*5;canvas.height=ROWS*5;
    const W2=canvas.width,H2=canvas.height;
    offscreen=document.createElement('canvas');offscreen.width=W2;offscreen.height=H2;offCtx=offscreen.getContext('2d');
    redCanvas=document.createElement('canvas');redCanvas.width=W2;redCanvas.height=H2;redCtx=redCanvas.getContext('2d');
    blueCanvas=document.createElement('canvas');blueCanvas.width=W2;blueCanvas.height=H2;blueCtx=blueCanvas.getContext('2d');
    grid=new Float32Array(COLS*ROWS);colorGrid=new Uint8Array(COLS*ROWS*3);
    gen=null;tick();
  }

  function destroy(){cancelAnimationFrame(animFrame);animFrame=null;gen=null;}

  return{init,destroy};
})();
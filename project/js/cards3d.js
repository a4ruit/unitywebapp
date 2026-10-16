// cards3d.js — Three.js 3D card reveal with animated texture support
// Depends on: cardTextures.js
// Exposes: Cards3D.showCard(card, containerId, onComplete), Cards3D.destroy()

const Cards3D = (() => {

  let renderer, scene, camera, cardMesh;
  let animFrame;
  let isFlipping     = false;
  let flipProgress   = 0;
  let flipDone       = false;
  let onFlipComplete = null;
  let rarityLight    = null;
  let idleT          = 0;
  let startTime      = 0;
  let currentCard    = null;
  let faceCanvas     = null;
  let faceTex        = null;
  let animated       = false;

  /// Build the WebGL context ONCE and keep it for the life of the page.
  ///
  /// It used to be rebuilt for every card revealed, and that leaked a context
  /// each time: renderer.dispose() frees three.js's own GPU objects but NOT the
  /// underlying WebGL context — only forceContextLoss() does that. Browsers cap
  /// how many contexts can be live at once and, past the cap, kill the OLDEST
  /// ones. The oldest here are the long-lived renderers in Pack3d and
  /// choiceGrid3d, so a player who opened enough packs would silently have the
  /// pack and the choice grid killed underneath them — which is the card
  /// flickering seen at the playtest. Older phones hit it soonest because the
  /// cap tightens under memory pressure.
  ///
  /// choiceGrid3d already keeps one renderer alive on purpose. This now matches
  /// it: contexts are expensive and there is no reason to own more than one.
  function _ensureRenderer() {
    if (renderer) return true;
    try {
      renderer = new THREE.WebGLRenderer({ antialias:false, alpha:true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setClearColor(0x000000, 0);
      renderer.domElement.style.cssText =
        'display:block;width:100%!important;height:100%!important;image-rendering:pixelated;';

      // If it is ever lost anyway — a backgrounded tab, a phone reclaiming
      // memory — say so and rebuild on the next card. Without these the context
      // dies silently and the canvas just stops updating, which is exactly why
      // this went unnoticed until someone happened to be watching.
      renderer.domElement.addEventListener('webglcontextlost', (e) => {
        e.preventDefault();
        console.warn('Cards3D: WebGL context lost');
        cancelAnimationFrame(animFrame); animFrame = null;
        scene = null;
      });
      renderer.domElement.addEventListener('webglcontextrestored', () => {
        console.warn('Cards3D: WebGL context restored');
      });
      return true;
    } catch (e) {
      console.warn('Cards3D: WebGL init failed', e);
      renderer = null;
      return false;
    }
  }

  function init(containerId) {
    const wrap = document.getElementById(containerId);
    if (!wrap) return;
    destroy();
    if (!_ensureRenderer()) return;

    const W = wrap.clientWidth  || 216;
    const H = wrap.clientHeight || 296;

    renderer.setSize(W, H);
    wrap.innerHTML = '';
    // The SAME canvas, moved to whichever container is showing a card. Appending
    // an existing element relocates it rather than copying, so nothing leaks.
    wrap.appendChild(renderer.domElement);

    scene  = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(38, W/H, 0.1, 100);
    camera.position.set(0, 0, 4.2);

    scene.add(new THREE.AmbientLight(0x1a2a1a, 0.9));
    const front = new THREE.DirectionalLight(0xffffff, 0.4);
    front.position.set(0,0,5); scene.add(front);
    const top = new THREE.DirectionalLight(0x3aaa3a, 0.3);
    top.position.set(0,4,2); scene.add(top);

    animate();
  }

  function showCard(card, containerId, callback) {
    const wrap = document.getElementById(containerId);
    if (!wrap) return;
    // Re-init when there is no scene, or when the canvas is parked in some
    // other container. Testing the RENDERER would now always pass, since it
    // outlives destroy() on purpose.
    if (!scene || !renderer || renderer.domElement.parentNode !== wrap)
      init(containerId);
    if (!scene) return;

    if (cardMesh) {
      scene.remove(cardMesh);
      cardMesh.geometry?.dispose();
      cardMesh.material?.forEach?.(m => m.dispose());
      cardMesh = null;
    }
    if (rarityLight) { scene.remove(rarityLight); rarityLight = null; }

    currentCard = card;
    animated    = CardTextures.isAnimatedCard(card);
    startTime   = performance.now() / 1000;

    const cfg = CardTextures.getCfg(card.rarity);

    if (cfg.light) {
      rarityLight = new THREE.PointLight(cfg.light.color, cfg.light.intensity, cfg.light.dist);
      rarityLight.position.set(0,0,2);
      scene.add(rarityLight);
    }

    faceCanvas = document.createElement('canvas');
    faceCanvas.width = 256; faceCanvas.height = 384;
    CardTextures.buildFace(card, faceCanvas, 0);
    faceTex = new THREE.CanvasTexture(faceCanvas);

    const backCanvas = CardTextures.buildBack();
    const backTex    = new THREE.CanvasTexture(backCanvas);

    const geo      = new THREE.BoxGeometry(1.6, 2.4, 0.04);
    const edgeMat  = new THREE.MeshStandardMaterial({ color:0x0f160f, roughness:0.9 });
    const frontMat = new THREE.MeshStandardMaterial({
      // Self-illuminated face: show the card texture at its TRUE colours,
      // unaffected by the scene's (green, dim) lighting — matches the flat
      // collection render. color:black removes the lit/green diffuse tint.
      color: 0x000000,
      emissive: 0xffffff,
      emissiveMap: faceTex,
      emissiveIntensity: 1.0,
      roughness: 0.7,
      metalness: card.rarity === 'legendary-alpha' ? 0.5 : card.rarity === 'legendary' ? 0.3 : 0.05,
    });
    const backMat = new THREE.MeshStandardMaterial({ map:backTex, roughness:0.8, metalness:0.05 });

    cardMesh = new THREE.Mesh(geo, [edgeMat,edgeMat,edgeMat,edgeMat,frontMat,backMat]);
    cardMesh.rotation.y = Math.PI;
    scene.add(cardMesh);

    isFlipping     = true;
    flipProgress   = 0;
    flipDone       = false;
    onFlipComplete = callback || null;
    idleT          = 0;
  }

  function animate() {
    animFrame = requestAnimationFrame(animate);
    if (!renderer || !scene || !camera) return;

    idleT += 0.014;
    const t = performance.now() / 1000 - startTime;

    if (isFlipping && cardMesh) {
      flipProgress += 0.032;
      const ease = 1 - Math.pow(1 - Math.min(flipProgress,1), 3);
      cardMesh.rotation.y = Math.PI * (1 - ease);
      cardMesh.position.y = Math.sin(Math.min(flipProgress,1) * Math.PI) * 0.15;

      if (animated && faceCanvas && faceTex && currentCard && flipProgress > 0.5) {
        CardTextures.buildFace(currentCard, faceCanvas, t);
        faceTex.needsUpdate = true;
      }

      if (flipProgress >= 1 && !flipDone) {
        flipDone = true; isFlipping = false;
        if (onFlipComplete) { onFlipComplete(); onFlipComplete = null; }
      }

    } else if (cardMesh && !isFlipping) {
      if (animated && faceCanvas && faceTex && currentCard) {
        CardTextures.buildFace(currentCard, faceCanvas, t);
        faceTex.needsUpdate = true;
      }
      cardMesh.rotation.y = lerp(cardMesh.rotation.y, Math.sin(idleT*0.6)*0.04, 0.05);
      cardMesh.rotation.x = lerp(cardMesh.rotation.x, Math.cos(idleT*0.4)*0.02, 0.05);
      cardMesh.position.y = lerp(cardMesh.position.y, Math.sin(idleT*0.8)*0.03, 0.08);
    }

    if (rarityLight && !isFlipping) {
      const rarity = currentCard?.rarity;
      if (rarity === 'legendary-alpha') {
        rarityLight.intensity = 4.0 + Math.sin(t*3)*1.5;
        rarityLight.color.setHSL((t*0.1)%1, 1, 0.7);
      } else if (rarity === 'luck-maxxing') {
        rarityLight.intensity = 3.2 + Math.sin(t*2.5)*1.0;
      } else if (rarity === 'mythical') {
        rarityLight.intensity = 3.0 + Math.sin(t*3.5)*1.2;
      } else if (rarity === 'legendary') {
        rarityLight.intensity = 2.5 + Math.sin(idleT*2)*0.8;
      } else if (rarity === 'rare') {
        rarityLight.intensity = 1.8 + Math.sin(idleT*1.4)*0.4;
      }
    }

    renderer.render(scene, camera);
  }

  function lerp(a,b,t) { return a+(b-a)*t; }

  function destroy() {
    cancelAnimationFrame(animFrame); animFrame = null;
    if (cardMesh) {
      scene?.remove(cardMesh);
      cardMesh.geometry?.dispose();
      cardMesh.material?.forEach?.(m => m.dispose());
      cardMesh = null;
    }
    if (rarityLight) { scene?.remove(rarityLight); rarityLight = null; }
    faceTex?.dispose(); faceTex = null; faceCanvas = null;

    // The RENDERER SURVIVES. Everything it was drawing is thrown away, the
    // canvas comes out of the DOM, but the context stays — see _ensureRenderer.
    if (renderer && renderer.domElement.parentNode)
      renderer.domElement.parentNode.removeChild(renderer.domElement);

    scene = null; camera = null; currentCard = null; animated = false;
  }

  /// Give the context back for good. Nothing calls this during play — it exists
  /// because a dispose() without forceContextLoss() is the leak this whole file
  /// was just fixed for, and leaving no correct way to release would invite the
  /// same bug back.
  function release() {
    destroy();
    if (renderer) { renderer.forceContextLoss(); renderer.dispose(); renderer = null; }
  }

  return { showCard, destroy, release };
})();
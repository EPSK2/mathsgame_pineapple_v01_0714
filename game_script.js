// ======================= 2.5D Jungle Canvas =======================

const canvas = document.getElementById("gameCanvas");
const ctx = canvas ? canvas.getContext("2d") : null;

// Wooden sign video overlay on the game canvas
const signVideo = document.createElement("video");
signVideo.src = "./wooden_sign.webm";
signVideo.loop = true;
signVideo.muted = true; // Must be muted for browsers to auto-play
signVideo.playsInline = true;

let signVideoReady = false;

// Follow the pp8.txt pattern: start drawing once the video can play
signVideo.addEventListener("canplay", () => {
  signVideoReady = true;
  const playPromise = signVideo.play();
  if (playPromise && typeof playPromise.then === "function") {
    playPromise.catch(() => {
      // Ignore autoplay rejections; video will start on user interaction
    });
  }
});

function drawSignVideo() {
  if (!ctx || !canvas || !signVideoReady) return;

  const videoWidth = signVideo.videoWidth;
  const videoHeight = signVideo.videoHeight;

  if (!videoWidth || !videoHeight) return;

  const scale = 0.2; // scale(0.2)
  const drawWidth = videoWidth * scale;
  const drawHeight = videoHeight * scale;

  // Place the bottom-left corner at x = 0, y = 20% of viewport (canvas) height
  const targetX = canvas.width * 0.025;
  const targetY = canvas.height * 0.3;
  // const angle = (20 * Math.PI) / 180; // 20 degrees clockwise
  // const angle = 0

  ctx.save();
  ctx.translate(targetX, targetY);
  if (gameState.mode === "descending") {
    ctx.rotate(Math.PI);
    ctx.drawImage(signVideo, -drawWidth, -drawHeight, drawWidth, drawHeight);
  } else {
    ctx.drawImage(signVideo, 0, -drawHeight, drawWidth, drawHeight);
  }
  // Draw so that the bottom-left corner of the scaled video sits at the origin

  ctx.restore();
}


function resizeCanvas() {
  if (!canvas) return;
  // Full-screen canvas to match CSS (100% width and height)
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}

resizeCanvas();
window.addEventListener("resize", () => {
  resizeCanvas();
  initTrees();
  initCrates();
  initParticles();
  if (typeof sunshineEffect !== "undefined" && sunshineEffect) {
    sunshineEffect.handleResize();
  }
  updateStumpsLayout();
  updateNumberTilePositions();
  updateBottomModeArrowLayout();
});


// Image assets
const images = {
  jungleBg: new Image(),
  tree: new Image(),
  leaf: new Image(),
  tallTree: new Image(),
  crate: new Image(),
  cloud: new Image(), // NEW
  pineapple: new Image(),
};

// Use provided assets
images.jungleBg.src = "./grass.png";
images.tree.src = "./tree.png";
images.leaf.src = "./leaf.png";
images.tallTree.src = "./tall_tree.png";
images.crate.src = "./cloud_yellow.png";
images.cloud.src = "./cloud.png"; // NEW
images.pineapple.src = "./pineapple_fruit.png";




const layers = {

  deepBackground: {
    image: images.jungleBg,
    blur: 0, // subtle depth-of-field on far background
  },
  distantTrees: [],
  mainPlayAreaTrees: [],
  foregroundTrees: [],
  particles: [],
  sideTrees: {
    left: null,
    right: null,
  },
  particlesAmbient: [],
  particlesTreeLeft: [],
  particlesTreeRight: [],
    particlesSky: [],
};

const crateConfig = {
  count: 5,
  scale: 0.2,
  minXRatio: 0.55,
  maxXRatio: 0.95,
  minYRatio: 0.2,
  maxYRatio: 0.75,
  minGap: 5,
};


let crates = [];

const particleConfigs = {

  numLeavesAmbient: 50, // existing "current" leaves
  numLeavesTreePerSide: 50, // same rate as ambient per side tree
  numLeavesSky: 25, // 50% of ambient rate
  minLeafSize: 20, // ALL leaves: 20px–40px square
  maxLeafSize: 40,
  windFrequency: 0.005,
};


// ======================= Animation Manager =======================

// All visual effect animations live here, rendered on top of the scene.
const animations = [];

// Persistent slot success clouds (one per correctly filled slot).
const successSlotClouds = [];

// Global toggle for smoke / success cloud animations.
// Set to false to completely hide smoke effects while keeping checkmarks.
let SMOKE_ENABLED = false;

// Canvas-space positions of the pineapple fruits (one per correct stump).
// Each entry is of the form { x, y } in gameCanvas coordinates.
let pineapplePositions = [];




// DOM-based pineapple sprites so they can sit visually above
// the tree stumps (which are also DOM). Each pineapple anim
// owns one overlay element.
function createPineappleOverlay(number) {
  const container = document.createElement("div");
  container.className = "pineapple-overlay";
  container.style.position = "absolute";
  container.style.pointerEvents = "none";
  container.style.zIndex = "200"; // higher than stump & cubes

  const img = document.createElement("img");
  img.src = images.pineapple ? images.pineapple.src : "./pineapple_fruit.png";
  img.alt = "Pineapple";
  img.style.display = "block";
  img.style.width = "20px"; // base size, will be scaled up via transform
  img.style.height = "auto";
  container.appendChild(img);

  const label = document.createElement("div");
  label.textContent = String(number);
  label.style.position = "absolute";
  label.style.left = "50%";
  label.style.top = "70%";
  label.style.transform = "translate(-50%, -50%)";
  label.style.color = "white";
  label.style.font = "bold 16px system-ui, sans-serif";
  label.style.textShadow = "0 0 4px rgba(0,0,0,0.8)";
  container.appendChild(label);

  document.body.appendChild(container);
  return container;
}


// Track timing so we can move things in pixels/second
let lastFrameTime = 0;

/**
 * Triggered when a number is correctly placed.
 * Spawns:
 *  - Smoke cloud (cloud.png)
 *  - Pineapple hop with the number inside
 *  - Persistent green checkmark
 *
 * @param {number} x - Canvas X coordinate (relative to gameCanvas)
 * @param {number} y - Canvas Y coordinate (relative to gameCanvas)
 * @param {number} number - The numeric value placed
 */
function playSuccessEffect(x, y, number, restOffset, checkX, checkY) {
  const now = performance.now();
  playAudioById('sfxPlaceCorrect');
  // Failsafe anchor for the pineapple: default to the provided
  // canvas coordinates, but if we do spawn smoke clouds we will
  // re-anchor to the actual smoke centre.
  let smokeCenterX = x;
  let smokeCenterY = y;

    // 1) Smoke cloud particles (clustered around the number tile)
  if (SMOKE_ENABLED && images.cloud && images.cloud.complete) {

    const cloudCount = 14; // enough overlap to visually cover the tile
    const baseRadius = 25; // spread radius around the stump top

    let sumOriginX = 0;
    let sumOriginY = 0;
    let createdClouds = 0;

    for (let i = 0; i < cloudCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = baseRadius * (0.4 + Math.random());
      const offsetX = Math.cos(angle) * radius;
      const offsetY = Math.sin(angle) * radius;

      const originX = x + offsetX;
      const originY = y + offsetY;

      const arcHeight = 60 + Math.random() * 40; // how far up the smoke rises
      const horizontalDrift = (Math.random() - 0.5) * 40; // slight sideways drift

      // Staggered spawn: each cloud starts sometime between t=0s and t=3s
      const spawnDelay = Math.random() * 3000;

      animations.push({
        type: "cloud",
        originX,
        originY,
        arcHeight,
        horizontalDrift,
        startTime: now + spawnDelay,
        duration: 3000, // each cloud lives for 3 seconds
      });

      sumOriginX += originX;
      sumOriginY += originY;
      createdClouds++;
    }

        // Failsafe: if we successfully created any clouds, treat the
    // pineapple's initial position as the actual smoke centre.
    if (createdClouds > 0) {
      smokeCenterX = sumOriginX / createdClouds;
      smokeCenterY = sumOriginY / createdClouds;
    }
  }

  // Record the resting position of this pineapple in canvas coordinates
  // so we can later compute the average Y-value and draw comparison
  // symbols between pineapples at end-game.
    const offsetForPosition =
    typeof restOffset === "number" ? restOffset : 40;
  const pineappleRestY = smokeCenterY - offsetForPosition;
  pineapplePositions.push({ x: smokeCenterX, y: pineappleRestY });

  // (Pineapple hop animation removed; success now only shows smoke and a checkmark.)

  // 3) Green checkmark, fading in at stump bottom-right

  const fallbackOffsetX = 30;
  const fallbackOffsetY = -30;
  const checkPosX =
    typeof checkX === "number" ? checkX : x + fallbackOffsetX;
  const checkPosY =
    typeof checkY === "number" ? checkY : y + fallbackOffsetY;

  animations.push({
    type: "checkmark",
    x: checkPosX,
    y: checkPosY,
    startTime: now,
    duration: 3000, // fade-in over 3 seconds
  });
}




/**
 * Update and draw all active animations.
 * Must be called from gameLoop AFTER all other rendering.
 *
 * @param {number} timeMs - current timestamp from requestAnimationFrame
 * @param {number} dtSeconds - delta time in seconds since last frame
 */
function updateAndDrawAnimations(timeMs, dtSeconds) {
  if (!ctx) return;

    // First, draw any persistent success clouds so that
  // smoke and checkmarks render above them.
    if (
    successSlotClouds.length &&
    images.crate &&
    images.crate.complete
  ) {

    const img = images.crate;
    const baseScale = (crateConfig && crateConfig.scale)
      ? crateConfig.scale * 1.7
      : 0.4; // approximate visual scale of numbered clouds
    const baseWidth = img.naturalWidth * baseScale;
    const baseHeight = img.naturalHeight * baseScale;

    successSlotClouds.forEach((cloud) => {
      const elapsed = timeMs - cloud.startTime;
      const duration = cloud.duration || 800;
      const t = Math.max(0, Math.min(elapsed / duration, 1));

      // Simple "bounce" scale: ease out with a small overshoot.
      let scaleFactor;
      if (t < 1) {
        const easeOut = 1 - Math.pow(1 - t, 3); // cubic ease-out
        const overshoot = 1.2;
        const settle = 0.9;
        // Blend between settle and overshoot with a sinusoidal wobble.
        scaleFactor =
          settle +
          (overshoot - settle) * Math.sin(easeOut * Math.PI);
      } else {
        scaleFactor = 0.9;
      }

      const drawWidth = baseWidth * scaleFactor;
      const drawHeight = baseHeight * scaleFactor;

            ctx.save();
      ctx.translate(cloud.x, cloud.y);

      // Draw rainbow arcs behind the numbered cloud.
      const rainbowColors = [
        "#FF0000",
        "#FF7F00",
        "#FFFF00",
        "#00FF00",
        "#0000FF",
        "#4B0082",
        "#9400D3",
      ];
      const baseInnerRadius = 50;
      const bandGap = 4;

      // Slight ease-out scale for the rainbow so it grows in with the cloud.
      let rainbowScale;
      if (t < 1) {
        const rainbowEase = 1 - Math.pow(1 - t, 3);
        rainbowScale = rainbowEase;
      } else {
        rainbowScale = 1;
      }

      const startAngle = 1.25 * Math.PI; // 180 degrees
      const endAngle = 2 * Math.PI;

      const rainbowYOffset = -40; // negative = above the cloud
      const rainbowXOffset = -40;
      rainbowColors.forEach((color, index) => {
        // Outer band = red, inner band = violet.
        const bandIndex = rainbowColors.length - 1 - index;
        const fullRadius = baseInnerRadius + bandIndex * bandGap;
        const radius = fullRadius * rainbowScale;

        // Soft outer pass for a glow.
        ctx.save();
        ctx.lineWidth = 16;
        ctx.strokeStyle = color;
        ctx.globalAlpha = 0.2;
        ctx.shadowColor = color;
        ctx.shadowBlur = 4;
        ctx.beginPath();
        ctx.arc(rainbowXOffset, rainbowYOffset, radius, startAngle, endAngle, false);
        ctx.stroke();
        ctx.restore();

        // Crisper inner pass.
        ctx.save();
        ctx.lineWidth = 8;
        ctx.strokeStyle = color;
        ctx.globalAlpha = 1;
        ctx.shadowColor = "transparent";
        ctx.shadowBlur = 0;
        ctx.beginPath();
        // Use the same vertical offset as the glow so we only draw
        // a single rainbow arch above the numbered cloud.
        ctx.arc(rainbowXOffset, rainbowYOffset, radius, startAngle, endAngle, false);
        ctx.stroke();
        ctx.restore();
      });

      // Draw numbered cloud on top of the rainbow.
      ctx.drawImage(
        img,
        -drawWidth / 2,
        -drawHeight / 2,
        drawWidth,
        drawHeight
      );

      // Draw the numeric label centred on the cloud so this
      // appears as the "numbered cloud" popping into place.
      if (cloud.value != null) {
        const valueText = String(cloud.value);
        const digitCount = valueText.length;
        const labelFontSize = digitCount >= 2 ? 44 : 60;
        ctx.font = `${labelFontSize}px 'Comic Sans MS', 'Noto Sans TC', sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = "#6f4e37";
        ctx.shadowColor = "rgba(0, 0, 0, 0.35)";
        ctx.shadowBlur = 4;
        ctx.fillText(valueText, 0, 20);
      }

      ctx.restore();

    });
  }


  for (let i = animations.length - 1; i >= 0; i--) {
    const anim = animations[i];


                if (anim.type === "cloud") {
      // --- Smoke clouds (parabolic upward motion, staggered spawn) ---
      if (!SMOKE_ENABLED) {
        animations.splice(i, 1);
        continue;
      }
      if (!images.cloud || !images.cloud.complete) {
        animations.splice(i, 1);
        continue;
      }


      const elapsed = timeMs - anim.startTime;
      if (elapsed < 0) {
        // Not yet spawned (startTime is in the future)
        continue;
      }
      if (elapsed >= anim.duration) {
        animations.splice(i, 1);
        continue;
      }

      const img = images.cloud;
      const scale = 0.8; // requested transform scale
      const drawWidth = img.naturalWidth * scale;
      const drawHeight = img.naturalHeight * scale;

      const t = Math.max(0, Math.min(elapsed / anim.duration, 1)); // 0 → 1

      // Parabolic rise: fast at first, easing out as it rises.
      const yOffset = -anim.arcHeight * (2 * t - t * t);

      // Gentle horizontal drift, also using a smooth curved profile.
      const xOffset = (anim.horizontalDrift || 0) * (t - 0.5 * t * t);

      const drawX = anim.originX + xOffset;
      const drawY = anim.originY + yOffset;

      // Fade in/out over lifetime (3s): 0–1–0 alpha
      let alpha;
      if (t < 0.5) {
        alpha = t / 0.5; // 0 → 1
      } else {
        alpha = 1 - (t - 0.5) / 0.5; // 1 → 0
      }

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.drawImage(
        img,
        drawX - drawWidth / 2,
        drawY - drawHeight / 2,
        drawWidth,
        drawHeight
      );
      ctx.restore();

                } else if (anim.type === "pineapple") {
      // --- Pineapple hop, then rest at 20% stump height ---
      if (!canvas || !anim.elem) {
        // Failsafe: if canvas or DOM element is missing, drop this animation.
        if (anim.elem && anim.elem.parentNode) {
          anim.elem.parentNode.removeChild(anim.elem);
        }
        animations.splice(i, 1);
        continue;
      }

      const elapsed = timeMs - anim.startTime;
      const restOffset = typeof anim.restOffset === "number" ? anim.restOffset : 40;

      if (elapsed < 0) {
        // Not started yet; keep the pineapple hidden for now.
        anim.elem.style.visibility = "hidden";
        continue;
      } else {
        anim.elem.style.visibility = "visible";
      }

      let currentY;

      if (elapsed < anim.duration) {
        const t = elapsed / anim.duration; // 0 → 1 over 800ms
        const hopHeight = 100;

        let yOffset;
        if (t < 0.5) {
          // First half: rise with quadratic ease-out
          const u = t * 2; // 0 → 1 over first 400ms
          const eased = 1 - (1 - u) * (1 - u); // easeOutQuad
          yOffset = -hopHeight * eased;
        } else {
          // Second half: fall toward rest height (quadratic in)
          const u = (t - 0.5) * 2; // 0 → 1 over last 400ms
          const eased = u * u; // easeInQuad
          yOffset = -hopHeight * (1 - eased);
        }

        currentY = anim.y + yOffset;
      } else {
        // After popping, stay at 20% stump height above the stump top
        currentY = anim.y - restOffset;
      }

      // Convert canvas coordinates to page coordinates for the DOM sprite.
      const canvasRect = canvas.getBoundingClientRect();
      const pageX = canvasRect.left + anim.x;
      const pageY = canvasRect.top + currentY;

      // Scale the pineapple up by 3x as requested.
      const scale = 3;

      // Position the container so that its bottom-center sits at (pageX, pageY).
      anim.elem.style.transformOrigin = "50% 100%";
      anim.elem.style.left = "0px";
      anim.elem.style.top = "0px";
      anim.elem.style.transform = `translate(${pageX}px, ${pageY}px) translate(-50%, -100%) scale(${scale})`;



        } else if (anim.type === "checkmark") {
      // --- Green checkmark with 3s fade-in ---
      const elapsed = anim.startTime ? timeMs - anim.startTime : 0;
      let alpha = 1;
      if (anim.duration) {
        const t = Math.max(0, Math.min(elapsed / anim.duration, 1));
        alpha = t; // fade in from 0 to 1
      }

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.font = "40px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "#22c55e"; // green
      ctx.shadowColor = "black";
      ctx.shadowBlur = 4;
      ctx.fillText("✅", anim.x, anim.y);
      ctx.restore();
    }
  }
}




const treeSwayConfig = {
  frequency: 0.0006, // very low frequency sway
  amplitude: 10, // pixels
};

function initTrees() {
  if (!canvas) return;

  layers.distantTrees.length = 0;
  layers.mainPlayAreaTrees.length = 0;
  layers.foregroundTrees.length = 0;

  const groundY = canvas.height * 0.95;
  const treeHeight = images.tree.height || 300;

  function createTree(x, scale, layer) {
    const height = treeHeight * scale;
    return {
      baseX: x,
      bottomY: groundY,
      scale,
      layer,
      swayPhase: Math.random() * Math.PI * 2,
    };
  }

  // Layer 2: Distant trees (40% - 60% scale, tinted and gently swaying)
  /*const distantCount = 8;
  for (let i = 0; i < distantCount; i++) {
    const x = ((i + 1) / (distantCount + 1)) * canvas.width;
    const scale = 0.4 + Math.random() * 0.2; // 0.4 - 0.6
    layers.distantTrees.push(createTree(x, scale, 2));
  }

  // Layer 3: Main play area trees (full scale, crisp focus)
  const mainCount = 5;
  for (let i = 0; i < mainCount; i++) {
    const x = ((i + 1) / (mainCount + 1)) * canvas.width;
    const jitter = (Math.random() - 0.5) * 40;
    layers.mainPlayAreaTrees.push(createTree(x + jitter, 1, 3));
  }

  // Layer 4: Close foreground trees framing the edges, slightly larger
  layers.foregroundTrees.push(
    createTree(canvas.width * 0.08, 1.5, 4),
    createTree(canvas.width * 0.92, 1.6, 4)
  );*/

  // Side tall trees using tall_tree.png, anchored to bottom-left and bottom-right corners.
  const tallImg = images.tallTree;
  if (tallImg && tallImg.complete && tallImg.naturalHeight > 0) {
    const desiredHeight = canvas.height;
    const scaleTall = desiredHeight / tallImg.naturalHeight;
    const tallWidth = tallImg.naturalWidth * scaleTall;
    const tallHeight = desiredHeight;

    // Left tree: bottom center aligned with bottom-left corner (0, canvas.height)
    layers.sideTrees.left = {
      x: -tallWidth / 2,
      y: canvas.height - tallHeight,
      width: tallWidth,
      height: tallHeight,
    };

    // Right tree: bottom center aligned with bottom-right corner (canvas.width, canvas.height)
    /*layers.sideTrees.right = {
      x: canvas.width - tallWidth / 2,
      y: canvas.height - tallHeight,
      width: tallWidth,
      height: tallHeight,
    };*/
    layers.sideTrees.right = null;
    } else {
    layers.sideTrees.left = null;
    layers.sideTrees.right = null;
  }
}

function initCrates() {
  if (!canvas || !images.crate.complete) return;
  crates.length = 0;
  const img = images.crate;
  const crateWidth = img.naturalWidth * crateConfig.scale;
  const crateHeight = img.naturalHeight * crateConfig.scale;

  if (!crateWidth || !crateHeight) return;

  const radius = Math.max(crateWidth, crateHeight) / 2;

  const minX = canvas.width * crateConfig.minXRatio + crateWidth / 2;
  const maxX = canvas.width * crateConfig.maxXRatio - crateWidth / 2;
  const minY = canvas.height * crateConfig.minYRatio + crateHeight / 2;
  const maxY = canvas.height * crateConfig.maxYRatio - crateHeight / 2;

  const maxAttemptsPerCrate = 500;

  for (let i = 0; i < crateConfig.count; i++) {
    let placed = false;
    let attempts = 0;

    while (!placed && attempts < maxAttemptsPerCrate) {
      attempts++;

      const cx = minX + Math.random() * (maxX - minX);
      const cy = minY + Math.random() * (maxY - minY);

      let ok = true;
      for (let j = 0; j < crates.length; j++) {
        const other = crates[j];
        const dx = cx - other.cx;
        const dy = cy - other.cy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const minDist = radius * 2 + crateConfig.minGap;
        if (dist < minDist) {
          ok = false;
          break;
        }
      }

      if (ok) {
        crates.push({
          cx,
          cy,
          width: crateWidth,
          height: crateHeight,
          radius,
        });
        placed = true;
      }
    }
  }

  updateNumberTilePositions();
}


function drawCrates() {
  if (!ctx || !images.crate.complete || !crates.length) return;

  const img = images.crate;
  const drawWidth = img.naturalWidth * crateConfig.scale;
  const drawHeight = img.naturalHeight * crateConfig.scale;

  ctx.save();
  crates.forEach((crate) => {
    const x = crate.cx - drawWidth / 2;
    const y = crate.cy - drawHeight / 2;
    ctx.drawImage(img, x, y, drawWidth, drawHeight);
  });
  ctx.restore();
}

// Arrow path connecting stump centres (canvas coordinates)
let stumpCenters = [];

function updateNumberTilePositions() {

  if (!crates.length) return;

  const tiles = document.querySelectorAll('.num[data-role="pool"]');
  if (!tiles.length) return;

  tiles.forEach((tile, index) => {
    // Lock each tile to its original "home" crate index the first time we
    // lay it out, so its home position never changes after initialisation.
    let crateIndex;
    if (tile.dataset.homeCrateIndex != null) {
      crateIndex = parseInt(tile.dataset.homeCrateIndex, 10);
      if (Number.isNaN(crateIndex)) {
        crateIndex = index % crates.length;
        tile.dataset.homeCrateIndex = String(crateIndex);
      }
    } else {
      crateIndex = index % crates.length;
      tile.dataset.homeCrateIndex = String(crateIndex);
    }

    const crate = crates[crateIndex];
    if (!crate) return;

        // Treat each crate's logical point as the centre of the numbered tile cloud.
    // Ensure tiles sit above other overlays and remain draggable.
    tile.style.position = tile.style.position || "absolute";
    tile.style.zIndex = tile.style.zIndex || "500";

    // With base .num transform set to translate(-50%, -100%), the inline
    // left/top represent the visual centre (X) and bottom (Y). We anchor
    // the tile's centre on the crate centre.
    const centerX = crate.cx;
    const centerY = crate.cy;

    tile.style.left = `${centerX}px`;
    tile.style.top = `${centerY}px`;

  });
}




// Particle configuration for falling leaves

// All leaves use a square size between 20px and 40px and share the same
// wind behaviour, regardless of their spawn source.
const particleConfig = {
  maxActiveLeaves:
    particleConfigs.numLeavesAmbient +
    particleConfigs.numLeavesTreePerSide * 2 +
    particleConfigs.numLeavesSky,
  minSize: particleConfigs.minLeafSize,
  maxSize: particleConfigs.maxLeafSize,
  baseSpeed: 0.8,
  maxExtraSpeed: 1.6,
  windFrequency: particleConfigs.windFrequency,
  windAmplitude: 25,
  spawnChanceTreePerFrame: 0.08, // "current" leaves rate
  spawnChanceSkyPerFrame: 0.04, // 50% less frequent than tree rate
};

// Leaf instances are shared across different spawn sources.
// type: "tree" | "sky"
function createLeaf(sourceType) {
  const zDepth = Math.random(); // 0 (far) -> 1 (near)
  const size =
    particleConfig.minSize +
    Math.random() * (particleConfig.maxSize - particleConfig.minSize);

  let spawnX = Math.random() * canvas.width;
  let spawnY = -size; // default spawn slightly above the top edge

  if (sourceType === "tree") {
    // Prefer spawning from the top 30%–50% region of the tall side trees.
    const tallTrees = [];
    if (layers.sideTrees.left) tallTrees.push(layers.sideTrees.left);
    if (layers.sideTrees.right) tallTrees.push(layers.sideTrees.right);

    if (tallTrees.length > 0) {
      const tree =
        tallTrees[Math.floor(Math.random() * tallTrees.length)];
      const startY = tree.y + tree.height * 0.3;
      const endY = tree.y + tree.height * 0.5;

      spawnX = tree.x + Math.random() * tree.width;
      spawnY = startY + Math.random() * (endY - startY);
    } else if (layers.mainPlayAreaTrees.length > 0 && images.tree.complete) {
      // Fallback: top 30% of a random main play area tree canopy.
      const tree =
        layers.mainPlayAreaTrees[
          Math.floor(Math.random() * layers.mainPlayAreaTrees.length)
        ];
      const treeWidth = images.tree.width * tree.scale;
      const treeHeight = images.tree.height * tree.scale;
      const xLeft = tree.baseX - treeWidth / 2;
      const yTop = tree.bottomY - treeHeight;
      const canopyStart = yTop;
      const canopyEnd = yTop + treeHeight * 0.3;

      spawnX = xLeft + Math.random() * treeWidth;
      spawnY = canopyStart + Math.random() * (canopyEnd - canopyStart);
    } else {
      // As a last resort, fall back to the upper third of the canvas.
      spawnX = Math.random() * canvas.width;
      spawnY = Math.random() * (canvas.height * 0.3);
    }
  } else if (sourceType === "sky") {
    // Sky leaves: spawn from slightly above the visible canvas.
    spawnX = Math.random() * canvas.width;
    spawnY = -Math.random() * (canvas.height * 0.2);
  }

    // Rigid-body physics state
  const mass = 0.4 + Math.random() * 0.2; // slightly heavier leaves for stability
  const rho = 1.0; // air density (game units)
  const Cd_base = 1.0 + Math.random() * 0.3; // base drag coefficient


  const initialSpeedDown = 40 + Math.random() * 40; // initial downward speed
  const vx = (Math.random() - 0.5) * 40; // small horizontal component
  const vy = initialSpeedDown;
  const angle = Math.random() * Math.PI * 2; // random orientation
  const angularVel = (Math.random() - 0.5) * 1.0; // initial spin

  return {
    type: sourceType,
    x: spawnX,
    y: spawnY,
    vx,
    vy,
    angle,
    angularVel,
    mass,
    size,
    rho,
    Cd_base,
    zDepth,
  };
}


function initParticles() {
  layers.particles.length = 0;
}

function spawnLeaves(time) {
  // Spawn tree-origin leaves ("current" leaves) at the base rate.
  const activeTreeLeaves = layers.particles.filter(
    (leaf) => leaf.type === "tree"
  );
  if (
    activeTreeLeaves.length <
      particleConfigs.numLeavesAmbient +
        particleConfigs.numLeavesTreePerSide * 2 &&
    Math.random() < particleConfig.spawnChanceTreePerFrame
  ) {
    layers.particles.push(createLeaf("tree"));
  }

  // Spawn sky-origin leaves at 50% of the current leaf rate.
  const activeSkyLeaves = layers.particles.filter(
    (leaf) => leaf.type === "sky"
  );
  if (
    activeSkyLeaves.length < particleConfigs.numLeavesSky &&
    Math.random() < particleConfig.spawnChanceSkyPerFrame
  ) {
    layers.particles.push(createLeaf("sky"));
  }

  // Global cap for safety.
  if (layers.particles.length > particleConfig.maxActiveLeaves) {
    layers.particles.length = particleConfig.maxActiveLeaves;
  }
}


function drawDeepBackground() {
  if (!ctx || !images.jungleBg.complete) return;
  ctx.save();
  ctx.filter = `blur(${layers.deepBackground.blur}px)`;
  ctx.drawImage(images.jungleBg, 0, 0, canvas.width, canvas.height);
  ctx.restore();
}

function drawTree(tree, options, time) {
  if (!ctx || !images.tree.complete) return;

  const blur = options && options.blur ? options.blur : 0;
  const tintColor = options && options.tintColor ? options.tintColor : null;
  const sway = options && options.sway;
  const swayFrequency =
    (options && options.frequency) || treeSwayConfig.frequency;
  const swayAmplitude =
    (options && options.amplitude) || treeSwayConfig.amplitude;

  let drawX = tree.baseX;
  if (sway) {
    drawX += Math.sin(time * swayFrequency + tree.swayPhase) * swayAmplitude;
  }

  const treeWidth = images.tree.width * tree.scale;
  const treeHeight = images.tree.height * tree.scale;
  const x = drawX - treeWidth / 2;
  const y = tree.bottomY - treeHeight;

  ctx.save();
  ctx.filter = blur ? `blur(${blur}px)` : "none";
  ctx.drawImage(images.tree, x, y, treeWidth, treeHeight);

  if (tintColor) {
    ctx.globalCompositeOperation = "source-atop";
    ctx.fillStyle = tintColor;
    ctx.fillRect(x, y, treeWidth, treeHeight);
  }

  ctx.restore();
}

function drawTallSideTrees() {
  if (!ctx || !images.tallTree.complete) return;

  const tallImg = images.tallTree;

  ctx.save();
  ctx.filter = "none";

  ["left", "right"].forEach((side) => {
    const tree = layers.sideTrees[side];
    if (!tree) return;

    ctx.drawImage(tallImg, tree.x, tree.y, tree.width, tree.height);
  });

  ctx.restore();
}

function drawTrees(time) {
  // Layer 2: distant tinted, swaying trees
  layers.distantTrees.forEach((tree) => {
    drawTree(
      tree,
      {
        blur: 1.5,
        tintColor: "rgba(40, 80, 120, 0.5)",
        sway: true,
        frequency: 0.0004,
        amplitude: 6,
      },
      time
    );
  });

  // Layer 3: main play area trees (sharp focus)
  layers.mainPlayAreaTrees.forEach((tree) => {
    drawTree(tree, { blur: 0, tintColor: null, sway: false }, time);
  });

  // Layer 4: foreground framing trees (stronger blur, close to camera)
  layers.foregroundTrees.forEach((tree) => {
    drawTree(tree, { blur: 3.5, tintColor: null, sway: false }, time);
  });

  // Layer 5: tall side trees that reach the full viewport height
  drawTallSideTrees();
}

// Draw a white arrow connecting the centres of the tree stumps and
// indicating ascending/descending direction.
function drawModeArrow() {
  if (!ctx || !canvas) return;
  if (!stumpCenters || stumpCenters.length < 2) return;

  ctx.save();
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 5;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  // Connect all stump centres with a polyline
  const first = stumpCenters[0];
  ctx.beginPath();
  ctx.moveTo(first.x, first.y);
  for (let i = 1; i < stumpCenters.length; i++) {
    const pt = stumpCenters[i];
    ctx.lineTo(pt.x, pt.y);
  }
  ctx.stroke();

  // Arrowhead direction depends on mode
  const mode = gameState.mode || "ascending";
  let headFrom, headTo;
  if (mode === "ascending") {
    headFrom = stumpCenters[stumpCenters.length - 2];
    headTo = stumpCenters[stumpCenters.length - 1];
  } else {
    headFrom = stumpCenters[1];
    headTo = stumpCenters[0];
  }

  if (headFrom && headTo) {
    const dx = headTo.x - headFrom.x;
    const dy = headTo.y - headFrom.y;
    const angle = Math.atan2(dy, dx);
    const arrowLen = 24;

    ctx.beginPath();
    ctx.moveTo(headTo.x, headTo.y);
    ctx.lineTo(
      headTo.x - arrowLen * Math.cos(angle - Math.PI / 6),
      headTo.y - arrowLen * Math.sin(angle - Math.PI / 6)
    );
    ctx.moveTo(headTo.x, headTo.y);
    ctx.lineTo(
      headTo.x - arrowLen * Math.cos(angle + Math.PI / 6),
      headTo.y - arrowLen * Math.sin(angle + Math.PI / 6)
    );
    ctx.stroke();
  }

    ctx.restore();
}


// DOM overlay arrow drawn directly on top of the stump images.
const SVG_NS = "http://www.w3.org/2000/svg";
let domModeArrowSvg = null;

// SVG layer for drawing "<" comparison symbols between pineapples.
let pineappleCompareSvg = null;

function ensurePineappleCompareSvg() {
  if (pineappleCompareSvg) return pineappleCompareSvg;
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.id = "pineapple-compare-layer";
  svg.style.position = "fixed";
  svg.style.left = "0";
  svg.style.top = "0";
  svg.style.width = "100%";
  svg.style.height = "100%";
  svg.style.pointerEvents = "none";
  // Above stumps/cubes and mode arrow, but below victory modal.
  svg.style.zIndex = "450";
  document.body.appendChild(svg);
  pineappleCompareSvg = svg;
  return svg;
}

function computeAveragePineappleY() {
  if (!pineapplePositions || pineapplePositions.length === 0) {
    return null;
  }
  let sum = 0;
  for (let i = 0; i < pineapplePositions.length; i++) {
    sum += pineapplePositions[i].y;
  }
  return sum / pineapplePositions.length;
}

// Draw one "<" symbol (with border lines to each pineapple) for a
// specific neighbouring pair of pineapples. The symbol is drawn over
// 2 seconds using a stroke-dashoffset animation.
function drawPineappleComparisonSymbol(leftPos, rightPos, avgYCanvas) {
  if (!canvas) return;
  const svg = ensurePineappleCompareSvg();
  const canvasRect = canvas.getBoundingClientRect();

  const leftScreenX = canvasRect.left + leftPos.x;
  const leftScreenY = canvasRect.top + leftPos.y;
  const rightScreenX = canvasRect.left + rightPos.x;
  const rightScreenY = canvasRect.top + rightPos.y;

  // Centre of the symbol in canvas and screen coordinates.
  const centerXCanvas = (leftPos.x + rightPos.x) / 2;
  const centerScreenX = canvasRect.left + centerXCanvas;
  const centerScreenY = canvasRect.top + avgYCanvas;

  // Symbol size proportional to the horizontal gap between pineapples,
  // but clamped to a sensible range.
  const horizontalGap = Math.abs(rightPos.x - leftPos.x);
  const baseSize = Math.max(32, Math.min(72, horizontalGap * 0.25));
  const halfWidth = baseSize / 2;
  const halfHeight = baseSize / 2;

  const path = document.createElementNS(SVG_NS, "path");
  const d = [
    "M",
    centerScreenX + halfWidth,
    centerScreenY - halfHeight,
    "L",
    centerScreenX - halfWidth,
    centerScreenY,
    "L",
    centerScreenX + halfWidth,
    centerScreenY + halfHeight,
  ].join(" ");
  path.setAttribute("d", d);
  path.setAttribute("fill", "none");
  path.setAttribute("stroke", "white"); // warm yellow
  path.setAttribute("stroke-width", "4");
  path.setAttribute("stroke-linecap", "round");
  path.setAttribute("stroke-linejoin", "round");
  svg.appendChild(path);

    // Helper to initialise a 2-second stroke-draw animation.
  // Uses a JavaScript-driven requestAnimationFrame loop instead of
  // relying on CSS transitions so that the "<" symbols are always
  // drawn stroke-by-stroke, even on browsers that sometimes skip
  // dashoffset transitions.
  function animateStroke(el) {
    let length = 0;
    if (typeof el.getTotalLength === "function") {
      try {
        length = el.getTotalLength();
      } catch (e) {
        length = 0;
      }
    } else {
      // Fallback for <line> elements when getTotalLength is unavailable.
      const x1 = parseFloat(el.getAttribute("x1") || "0");
      const y1 = parseFloat(el.getAttribute("y1") || "0");
      const x2 = parseFloat(el.getAttribute("x2") || "0");
      const y2 = parseFloat(el.getAttribute("y2") || "0");
      length = Math.hypot(x2 - x1, y2 - y1);
    }

    // Robust fallback length to ensure we always get a visible animation.
    if (!length || !isFinite(length)) {
      length = 100;
    }

    el.style.strokeDasharray = String(length);
    el.style.strokeDashoffset = String(length);

    const durationMs = 2000; // 2 seconds
    const startTime = performance.now();

    function step(now) {
      const elapsed = now - startTime;
      const t = Math.max(0, Math.min(elapsed / durationMs, 1)); // 0 → 1
      const currentOffset = length * (1 - t);
      el.style.strokeDashoffset = String(currentOffset);

      if (t < 1) {
        requestAnimationFrame(step);
      }
    }

    // Start animation on the next frame to ensure the initial
    // dashoffset state has been applied.
    requestAnimationFrame(step);
  }
  animateStroke(path);
}

// Schedule drawing of "<" symbols between neighbouring pineapples at
// end-game. Each symbol takes 2 seconds to draw with a 1 second pause
// before the next one starts.
function schedulePineappleComparisonDrawing() {
  if (!canvas) return;
  if (!pineapplePositions || pineapplePositions.length < 2) return;

  const svg = ensurePineappleCompareSvg();

  // Clear any previous symbols.
  while (svg.firstChild) {
    svg.removeChild(svg.firstChild);
  }

  // Clone and sort pineapples by X so we know left-to-right order.
  const positions = pineapplePositions
    .map((pos) => ({ x: pos.x, y: pos.y }))
    .sort((a, b) => a.x - b.x);

  const avgY = computeAveragePineappleY();
  if (avgY == null) return;

  const pairs = [];
  for (let i = 0; i < positions.length - 1; i++) {
    pairs.push({ left: positions[i], right: positions[i + 1] });
  }

  if (!pairs.length) return;

  const mode = gameState.mode || "ascending";
  const orderedPairs =
    mode === "ascending" ? pairs : pairs.slice().reverse();

  // Each symbol: 2s draw + 1s pause => 3s per step.
  const stepDurationMs = 3000;

  orderedPairs.forEach((pair, index) => {
    const delay = index * stepDurationMs;
    setTimeout(() => {
      drawPineappleComparisonSymbol(pair.left, pair.right, avgY - 50);
    }, delay);
  });
}


function ensureDomModeArrowSvg() {
  if (domModeArrowSvg) return domModeArrowSvg;
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.id = "dom-mode-arrow";
  svg.style.position = "fixed";
  svg.style.left = "0";
  svg.style.top = "0";
  svg.style.width = "100%";
  svg.style.height = "100%";
  svg.style.pointerEvents = "none";
  svg.style.zIndex = "400"; // above stumps/cubes
  document.body.appendChild(svg);
  domModeArrowSvg = svg;
  return svg;
}

function updateDomModeArrow() {
  const stumps = document.querySelectorAll(".slot-stump-image");
  if (!stumps.length || !canvas) return;

  const svg = ensureDomModeArrowSvg();

  // Clear previous arrow
  while (svg.firstChild) {
    svg.removeChild(svg.firstChild);
  }

  // Build polyline through stump tops in screen coordinates
  const points = [];
  for (let i = 0; i < stumps.length; i++) {
    const rect = stumps[i].getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height * 0.5; // near top of stump
    points.push(`${x},${y}`);
  }

  if (points.length < 2) return;

  const polyline = document.createElementNS(SVG_NS, "polyline");
  polyline.setAttribute("points", points.join(" "));
  polyline.setAttribute("fill", "none");
  polyline.setAttribute("stroke", "#ffffff");
  polyline.setAttribute("stroke-width", "5");
  polyline.setAttribute("stroke-linecap", "round");
  polyline.setAttribute("stroke-linejoin", "round");
  svg.appendChild(polyline);

  // Arrowhead based on mode
  const mode = gameState.mode || "ascending";
  let headFromIndex;
  let headToIndex;
  if (mode === "ascending") {
    headFromIndex = stumps.length - 2;
    headToIndex = stumps.length - 1;
  } else {
    headFromIndex = 1;
    headToIndex = 0;
  }

  if (
    headFromIndex != null &&
    headToIndex != null &&
    headFromIndex >= 0 &&
    headToIndex >= 0 &&
    headFromIndex < stumps.length &&
    headToIndex < stumps.length
  ) {
    const fromRect = stumps[headFromIndex].getBoundingClientRect();
    const toRect = stumps[headToIndex].getBoundingClientRect();
    const fromX = fromRect.left + fromRect.width / 2;
    const fromY = fromRect.top + fromRect.height * 0.5;
    const toX = toRect.left + toRect.width / 2;
    const toY = toRect.top + toRect.height * 0.5;

    const dx = toX - fromX;
    const dy = toY - fromY;
    const angle = Math.atan2(dy, dx);
    const arrowLen = 24;

    const line = document.createElementNS(SVG_NS, "line");
    line.setAttribute("x1", toX);
    line.setAttribute("y1", toY);
    line.setAttribute(
      "x2",
      toX - arrowLen * Math.cos(angle - Math.PI / 6)
    );
    line.setAttribute(
      "y2",
      toY - arrowLen * Math.sin(angle - Math.PI / 6)
    );
    line.setAttribute("stroke", "#ffffff");
    line.setAttribute("stroke-width", "5");
    line.setAttribute("stroke-linecap", "round");
    svg.appendChild(line);

    const line2 = document.createElementNS(SVG_NS, "line");
    line2.setAttribute("x1", toX);
    line2.setAttribute("y1", toY);
    line2.setAttribute(
      "x2",
      toX - arrowLen * Math.cos(angle + Math.PI / 6)
    );
    line2.setAttribute(
      "y2",
      toY - arrowLen * Math.sin(angle + Math.PI / 6)
    );
    line2.setAttribute("stroke", "#ffffff");
    line2.setAttribute("stroke-width", "5");
    line2.setAttribute("stroke-linecap", "round");
    svg.appendChild(line2);
  }
}


function drawAndUpdateParticles(time) {


  if (!ctx || !images.leaf.complete) return;

  const dt = 1 / 60; // fixed timestep for stability
  const GRAVITY = 500; // pixels/s^2 downward
  const FORCE_SCALE = 0.00002; // scales drag/lift forces into sane pixel units
  const VORTEX_SCALE = 5; // smaller chaotic perturbation for visibility

  function normalizeAngle(a) {
    // wrap angle to [-PI, PI]
    return ((a + Math.PI) % (Math.PI * 2)) - Math.PI;
  }

  const leaves = layers.particles;

  for (let i = leaves.length - 1; i >= 0; i--) {
    const leaf = leaves[i];

    // Ensure physics state exists (for any legacy leaves)
    if (typeof leaf.vx !== "number") leaf.vx = 0;
    if (typeof leaf.vy !== "number") leaf.vy = 0;
    if (typeof leaf.angle !== "number") leaf.angle = Math.random() * Math.PI * 2;
    if (typeof leaf.angularVel !== "number") leaf.angularVel = 0;
    if (typeof leaf.mass !== "number") leaf.mass = 0.4;
    if (typeof leaf.size !== "number") leaf.size =
      particleConfig.minSize +
      Math.random() * (particleConfig.maxSize - particleConfig.minSize);
    if (typeof leaf.rho !== "number") leaf.rho = 1.0;
    if (typeof leaf.Cd_base !== "number") leaf.Cd_base = 1.0;

    let vx = leaf.vx;
    let vy = leaf.vy;

    const v2 = vx * vx + vy * vy;
    const v = Math.sqrt(v2);

    let ax = 0;
    let ay = GRAVITY; // base gravitational acceleration

    let angle = leaf.angle;
    let angularVel = leaf.angularVel;

    if (v > 0.01) {
      // Angle of attack between velocity vector and leaf's local X-axis
      const velAngle = Math.atan2(vy, vx);
      const alpha = normalizeAngle(velAngle - angle);

      // Dynamic drag coefficient
      const sinAlpha = Math.sin(alpha);
      const Cd = leaf.Cd_base * (1 + 2 * sinAlpha * sinAlpha);

      // Projected area depending on orientation
      const A =
        leaf.size * leaf.size * Math.abs(Math.cos(alpha)) +
        leaf.size * 0.15 * Math.abs(Math.sin(alpha));

      const rho = leaf.rho;

      // Drag force magnitude (opposite velocity)
      const dragMag = 0.5 * rho * Cd * A * v2 * FORCE_SCALE;
      const dragFx = (-vx / v) * dragMag;
      const dragFy = (-vy / v) * dragMag;

      // Lift force magnitude (perpendicular to velocity)
      const liftMag = dragMag * 0.25; // tuned factor for stability
      const liftFx = (-vy / v) * liftMag;
      const liftFy = (vx / v) * liftMag;

      // Total aerodynamic force
      let fx = dragFx + liftFx;
      let fy = dragFy + liftFy;

      // Chaotic vortex shedding perturbation
      fx += (Math.random() - 0.5) * VORTEX_SCALE;

      // Linear acceleration from forces
      ax += fx / leaf.mass;
      ay += fy / leaf.mass;

      // Flutter & tumble torque
      const I = (leaf.mass * leaf.size * leaf.size) / 12; // square plate inertia
      const alpha_ang = (0.01 * v2 * Math.sin(2 * alpha)) / I;
      angularVel += alpha_ang * dt;
    }

    // Semi-Implicit Euler integration
    vx += ax * dt;
    vy += ay * dt;

    leaf.x += vx * dt;
    leaf.y += vy * dt;

    leaf.vx = vx;
    leaf.vy = vy;

    leaf.angularVel = angularVel;
    leaf.angle += leaf.angularVel * dt;

    // Draw leaf with rotation and depth blur
    const blur = leaf.zDepth < 0.2 || leaf.zDepth > 0.8 ? 2.5 : 0;

    ctx.save();
    ctx.filter = blur ? `blur(${blur}px)` : "none";
    ctx.translate(leaf.x, leaf.y);
    ctx.rotate(leaf.angle);
    ctx.drawImage(
      images.leaf,
      -leaf.size / 2,
      -leaf.size / 2,
      leaf.size,
      leaf.size
    );
    ctx.restore();

    // Viewport culling (no respawn)
    if (
      leaf.y > canvas.height + 100 ||
      leaf.x < -100 ||
      leaf.x > canvas.width + 100
    ) {
      leaves.splice(i, 1);
    }
  }
}



// Sunshine ray (god-rays / crepuscular rays) effect overlay
class SunshineEffect {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.lightSource = { x: 0, y: 0 };
    this.layers = [];
    this.noiseTime = 0;
    this.lastTimestamp = 0;
    this._initLayers();
    this.handleResize();
  }

  _initLayers() {
    // Multiple ray layers with different speeds to create a 2.5D parallax effect.
    this.layers = [
      {
        radiusScale: 1.2,
        beamCount: 40,
        baseAlpha: 0.18 + 0.16,
        noiseScale: 0.0008,
        speed: 0.00004,
      },
      {
        radiusScale: 1.4,
        beamCount: 30,
        baseAlpha: 0.12 + 0.16,
        noiseScale: 0.0012,
        speed: 0.00007,
      },
      {
        radiusScale: 1.6,
        beamCount: 20,
        baseAlpha: 0.08 + 0.16,
        noiseScale: 0.0016,
        speed: 0.0001,
      },
    ];
  }

  handleResize() {
    const w = this.canvas.width;
    const h = this.canvas.height;
    // Off-screen / off-centre light source (80% X, -10% Y of viewport).
    this.lightSource.x = w * 0.8;
    this.lightSource.y = -h * 0.1;
    this.maxRadius = Math.sqrt(w * w + h * h) * 1.2;
  }

  // Smooth pseudo-noise using overlapping sine/cosine waves.
  noise2D(x, y, time) {
    const n1 =
      Math.sin(x * 0.0007 + time * 0.0013) *
      Math.cos(y * 0.0004 + time * 0.0011);
    const n2 =
      Math.sin(x * 0.0003 + time * 0.0009) *
      Math.cos(y * 0.0006 + time * 0.0017);
    return 0.5 + 0.5 * (0.6 * n1 + 0.4 * n2);
  }

  // 1D smooth noise used for global flicker.
  noise1D(t) {
    return 0.5 + 0.5 * Math.sin(t) * Math.cos(t * 0.7);
  }

  render(time) {
    if (!this.ctx) return;

    if (!this.lastTimestamp) {
      this.lastTimestamp = time;
    }
    const dt = time - this.lastTimestamp;
    this.lastTimestamp = time;
    this.noiseTime += dt * 0.0005;

    const ctx = this.ctx;
    ctx.save();
    // Use "screen" blending so rays brighten the existing scene
    // without washing it out.
    ctx.globalCompositeOperation = "screen";

    const flicker = 0.7 + 0.3 * this.noise1D(this.noiseTime * 0.8);

    this.layers.forEach((layer, index) => {
      const radius = this.maxRadius * layer.radiusScale;
      const beamCount = layer.beamCount;
      const baseAlpha = layer.baseAlpha;

      for (let i = 0; i < beamCount; i++) {
        const angle =
          (i / beamCount) * Math.PI +
          this.noiseTime * layer.speed +
          index * 0.12;

        const startX = this.lightSource.x;
        const startY = this.lightSource.y;
        const endX = startX + Math.cos(angle) * radius;
        const endY = startY + Math.sin(angle) * radius;

        // march along the beam in small segments to create
        // volumetric, feathered light patches.
        const segments = 12;
        for (let s = 0; s < segments; s++) {
          const t = s / segments;
          const px = startX + (endX - startX) * t;
          const py = startY + (endY - startY) * t;

          // fade toward the far end of the beam
          const fade = 1 - t;
          const localNoise = this.noise2D(
            px + index * 50,
            py - index * 80,
            this.noiseTime * (1 + index * 0.25)
          );

          const alpha = baseAlpha * fade * localNoise * flicker;
          if (alpha <= 0.001) continue;

          const thickness =
            60 * (1 - t) * (0.5 + localNoise) * (1 + index * 0.2);

          const grad = ctx.createRadialGradient(
            px,
            py,
            0,
            px,
            py,
            thickness
          );
          grad.addColorStop(0, `rgba(142, 90, 35, ${alpha})`);
          grad.addColorStop(1, "rgba(142, 90, 35, 0)");
          ctx.fillStyle = grad;
          ctx.beginPath();
          // Elongated elliptical patch oriented along the beam direction.
          ctx.ellipse(
            px,
            py,
            thickness,
            thickness * 0.35,
            angle,
            0,
            Math.PI * 2
          );
          ctx.fill();
        }
      }
    });

    ctx.restore();
  }
}

let sunshineEffect = null;
function initSunshineEffect(canvasElement) {
  if (!canvasElement) return null;
  const effect = new SunshineEffect(canvasElement);
  return effect;
}

function gameLoop(timestamp) {
  if (!ctx || !canvas) return;
  const time = timestamp || performance.now();

  const dt = lastFrameTime ? (time - lastFrameTime) / 1000 : 0;
  lastFrameTime = time;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Layer 1: deep background
  drawDeepBackground();

    // Layers 2-4: trees
  drawTrees(time);

    // Layer 5: crates placed in the mid-ground (removed visually; crates now act as
  // invisible anchor points for the numbered tile clouds)
  // drawCrates();

  // (Canvas-based mode arrow removed; DOM-based arrow is drawn directly
  // on top of the stump DOM elements via updateDomModeArrow.)

  // Wooden sign video layer (drawn on top of crates, before particles and rays)
  // drawSignVideo();



  // Layer 6: ambient + tree + sky leaf particles
  spawnLeaves(time);
  drawAndUpdateParticles(time);

  // Layer 7: global sunshine rays overlay
  if (sunshineEffect) {
    sunshineEffect.render(time);
  }

  // Layer 8: top-level animations (smoke, pineapple hop, checkmarks)
  updateAndDrawAnimations(time, dt);

  requestAnimationFrame(gameLoop);
}



const requiredAssetKeys = [
  "jungleBg",
  "tree",
  "leaf",
  "tallTree",
  "crate",
  "pineapple",
];
const loadedAssets = new Set();

function onAssetReady(assetKey) {
  if (loadedAssets.has(assetKey)) return;
  loadedAssets.add(assetKey);

  if (loadedAssets.size === requiredAssetKeys.length) {
    initTrees();
    initCrates();
    initParticles();
    sunshineEffect = initSunshineEffect(canvas);
    updateNumberTilePositions();
    requestAnimationFrame(gameLoop);
  }
}

function registerAssetLoad(assetKey) {
  const img = images[assetKey];
  if (!img) {
    onAssetReady(assetKey);
    return;
  }

  // Handle cached images that may have finished loading before listener registration.
  if (img.complete && img.naturalWidth > 0) {
    onAssetReady(assetKey);
    return;
  }

  img.addEventListener("load", () => onAssetReady(assetKey), { once: true });
  img.addEventListener("error", () => onAssetReady(assetKey), { once: true });
}

requiredAssetKeys.forEach(registerAssetLoad);



function updateStumpsLayout() {
  if (!canvas) return;

  const stumps = document.querySelectorAll(".slot-stump-image");
  const cubes = document.querySelectorAll(".slot-cube");
  if (!stumps.length || stumps.length !== cubes.length) return;

    const N = stumps.length;

  // Reset stump centres and rebuild them from current layout
  stumpCenters = [];

  for (let i = 0; i < N; i++) {

    //const targetBottom = canvas.height * (0.875 + Math.sqrt(i) * 0.06); // 5% from bottom of viewport
    const targetBottom = canvas.height * 0.95;
    const stump = stumps[i];
    const cube = cubes[i];

    // Reset transforms to a neutral state before measuring.
    stump.style.transformOrigin = "50% 100%";
    stump.style.transform = "translate(-50%, 0) scale(1)";
    cube.style.transformOrigin = "50% 50%";
    cube.style.transform = "translate(0px, 0px) scale(1)";

    const stumpRect = stump.getBoundingClientRect();

    // Evenly distribute stump centers across viewport width

            const targetCenterX =
              ((i + 0.5) / N) * canvas.width * 0.85 + canvas.width * 0.12;
    const currentCenterX = stumpRect.left + stumpRect.width / 2;
    const deltaStumpX = targetCenterX - currentCenterX;

    // Align stump bottom at 5% from bottom of viewport
    const currentBottom = stumpRect.bottom;
    const deltaStumpY = targetBottom - currentBottom;

    // Apply stump transform: base center + translations
    stump.style.transform = `translate(-50%, 0) translate(${deltaStumpX}px, ${deltaStumpY}px) scale(3)`;

    // --- MATHEMATICAL PREDICTION (No second layout read!) ---
    const scaledStumpHeight = stumpRect.height * 3;
    
    // Since scale anchor is bottom-center, target bottom dictates the new top position
    const stumpTopCenterX = targetCenterX;
    const stumpTopCenterY = targetBottom - scaledStumpHeight;

        // Record stump centre in canvas coordinates for the mode arrow.
    // Convert from page coords (client) to canvas coords.
    const canvasRect = canvas.getBoundingClientRect();

    // Lift the arrow slightly above the visual top of each stump so
    // the white path appears clearly above the stumps instead of
    // intersecting their tops.
    const arrowYOffset = scaledStumpHeight * 0.15; // 15% of stump height

    stumpCenters.push({
      // Extend arrow 5% longer at tail and head by mapping the logical
      // stump center into an expanded parametric 0.05–0.95 domain.
      x:
        canvas.width * 0.05 +
        (stumpTopCenterX / canvas.width) * canvas.width * 0.9,
      y: stumpTopCenterY + stumpRect.height / 2,
    });

    // Ensure arrow layer is above stumps by tracking a higher z-like value
    // that drawModeArrow can respect (logical layering only).
    stumpCenters[stumpCenters.length - 1].layer = 1; // stumps are layer 1


    const cubeRect = cube.getBoundingClientRect();

    const cubeBottomCenterX = cubeRect.left + cubeRect.width / 2;
    const cubeBottomCenterY = cubeRect.bottom;

    const deltaCubeX = stumpTopCenterX - cubeBottomCenterX;
    const deltaCubeY = stumpTopCenterY - cubeBottomCenterY;

        // Configure oval shadow on the top of the tree stump
    const wrapper = cube.closest(".slot-wrapper");
    if (wrapper) {
      const shadow = wrapper.querySelector(".slot-shadow");
      if (shadow) {
        const wrapperRect = wrapper.getBoundingClientRect();

                // Shadow center: 10% of stump image height from top, horizontally aligned with stump
        const currentStumpRect = stump.getBoundingClientRect();
        const currentStumpHeight = currentStumpRect.height;
        const shadowCenterX = currentStumpRect.left + currentStumpRect.width / 2;
        const shadowCenterY = currentStumpRect.top + currentStumpHeight * 0.2;


        // Shadow size follows cube size so larger cubes cast larger shadows
        const cubeSide = cubeRect.width; // cube is square
        const majorAxis = cubeSide * 0.7; // longer axis
        const minorAxis = cubeSide * 0.4; // shorter axis

        shadow.style.width = `${majorAxis}px`;
        shadow.style.height = `${minorAxis}px`;

        // Position shadow relative to wrapper using predicted math coordinates
        const left = shadowCenterX - wrapperRect.left - majorAxis / 2;
        const top = shadowCenterY - wrapperRect.top - minorAxis / 2;

        shadow.style.left = `${left}px`;
        shadow.style.top = `${top}px`;
        shadow.style.transform = "none";
        // Darker shadow (75% darker appearance)
        shadow.style.backgroundColor = "rgba(0, 0, 0, 0.75)";
      }
    }


    // Store translation components so progression logic can scale separately
    cube.dataset.tx = String(deltaCubeX);
    cube.dataset.ty = String(deltaCubeY);

    // Initial positioning at base scale
    cube.style.transform = `translate(${deltaCubeX}px, ${deltaCubeY}px) scale(1)`;
  }


    // Apply progression-based scaling and coloring after layout
  updateCubesProgression();

  // Update DOM-based mode arrow drawn on top of stumps.
  updateDomModeArrow();
  updateBottomModeArrowLayout();
  updateBottomModeArrowDirection();
}





// ======================= Sorting Game Logic =======================


// 遊戲狀態
let gameState = {
  numbers: [],
  mode: null,
  difficulty: null,
  selectedNumbers: [],
  nextIndex: 0,
  draggedValue: null,
  draggedElement: null,
};

function validatePlacement(index, numberValue) {
  let sorted = [...gameState.numbers];
  if (gameState.mode === "ascending") {
    sorted.sort((a, b) => a - b);
  } else {
    sorted.sort((a, b) => b - a);
  }

  const logicalIndex =
    gameState.mode === "ascending"
      ? index
      : sorted.length - 1 - index;

  const expectedValue = sorted[logicalIndex];
  return numberValue === expectedValue;
}

function updateCubeFacesWithValue(slot, value) {
  const cube = slot.closest(".slot-cube");
  if (!cube) return;

  const faces = cube.querySelectorAll(".slot-cube-face");
  faces.forEach((face) => {
    face.textContent = String(value);
    face.style.color = "white";
    face.style.fontWeight = "bold";
    face.style.fontSize = "24px";
  });
}

function updateCubesProgression() {
  if (!slotsBox) return;

  const cubes = document.querySelectorAll(".slot-cube");
  const slots = slotsBox.querySelectorAll(".slot");
  if (!cubes.length || cubes.length !== slots.length) return;

  const N = cubes.length;
  let filledCount = 0;
  const emptyIndices = [];

  for (let i = 0; i < N; i++) {
    const slot = slots[i];
    const isFilled = slot.textContent.trim() !== "";
    if (isFilled) {
      filledCount++;
    } else {
      emptyIndices.push(i);
    }
  }

    let activeIndex = null;
  if (emptyIndices.length > 0) {
    if (gameState.mode === "ascending") {
      // leftmost available empty space
      activeIndex = emptyIndices[0];
    } else {
      // rightmost available empty space
      activeIndex = emptyIndices[emptyIndices.length - 1];
    }
  }

  for (let i = 0; i < N; i++) {
    const cube = cubes[i];
    const slot = slots[i];
    const isFilled = slot.textContent.trim() !== "";

    const tx = parseFloat(cube.dataset.tx || "0");
    const ty = parseFloat(cube.dataset.ty || "0");

    let scale = 1;

    if (isFilled) {
      // Filled: remain at base size and light blue
      scale = 1;
    } else if (activeIndex !== null && i === activeIndex) {
      // Active empty space: scaled up and animated between blue and milk-white
      scale = 2.5;
    } else {
      // Non-active, empty spaces stay small and grey
      scale = 1;
    }


    cube.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;

    const faces = cube.querySelectorAll(".slot-cube-face");
    faces.forEach((face) => {
      face.style.animation = "";
      if (isFilled) {
        // Light blue for filled cubes
        face.style.backgroundColor = "#3b82f6";
      } else if (activeIndex !== null && i === activeIndex) {
        // Animate color between blue and milk-white
        face.style.backgroundColor = "#1d4ed8";
        face.style.animation = "cube-active-color 2s ease-in-out infinite";
      } else {
        // Grey for non-active, empty cubes
        face.style.backgroundColor = "#808080";
      }
    });

        // Shadow on stump when cube is floating (large)
    const wrapper = cube.closest(".slot-wrapper");
    if (wrapper) {
      const shadow = wrapper.querySelector(".slot-shadow");
      const stumpImg = wrapper.querySelector(".slot-stump-image");
      if (shadow && stumpImg) {
        const stumpRect = stumpImg.getBoundingClientRect();
                const stumpHeight = stumpRect.height;
        const stumpCenterX = stumpRect.left + stumpRect.width / 2;

        // Shadow center: 10% of stump image height from top, horizontally aligned with stump
        const shadowCenterX = stumpCenterX;
        const shadowCenterY = stumpRect.top + stumpHeight * 0.2;

        // Shadow size follows cube size so larger cubes cast larger shadows
        const cubeRect = cube.getBoundingClientRect();
        const cubeSide = cubeRect.width; // cube is square and scaled via transform
        const majorAxis = cubeSide * 0.7;
        const minorAxis = cubeSide * 0.4;


        shadow.style.width = `${majorAxis}px`;
        shadow.style.height = `${minorAxis}px`;

        const wrapperRect = wrapper.getBoundingClientRect();
        const left = shadowCenterX - wrapperRect.left - majorAxis / 2;
        const top = shadowCenterY - wrapperRect.top - minorAxis / 2;

        shadow.style.left = `${left}px`;
        shadow.style.top = `${top}px`;
        shadow.style.transform = "none";

        // Darker shadow (75% darker appearance)
        shadow.style.backgroundColor = "rgba(0, 0, 0, 0.75)";
        shadow.style.opacity = scale > 1 ? "0.8" : "0.6";
      }
    }

  }
}





// 外套選項（目前未使用，但保留作擴充用）
const outfits = [
  { name: "🍌 香蕉熊外套", emoji: "🍌" },
  { name: "🍓 士多啤梨熊外套", emoji: "🍓" },
  { name: "🍉 西瓜熊外套", emoji: "🍉" },
  { name: "🍊 橙熊外套", emoji: "🍊" },
  { name: "🍇 提子熊外套", emoji: "🍇" },
  { name: "🍑 水蜜桃熊外套", emoji: "🍑" },
];

// DOM 元素
const mainMenu = document.getElementById("mainMenu");
const gameArea = document.getElementById("gameArea");
const difficultySelection = document.getElementById("difficultySelection");
const numbersBox = document.getElementById("numbers");
const slotsBox = document.getElementById("slots");
const speech = document.getElementById("speech");
const yellowBubbleText = document.getElementById("yellowBubbleText");
const result = document.getElementById("result");
const treasure = document.getElementById("treasure");
const chest = document.getElementById("chest");
const outfitLayer = document.getElementById("outfitLayer");
const victoryModal = document.getElementById("victoryModal");
const orderInfo = document.getElementById("orderInfo");
const difficultyInfo = document.getElementById("difficultyInfo");


let speechTypewriterTimer = null;
let lastSpeechText = "";


function setSpeech(text) {
  const nextText = typeof text === "string" ? text : String(text ?? "");

  if (speechTypewriterTimer) {
    window.clearInterval(speechTypewriterTimer);
    speechTypewriterTimer = null;
  }

  // Only animate when the speech text changes.
  if (nextText === lastSpeechText) {
    if (speech) speech.textContent = nextText;
    if (yellowBubbleText) yellowBubbleText.textContent = nextText;
    return;
  }

  lastSpeechText = nextText;

  if (speech) speech.textContent = "";
  if (yellowBubbleText) yellowBubbleText.textContent = "";

  let index = 0;
  const stepMs = 24;

  speechTypewriterTimer = window.setInterval(() => {
    index += 1;
    const partial = nextText.slice(0, index);

    if (speech) speech.textContent = partial;
    if (yellowBubbleText) yellowBubbleText.textContent = partial;

    if (index >= nextText.length) {
      window.clearInterval(speechTypewriterTimer);
      speechTypewriterTimer = null;
    }
  }, stepMs);
}

function createConfetti() {
  const colors = ["#ffd54f", "#ff7043", "#66bb6a", "#42a5f5", "#ab47bc"];
  for (let i = 0; i < 50; i++) {
    const confetti = document.createElement("div");
    confetti.className = "confetti";
    confetti.style.cssText = `
      left: ${Math.random() * 100}%;
      top: -10px;
      width: ${Math.random() * 10 + 5}px;
      height: ${Math.random() * 10 + 5}px;
      background: ${colors[Math.floor(Math.random() * colors.length)]};
      border-radius: ${Math.random() > 0.5 ? "50%" : "0"};
      animation: fall ${Math.random() * 3 + 2}s linear forwards;
    `;
    document.body.appendChild(confetti);
    setTimeout(() => confetti.remove(), 5000);
  }

  if (!document.getElementById("confetti-style")) {
    const style = document.createElement("style");
    style.id = "confetti-style";
    style.textContent = `
      @keyframes fall {
        to {
          transform: translateY(100vh) rotate(720deg);
          opacity: 0;
        }
      }
    `;
    document.head.appendChild(style);
  }
}

// 在新流程中，模式及等級會由主選單提供，
// 此函式只保留作後備使用。
function selectMode(mode) {
  gameState.mode = mode;
  if (difficultySelection) {
    difficultySelection.classList.remove("hidden");
  }
}

function startGame(difficulty) {
  gameState.difficulty = difficulty;
  gameState.selectedNumbers = [];
  gameState.nextIndex = 0;

  // 新版遊戲頁預設顯示遊戲區，無需在此控制主菜單顯示
  if (mainMenu) mainMenu.classList.add("hidden");
  if (gameArea) gameArea.classList.remove("hidden");

  // 生成數字
  const max = difficulty === "easy" ? 10 : 20;
  gameState.numbers = [];
  while (gameState.numbers.length < 5) {
    const n = Math.floor(Math.random() * max) + 1;
    if (!gameState.numbers.includes(n)) gameState.numbers.push(n);
  }

        // 設置 UI
  if (orderInfo) {
    if (gameState.mode === "ascending") {
      orderInfo.innerHTML = "👉 由 <b>小 → 大</b> 排列 (左邊最小)";
    } else {
      orderInfo.innerHTML = "👈 由 <b>大 → 小</b> 排列 (右邊最大)";
    }
  }

  if (difficultyInfo) {
    difficultyInfo.innerHTML =
      difficulty === "easy" ? "⭐ 等級一 (1-10)" : "⭐⭐ 等級二 (1-20)";
  }

  renderNumbers();
  renderSlots();
  if (result) result.textContent = "";

  updateStumpsLayout();

  setSpeech("👋 請依序拉數字到空格 😊");
  updateBottomModeArrowLayout();
  updateBottomModeArrowDirection();
}



function ensureCloudTileFloatStyles() {
  if (document.getElementById("cloud-tile-float-style")) return;
  const style = document.createElement("style");
  style.id = "cloud-tile-float-style";
  style.textContent = `
    @keyframes cloudTileFloat {
      0%, 100% {
        /* keep anchored at crate centre (same as base .num transform) */
        transform: translate(-50%, -100%) translate(0, 0);
      }
      25% {
        transform: translate(-50%, -100%) translate(5px, -5px);
      }
      50% {
        transform: translate(-50%, -100%) translate(0, 5px);
      }
      75% {
        transform: translate(-50%, -100%) translate(-5px, -5px);
      }
    }
    .num.cloud-tile-floating {
      animation-name: cloudTileFloat;
      animation-timing-function: ease-in-out;
      animation-iteration-count: infinite;
      animation-direction: alternate;
    }
    .num.cloud-tile-floating.dragging {
      /* stop floating while dragging and keep base anchoring */
      animation: none !important;
      transform: translate(-50%, -100%) !important;
    }
  `;
  document.head.appendChild(style);
}

// Failsafe helper: animate a numbered cloud when a wrong placement
// happens on a slot. The cloud is pulled to the slot centre, tinted
// with the monochrome filter, shakes left/right for 2 seconds, then
// pops back to its original crate and resumes the subtle floating.
function playCloudErrorOnSlot(sourceTile, slot) {
  if (!sourceTile || !slot) return;

  // Cancel any previous failsafe shake still attached to this tile.
  if (sourceTile._errorShakeAnimation) {
    try {
      sourceTile._errorShakeAnimation.cancel();
    } catch (e) {
      // ignore cancellation issues on stale animations
    }
    sourceTile._errorShakeAnimation = null;
  }

  // Stop the subtle floating while the error animation plays.
  sourceTile.classList.remove("cloud-tile-floating");
  const slotRect = slot.getBoundingClientRect();
  const slotCenterX = slotRect.left + slotRect.width / 2;
  const slotCenterY = slotRect.top + slotRect.height / 2;

  const tileRect = sourceTile.getBoundingClientRect();
  const tileHeight = tileRect.height || 0;

  // Base .num transform uses translate(-50%, -100%), so inline top
  // corresponds to the visual bottom of the cloud tile. To align the
  // tile centre with the slot centre, we offset top by half the tile
  // height.
  const desiredLeft = slotCenterX;
  const desiredTop = slotCenterY + tileHeight / 2;

  sourceTile.style.left = `${desiredLeft}px`;
  sourceTile.style.top = `${desiredTop}px`;
  sourceTile.style.pointerEvents = "none";

  // Ensure we are not fighting the drag state or any previous
  // transform animation when starting the error shake.
  // Removing "dragging" here avoids the drag scale transform
  // from cancelling out the shake animation on subsequent tiles.
  sourceTile.classList.remove("dragging");

  // Normalise the base transform so every error animation starts
  // from the same translate(-50%, -100%) anchor, regardless of any
  // prior inline transforms set during dragging/floating.
  sourceTile.style.transform = "translate(-50%, -100%)";
  // Apply error tint to the cloud artwork only, keeping the digit visible.
  sourceTile.classList.add("num-error-on-slot");
  // Instant shake feedback via Web Animations API.
  if (typeof sourceTile.animate === "function") {
    sourceTile._errorShakeAnimation = sourceTile.animate(
      [
        { transform: "translate(-50%, -100%) translateX(0)" },
        { transform: "translate(-50%, -100%) translateX(-24px)" },
        { transform: "translate(-50%, -100%) translateX(24px)" },
        { transform: "translate(-50%, -100%) translateX(-24px)" },
        { transform: "translate(-50%, -100%) translateX(24px)" },
        { transform: "translate(-50%, -100%) translateX(0)" },
      ],
      {
        duration: 1000,
        iterations: 6,
        easing: "ease-in-out",
        fill: "none",
      }
    );
  }


  const animationDurationMs = 2000;

  const resetTileState = () => {
    if (!sourceTile || !sourceTile.isConnected) return;
    sourceTile.classList.remove("num-error-on-slot");

    if (sourceTile._errorShakeAnimation) {
      try {
        sourceTile._errorShakeAnimation.cancel();
      } catch (e) {
        // ignore cancellation issues on stale animations
      }
      sourceTile._errorShakeAnimation = null;
    }

    sourceTile.style.transform = "translate(-50%, -100%)";
    sourceTile.classList.remove("num-error-on-slot");
      // Re-anchor the tile to its home crate without triggering
      // further layout side effects or animations.
    updateNumberTilePositions();

    // Guard against overlapping bounce/error animations by
    // cancelling any previous bounce and float state first.
    // NOTE: a "bounce-back" pop animation used to run here
    // (class `bounce-back` plus a 600ms timeout). It has been
    // temporarily disabled to keep error timing simple and
    // avoid extra delays when the cloud returns home.
    sourceTile.classList.remove("bounce-back");
    sourceTile.classList.remove("cloud-tile-floating");
    sourceTile.style.pointerEvents = "auto";

    // Immediately resume the subtle floating animation only
    // if the tile is still part of the pool.
    if (sourceTile.dataset.role === "pool") {
      // Resume floating immediately instead of waiting for the original
      // random positive animation-delay.
      sourceTile.style.animationDelay = "0s";
      sourceTile.classList.add("cloud-tile-floating");
    }
  };

  setTimeout(resetTileState, animationDurationMs);
}



function renderNumbers() {

  if (!numbersBox) return;

  const baseImg = images.crate;
  const tileScale = 0.2; // main cloud size

  const baseImgReady =
    baseImg && baseImg.complete && baseImg.naturalWidth && baseImg.naturalHeight;

  // If the image is still loading, wait for it before building the tiles.
  // This avoids measuring the cloud size from an empty image state.
  if (baseImg && !baseImgReady) {
    if (!baseImg._renderNumbersListenerAttached) {
      baseImg._renderNumbersListenerAttached = true;

      const rerenderNumbers = () => {
        baseImg._renderNumbersListenerAttached = false;
        renderNumbers();
      };

      baseImg.addEventListener("load", rerenderNumbers, { once: true });
      baseImg.addEventListener(
        "error",
        () => {
          baseImg._renderNumbersListenerAttached = false;
          renderNumbers();
        },
        { once: true }
      );
    }

    if (!baseImg.complete) {
      return;
    }
  }

  // Fallback size in case the image fails to load
  let tileWidth = 64;
  let tileHeight = 64;

  if (baseImgReady) {
    tileWidth = baseImg.naturalWidth * tileScale;
    tileHeight = baseImg.naturalHeight * tileScale;
  }

  numbersBox.innerHTML = "";

  ensureCloudTileFloatStyles();

  const shuffled = [...gameState.numbers].sort(() => Math.random() - 0.5);

  shuffled.forEach((num) => {
    const container = document.createElement("div");
    container.className = "num";
    container.draggable = false;
    container.dataset.value = String(num);
    container.dataset.role = "pool";

    // Ensure number tiles always stay above the canvas and other overlays
    // so they remain draggable and tappable.
    container.style.position = "absolute";
    container.style.zIndex = "500";
    container.style.width = `${tileWidth}px`;
    container.style.height = `${tileHeight}px`;
    container.style.background = "transparent";
    container.style.border = "none";

    // Cloud image (visual only)

    // Blurred glow image behind the main cloud to simulate a soft glow
    const glowImg = document.createElement("img");
    glowImg.src = baseImg && baseImg.src ? baseImg.src : "cloud_yellow.png";
    glowImg.alt = "";
    glowImg.className = "num-cloud-glow";

    // Glow slightly larger than the main cloud; if we know the natural size,
    // keep the ratio 0.26 : 0.225, otherwise approximate with 1.15×
    const glowFactor = baseImg && baseImg.naturalWidth && baseImg.naturalHeight
      ? (0.26 / tileScale)
      : 1.15;

    const glowWidth = tileWidth * glowFactor;
    const glowHeight = tileHeight * glowFactor;
    glowImg.style.width = `${glowWidth}px`;
    glowImg.style.height = `${glowHeight}px`;
    container.appendChild(glowImg);

    const img = document.createElement("img");
    img.src = baseImg && baseImg.src ? baseImg.src : "./cloud_yellow.png";
    img.alt = "Number cloud";
    img.className = "num-cloud-image";
    container.appendChild(img);

    // Number label (no pointer events, sits above centre of cloud)
    const label = document.createElement("div");
    label.className = "num-label";
    label.textContent = String(num);
    if (String(num).length >= 2) {
      label.classList.add("two-digit");
    }
    label.style.background = "transparent";
    container.appendChild(label);

    container.classList.add("cloud-tile-floating");

    // Randomise float timing so each cloud moves differently while
    // staying within the same ±5px box.
    container.style.animationDuration = `${5 + Math.random() * 4}s`;
    container.style.animationDelay = `${Math.random() * 5}s`;
    container.style.animationDirection =
      Math.random() < 0.5 ? "alternate" : "alternate-reverse";

    addNumberEventListeners(container);


    numbersBox.appendChild(container);
  });

  updateNumberTilePositions();
}




let activePointerId = null;
let pointerOffsetX = 0;
let pointerOffsetY = 0;

function handlePointerDownOnNumber(e) {
  e.preventDefault();
  const target = e.currentTarget;

  gameState.draggedElement = target;
  gameState.draggedValue = target.dataset.value;

  const rect = target.getBoundingClientRect();

  // NOTE:
  // .num tiles use transform: translate(-50%, -100%), so the inline
  // left/top correspond to the *bottom centre* of the cloud tile.
  // If we calculate offsets from the visual centre, the anchor
  // point used when updating left/top won't match and the tile
  // appears to "lag" behind the cursor vertically.
  //
  // Instead, treat the bottom centre as the logical anchor while
  // dragging so the cursor stays glued to the same visual point.
  const anchorX = rect.left + rect.width / 2;
  const anchorY = rect.bottom;

  pointerOffsetX = e.clientX - anchorX;
  pointerOffsetY = e.clientY - anchorY;

  activePointerId = e.pointerId;

  if (target.setPointerCapture) {
    target.setPointerCapture(activePointerId);
  }

  target.classList.add("dragging");
}

function handlePointerMoveOnNumber(e) {
  if (!gameState.draggedElement || e.pointerId !== activePointerId) return;
  e.preventDefault();

  const target = gameState.draggedElement;

  // Reconstruct the anchored bottom-centre position from the
  // current pointer location and the initial offset captured at
  // pointerdown.
  const anchorX = e.clientX - pointerOffsetX;
  const anchorY = e.clientY - pointerOffsetY;

  target.style.left = `${anchorX}px`;
  target.style.top = `${anchorY}px`;

    const slots = document.querySelectorAll(".slot");
  slots.forEach((slot) => {
    const rect = slot.getBoundingClientRect();
    const within =
      e.clientX >= rect.left &&
      e.clientX <= rect.right &&
      e.clientY >= rect.top &&
      e.clientY <= rect.bottom;

    const wrapper = slot.closest(".slot-wrapper");

    if (within) {
      if (!slot.classList.contains("highlight")) {
        slot.classList.add("highlight");
      }
      if (wrapper && !wrapper.classList.contains("highlight")) {
        wrapper.classList.add("highlight");
      }
    } else {
      if (slot.classList.contains("highlight")) {
        slot.classList.remove("highlight");
      }
      if (wrapper && wrapper.classList.contains("highlight")) {
        wrapper.classList.remove("highlight");
      }
    }
  });
}



function handlePointerUpOnNumber(e) {
  if (!gameState.draggedElement || e.pointerId !== activePointerId) return;
  e.preventDefault();

  const target = gameState.draggedElement;

  let placed = false;
  let errorAnimationTriggered = false;

    const highlightedSlot = document.querySelector(".slot.highlight");
  if (highlightedSlot && gameState.draggedValue !== null) {
    const slotIndex = parseInt(highlightedSlot.dataset.index, 10);
    const expectedSlotIndex =
      gameState.mode === "ascending"
        ? gameState.nextIndex
        : 4 - gameState.nextIndex;
    if (slotIndex !== expectedSlotIndex) {
      setSpeech("請依序填答案 💪");
      playAudioById('sfxPlaceWrong');
      playSlotErrorAnimation(highlightedSlot, 500);

      if (target) {
        playCloudErrorOnSlot(target, highlightedSlot);
        errorAnimationTriggered = true;
      }
    } else if (highlightedSlot.textContent.trim() !== "") {
      playAudioById('sfxPlaceWrong');
      setSpeech("這個空格已經有數字啦！");
    } else {
      setSlotValue(
        highlightedSlot,
        gameState.draggedValue,
        gameState.draggedElement
      );
      placed = true;
    }
  }


  document.querySelectorAll(".slot").forEach((slot) => {
    slot.classList.remove("highlight");
    const wrapper = slot.closest(".slot-wrapper");
    if (wrapper) {
      wrapper.classList.remove("highlight");
    }
  });


  // If we didn't place the tile into a slot, and no error animation
  // is currently running, snap it back to its home cloud.
  if (!placed && !errorAnimationTriggered) {
    updateNumberTilePositions();
  }

  target.classList.remove("dragging");

  if (target.releasePointerCapture && activePointerId != null) {
    try {
      target.releasePointerCapture(activePointerId);
    } catch (e) {
      // ignore
    }
  }

  gameState.draggedValue = null;
  gameState.draggedElement = null;
  activePointerId = null;
}



function addNumberEventListeners(div) {
  if (window.PointerEvent) {
    div.addEventListener("pointerdown", handlePointerDownOnNumber);
    div.addEventListener("pointermove", handlePointerMoveOnNumber);
    div.addEventListener("pointerup", handlePointerUpOnNumber);
    div.addEventListener("pointercancel", handlePointerUpOnNumber);
  } else {
    div.addEventListener("dragstart", handleDragStart);
    div.addEventListener("dragend", handleDragEnd);
    div.addEventListener("touchstart", handleTouchStart, { passive: false });
    div.addEventListener("touchmove", handleTouchMove, { passive: false });
    div.addEventListener("touchend", handleTouchEnd);
  }
}


function renderSlots() {
  if (!slotsBox) return;
  slotsBox.innerHTML = "";

  for (let i = 0; i < 5; i++) {
    const wrapper = document.createElement("div");
    wrapper.className = "slot-wrapper";

                // Cloud image target (replaces spinning cubes and stumps)
        const cloudImg = document.createElement("img");
    cloudImg.src = "./cloud_number_dotted.png";
    cloudImg.alt = "Cloud target";
    cloudImg.className = "slot-cloud-image";


    // Transparent drop-target overlay, centered over the cloud image.
    const frontFace = document.createElement("div");

    frontFace.className =
      "slot flex items-center justify-center text-3xl md:text-4xl font-bold text-gray-100";
    frontFace.dataset.index = String(i);
    frontFace.style.position = "absolute";
    frontFace.style.left = "50%";
    frontFace.style.top = "50%";
    frontFace.style.transform = "translate(-50%, -50%)";
    frontFace.style.transformOrigin = "50% 50%";

    // Keep the drop hitbox matched to the standardized cloud wrapper size.
    const adjustCloudSize = () => {
      const wrapperRect = wrapper.getBoundingClientRect();
      if (!wrapperRect.width || !wrapperRect.height) return;

      // Cloud image follows wrapper size via CSS (100% x 100%).
      // Ensure hitbox matches the exact rendered slot bounds.
      frontFace.style.width = `${wrapperRect.width}px`;
      frontFace.style.height = `${wrapperRect.height}px`;

      // Keep the bottom mode arrow matched to the slot span.
      updateBottomModeArrowLayout();
    };

    // Recompute hitbox size when the image load completes.
    cloudImg.addEventListener("load", adjustCloudSize, { once: true });



    wrapper.appendChild(cloudImg);
    addSlotEventListeners(frontFace);
    wrapper.appendChild(frontFace);



    slotsBox.appendChild(wrapper);

    // Recompute after insertion so wrapper has real layout dimensions,
    // including the cached-image path where `load` may have already fired.
    requestAnimationFrame(adjustCloudSize);

    if (cloudImg.complete && cloudImg.naturalWidth > 0) {
      requestAnimationFrame(adjustCloudSize);
    }
  }

  updateGateOverlays();
  updateBottomModeArrowLayout();
  updateBottomModeArrowDirection();
}





// 根據模式及下一個應填格仔，更新柵欄狀態
function updateGateOverlays() {
  if (!slotsBox) return;

  const slots = slotsBox.querySelectorAll(".slot");
  const totalSlots = 5;

  // 所有格仔已填滿時，隱藏所有柵欄
  if (gameState.nextIndex >= totalSlots) {
    slots.forEach((slot) => {
      const wrapper = slot.parentElement;
      if (!wrapper) return;
      const gate = wrapper.querySelector(".slot-gate-image");
      if (gate) gate.classList.add("hidden");
    });
    return;
  }

  const expectedSlotIndex =
    gameState.mode === "ascending"
      ? gameState.nextIndex
      : totalSlots - 1 - gameState.nextIndex;

  slots.forEach((slot) => {
    const wrapper = slot.parentElement;
    if (!wrapper) return;

    const gate = wrapper.querySelector(".slot-gate-image");
    if (!gate) return;

    const slotIndex = parseInt(slot.dataset.index, 10);
    const isFilled =
      slot.classList.contains("filled") && slot.textContent.trim() !== "";

    if (!isFilled && slotIndex !== expectedSlotIndex) {
      gate.classList.remove("hidden");
    } else {
      gate.classList.add("hidden");
    }
  });
}

function addSlotEventListeners(slot) {
  slot.addEventListener("dragover", handleDragOver);
  slot.addEventListener("dragenter", handleDragEnter);
  slot.addEventListener("dragleave", handleDragLeave);
  slot.addEventListener("drop", handleDrop);
}

// Play the "shake" error animation centred on the spinning cube.
function playSlotErrorAnimation(slot, durationMs) {
  const cube = slot.closest(".slot-cube");
  const duration = typeof durationMs === "number" ? durationMs : 500;

  slot.classList.add("error");
  if (cube) {
    cube.classList.add("error");
  }

  setTimeout(() => {
    slot.classList.remove("error");
    if (cube) {
      cube.classList.remove("error");
    }
  }, duration);
}

function handleDragStart(e) {

  gameState.draggedValue = e.target.dataset.value;
  gameState.draggedElement = e.target;
  e.target.classList.add("dragging");
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = "move";
  }
}

function handleDragEnd(e) {
  e.target.classList.remove("dragging");
  document.querySelectorAll(".slot").forEach((slot) => {
    slot.classList.remove("highlight");
    const wrapper = slot.closest(".slot-wrapper");
    if (wrapper) {
      wrapper.classList.remove("highlight");
    }
  });
}


function handleDragOver(e) {
  e.preventDefault();
  if (e.dataTransfer) {
    e.dataTransfer.dropEffect = "move";
  }
}

function handleDragEnter(e) {
  const target = e.target;
  if (target.classList.contains("slot")) {
    target.classList.add("highlight");
    const wrapper = target.closest(".slot-wrapper");
    if (wrapper) {
      wrapper.classList.add("highlight");
    }
  }
}

function handleDragLeave(e) {
  const target = e.target;
  if (target.classList.contains("slot")) {
    target.classList.remove("highlight");
    const wrapper = target.closest(".slot-wrapper");
    if (wrapper) {
      wrapper.classList.remove("highlight");
    }
  }
}


function handleDrop(e) {
  e.preventDefault();
    const slot = e.target.closest(".slot");
  if (!slot) return;

  slot.classList.remove("highlight");
  const wrapper = slot.closest(".slot-wrapper");
  if (wrapper) {
    wrapper.classList.remove("highlight");
  }


  const slotIndex = parseInt(slot.dataset.index, 10);
  const expectedSlotIndex =
    gameState.mode === "ascending"
      ? gameState.nextIndex
      : 4 - gameState.nextIndex;

    if (slotIndex !== expectedSlotIndex) {
      setSpeech("請依序填答案。目標空格不在這裏喔！ 💪");
      playAudioById('sfxPlaceWrong');
      playSlotErrorAnimation(slot, 500);
    
    if (gameState.draggedElement) {
      playCloudErrorOnSlot(gameState.draggedElement, slot);
    }
    return;
  }



  if (slot.textContent.trim() !== "") {
    setSpeech("這個空格已經有數字啦！");
    return;
  }

    if (gameState.draggedValue !== null) {
    setSlotValue(slot, gameState.draggedValue, gameState.draggedElement);

    gameState.draggedValue = null;
    gameState.draggedElement = null;
  }
}

function setSlotValue(slot, value, sourceTile) {
  slot.textContent = value;
  // Never show the number text inside the dotted cloud frame; it is
  // only used for logic. Keep the frame visually empty.
  slot.style.opacity = "0";
  slot.classList.add("filled");
  slot.dataset.value = value;

  // Remember which number tile supplied this value so we can either

  // return it to its original position (on error) or remove it (on success).
  if (sourceTile) {
    slot._sourceTile = sourceTile;
    sourceTile.style.opacity = "0";
    sourceTile.style.pointerEvents = "none";
  } else {
    slot._sourceTile = null;
  }

    gameState.selectedNumbers.push(parseInt(value, 10));
  gameState.nextIndex++;

  // Immediately validate the placement so the error shake
  // starts as soon as the cloud reaches the slot centre.
  // (Previously this was delayed by 300ms via setTimeout.)
  checkDigitRealTime(slot, value);
}

function checkDigitRealTime(slot, value) {
  const index = parseInt(slot.dataset.index, 10);
  const numericValue = parseInt(value, 10);

  const isValid = validatePlacement(index, numericValue);

  if (!isValid) {
    setSpeech("請依序填答案 💪");
    playAudioById('sfxPlaceWrong');
    playSlotErrorAnimation(slot, 500);

    const sourceTile = slot._sourceTile;

    if (sourceTile) {
      sourceTile.style.opacity = "1";
      playCloudErrorOnSlot(sourceTile, slot);
    }

    const animationDurationMs = 2000;

    setTimeout(() => {
      slot.textContent = "";
      slot.classList.remove("filled");
      slot.removeAttribute("data-value");

      gameState.selectedNumbers.pop();
      gameState.nextIndex--;

      slot._sourceTile = null;

      setSpeech("再試一次 💪");
      updateGateOverlays();
      updateCubesProgression();
    }, animationDurationMs);
  } else {




    setSpeech("👍 非常好！繼續加油！");

    // On success, permanently remove the source number tile so it
    // does not reappear in the pool.
    const sourceTile = slot._sourceTile;

    if (sourceTile && sourceTile.parentNode) {
      sourceTile.parentNode.removeChild(sourceTile);
    }
    slot._sourceTile = null;

        // Update cube visuals to show the placed number on all faces
    updateCubeFacesWithValue(slot, numericValue);

    // Hide the visible number tile after 3 seconds (keep logic intact)
    slot.style.opacity = "0";

    // Compute stump position in canvas coordinates and trigger success effect

        if (canvas) {
      const canvasRect = canvas.getBoundingClientRect();

      // Use the slot (front face overlay) center as the pineapple origin.
      // This element is perfectly aligned with the spinning cube center.
      const slotRect = slot.getBoundingClientRect();
      const slotCenterX = slotRect.left + slotRect.width / 2;
      const slotCenterY = slotRect.top + slotRect.height / 2;

            const fx = slotCenterX - canvasRect.left;
      const fy = slotCenterY - canvasRect.top;

            const wrapper = slot.closest(".slot-wrapper");
      const stumpImg = wrapper
        ? wrapper.querySelector(".slot-stump-image")
        : null;

      // Hide the dotted slot cloud image once the number has been
      // correctly placed, since the popping numbered cloud is
      // drawn on the canvas instead.
      if (wrapper) {
        const dottedCloud = wrapper.querySelector(".slot-cloud-image");
        if (dottedCloud) {
          dottedCloud.style.opacity = "0";
        }
      }



      let checkX;
      let checkY;

      if (stumpImg) {
        // Checkmark at stump bottom-right corner
        const stumpRect = stumpImg.getBoundingClientRect();
        const stumpBottomRightX = stumpRect.right;
        const stumpBottomRightY = stumpRect.bottom;
        checkX = stumpBottomRightX - canvasRect.left;
        checkY = stumpBottomRightY - canvasRect.top;
      }

            // Pineapple rest offset: 20% of stump height (fallback 40px)
      const restOffset = stumpImg
        ? -stumpImg.getBoundingClientRect().height * 0.25
        : 40;

      // Spawn a main success cloud at the slot centre (canvas layer),
      // which will expand outwards with a bounce and then stay.
      successSlotClouds.push({
        x: fx,
        y: fy,
        value: numericValue,
        startTime: performance.now(),
        duration: 800,
      });



      playSuccessEffect(fx, fy, numericValue, restOffset, checkX, checkY);

    }

    // Remove / hide the floating cube for this stump once the smoke appears.
    const cube = slot.closest(".slot-cube");
    if (cube) {
      const spinner = cube.querySelector(".slot-cube-spinner");
      if (spinner) {
        spinner.style.display = "none";
      }
    }

    updateGateOverlays();

    updateCubesProgression();

    if (gameState.nextIndex === 5) {
      setTimeout(() => {
        completeGame();
      }, 500);
    }
  }
}





function completeGame() {
  if (result) {
    result.innerHTML =
      '<span class="text-3xl text-green-600">🎉 任務完成！</span>';
  }
  setSpeech("😄 恭喜！");

  document.querySelectorAll(".num").forEach((num) => {
    num.style.pointerEvents = "none";
    num.classList.add("opacity-50");
  });

    // At end-game, the bear celebrates and the victory modal shows.

  setTimeout(() => {
    playAudioById('sfxCorrectHappy');
    document.getElementById("menuArrow").style.display = "none";
    document.getElementById("pineappleBearImage").src = "./pineapple_bear_win.png";
    document.getElementById("pineappleBearImage").style.zIndex = "10000";
    createConfetti();
    showVictoryModal();
  }, 500);
}



// 觸摸處理
let touchClone = null;

function handleTouchStart(e) {
  e.preventDefault();
  const touch = e.touches[0];
    gameState.draggedElement = e.target;
  gameState.draggedValue = e.target.dataset.value;

  touchClone = gameState.draggedElement.cloneNode(true);
  touchClone.dataset.role = "clone";
  touchClone.style.position = "fixed";

  touchClone.style.zIndex = "1000";
  touchClone.style.pointerEvents = "none";
  touchClone.style.opacity = "0.8";
  touchClone.style.transform = "scale(1.1)";
  document.body.appendChild(touchClone);

  updateTouchClonePosition(touch);
  gameState.draggedElement.classList.add("dragging");
}

function handleTouchMove(e) {
  e.preventDefault();
  const touch = e.touches[0];
  updateTouchClonePosition(touch);

    const slots = document.querySelectorAll(".slot");
  slots.forEach((slot) => {
    const rect = slot.getBoundingClientRect();
    const within =
      touch.clientX >= rect.left &&
      touch.clientX <= rect.right &&
      touch.clientY >= rect.top &&
      touch.clientY <= rect.bottom;

    const wrapper = slot.closest(".slot-wrapper");

    if (within) {
      if (!slot.classList.contains("highlight")) {
        slot.classList.add("highlight");
      }
      if (wrapper && !wrapper.classList.contains("highlight")) {
        wrapper.classList.add("highlight");
      }
    } else {
      if (slot.classList.contains("highlight")) {
        slot.classList.remove("highlight");
      }
      if (wrapper && wrapper.classList.contains("highlight")) {
        wrapper.classList.remove("highlight");
      }
    }
  });
}


function handleTouchEnd(e) {
  if (touchClone) {
    touchClone.remove();
    touchClone = null;
  }

  if (gameState.draggedElement) {
    gameState.draggedElement.classList.remove("dragging");
  }

    const highlightedSlot = document.querySelector(".slot.highlight");
  if (highlightedSlot && gameState.draggedValue !== null) {
    const slotIndex = parseInt(highlightedSlot.dataset.index, 10);
    const expectedSlotIndex =
      gameState.mode === "ascending"
        ? gameState.nextIndex
        : 4 - gameState.nextIndex;

    if (slotIndex !== expectedSlotIndex) {
      setSpeech("請依序填答案 💪");
      playSlotErrorAnimation(highlightedSlot, 500);

      if (gameState.draggedElement) {
        playCloudErrorOnSlot(gameState.draggedElement, highlightedSlot);
      }
    } else if (highlightedSlot.textContent.trim() !== "") {

      setSpeech("這個空格已經有數字啦！");
    } else {
      setSlotValue(highlightedSlot, gameState.draggedValue, gameState.draggedElement);
    }

    highlightedSlot.classList.remove("highlight");
    const highlightedWrapper = highlightedSlot.closest(".slot-wrapper");
    if (highlightedWrapper) {
      highlightedWrapper.classList.remove("highlight");
    }
  }

  document.querySelectorAll(".slot").forEach((slot) => {
    slot.classList.remove("highlight");
    const wrapper = slot.closest(".slot-wrapper");
    if (wrapper) {
      wrapper.classList.remove("highlight");
    }
  });


  gameState.draggedValue = null;
  gameState.draggedElement = null;
}

function updateTouchClonePosition(touch) {
  if (touchClone) {
    touchClone.style.left = `${touch.clientX - 40}px`;
    touchClone.style.top = `${touch.clientY - 40}px`;
  }
}

function showVictoryModal() {
  if (victoryModal) {
    victoryModal.classList.remove("hidden");
  }
}

function returnToMenu() {
  const targetUrl = new URL("menu.html", window.location.href);

  setTimeout(() => {
    window.location.href = targetUrl.toString(); // 永遠做完整重載
  }, 1200);
}

function closeVictoryModal() {
  const targetUrl = new URL("menu.html", window.location.href);

  setTimeout(() => {
    window.location.href = targetUrl.toString(); // 永遠做完整重載
  }, 1200);
}

function updateBottomModeArrowDirection() {
  const rightArrow = document.getElementById("bottomArrowRight");
  const leftArrow = document.getElementById("bottomArrowLeft");
  if (!rightArrow || !leftArrow) return;

  const mode = (gameState && gameState.mode) || "ascending";
  if (mode === "descending") {
    rightArrow.classList.add("hidden");
    leftArrow.classList.remove("hidden");
  } else {
    leftArrow.classList.add("hidden");
    rightArrow.classList.remove("hidden");
  }
}

function updateBottomModeArrowLayout() {
  const strip = document.getElementById("bottomModeArrowStrip");
  if (!strip || !slotsBox) return;

  const wrappers = Array.from(slotsBox.querySelectorAll(".slot-wrapper"));
  if (!wrappers.length) {
    strip.style.width = "0";
    return;
  }

  const rects = wrappers
    .map((wrapper) => wrapper.getBoundingClientRect())
    .filter((rect) => rect.width > 0 && rect.height > 0);
  if (!rects.length) {
    strip.style.width = "0";
    return;
  }

  const left = Math.min(...rects.map((rect) => rect.left));
  const right = Math.max(...rects.map((rect) => rect.right));
  const bottom = Math.max(...rects.map((rect) => rect.bottom));
  const slotHeight = Math.max(...rects.map((rect) => rect.height));
  const arrowHeight = Math.max(28, Math.min(52, slotHeight * 0.4));
  const arrowTop = Math.min(window.innerHeight - arrowHeight - 8, bottom + 12);

  strip.style.left = `${left}px`;
  strip.style.top = `${arrowTop}px`;
  strip.style.width = `${Math.max(0, right - left)}px`;
  strip.style.height = `${arrowHeight}px`;
}

function playAudioById(id) {
  const el = document.getElementById(id);
  if (!el) return;
  try {
    el.currentTime = 0;
    el.play();
  } catch (_) {}
}

// 由主選單已選配置自動初始化遊戲


window.onload = function(){
  
  /*if(!window.location.hash) {
      window.location = window.location + '#loaded';
      window.location.reload(true);
  }*/

  var mode = null;
  var level = null;

  // 1️⃣ 優先由 URL 查詢參數讀取設定（stateless，每次載入都重新決定）
  try {
    var searchParams = new URLSearchParams(window.location.search || "");
    var urlMode = searchParams.get("mode");
    var urlLevel = searchParams.get("level");
    if (urlMode) mode = urlMode;
    if (urlLevel) level = urlLevel;
  } catch (e) {
    // 忽略 URL 解析錯誤，改用下一層後備
  }

  // 2️⃣ 如果容器提供 getSelectedGameConfig()，亦會作為後備
  if (!mode || !level) {
    if (typeof window.getSelectedGameConfig === "function") {
      var cfg = window.getSelectedGameConfig();
      if (cfg) {
        if (!mode && cfg.mode) mode = cfg.mode;
        if (!level && cfg.level) level = cfg.level;
      }
    }
  }

  // 3️⃣ 最後後備：兼容舊版 window.selectedGameConfig
  if (!mode || !level) {
    var legacyCfg = window.selectedGameConfig;
    if (legacyCfg) {
      if (!mode && legacyCfg.mode) mode = legacyCfg.mode;
      if (!level && legacyCfg.level) level = legacyCfg.level;
    }
  }

  // 4️⃣ 預設值，確保遊戲總能啟動
  if (!mode) {
    mode = "ascending";
  }
  if (!level) {
    level = "easy";
  }
  gameState.mode = mode;
  startGame(level);
}
/*(function initGameFromMenu() {


  var mode = null;
  var level = null;

  // 1️⃣ 優先由 URL 查詢參數讀取設定（stateless，每次載入都重新決定）
  try {
    var searchParams = new URLSearchParams(window.location.search || "");
    var urlMode = searchParams.get("mode");
    var urlLevel = searchParams.get("level");
    if (urlMode) mode = urlMode;
    if (urlLevel) level = urlLevel;
  } catch (e) {
    // 忽略 URL 解析錯誤，改用下一層後備
  }

  // 2️⃣ 如果容器提供 getSelectedGameConfig()，亦會作為後備
  if (!mode || !level) {
    if (typeof window.getSelectedGameConfig === "function") {
      var cfg = window.getSelectedGameConfig();
      if (cfg) {
        if (!mode && cfg.mode) mode = cfg.mode;
        if (!level && cfg.level) level = cfg.level;
      }
    }
  }

  // 3️⃣ 最後後備：兼容舊版 window.selectedGameConfig
  if (!mode || !level) {
    var legacyCfg = window.selectedGameConfig;
    if (legacyCfg) {
      if (!mode && legacyCfg.mode) mode = legacyCfg.mode;
      if (!level && legacyCfg.level) level = legacyCfg.level;
    }
  }

  // 4️⃣ 預設值，確保遊戲總能啟動
  if (!mode) {
    mode = "ascending";
  }
  if (!level) {
    level = "easy";
  }
  gameState.mode = mode;
  startGame(level);
})();*/







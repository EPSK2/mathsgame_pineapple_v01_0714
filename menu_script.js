// ======================= 2.5D Jungle Canvas =======================

const canvas = document.getElementById("gameCanvas");
const ctx = canvas ? canvas.getContext("2d") : null;

function resizeCanvas() {
  if (!canvas) return;
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}

resizeCanvas();
window.addEventListener("resize", () => {
  resizeCanvas();
  initTrees();
  initParticles();
  if (typeof sunshineEffect !== "undefined" && sunshineEffect) {
    sunshineEffect.handleResize();
  }
});

// Image assets
const images = {
  jungleBg: new Image(),
  tree: new Image(),
  leaf: new Image(),
  tallTree: new Image(),
};

// Use provided assets
images.jungleBg.src = "./grass.png";
images.tree.src = "./tree.png";
images.leaf.src = "./leaf.png";
images.tallTree.src = "./tall_tree.png";

const layers = {
  deepBackground: { image: images.jungleBg, blur: 0.5 },
  distantTrees: [],
  mainPlayAreaTrees: [],
  foregroundTrees: [],
  particles: [],
  sideTrees: { left: null, right: null },
};

const particleConfigs = {
  numLeavesAmbient: 50,
  numLeavesTreePerSide: 50,
  numLeavesSky: 25,
  minLeafSize: 20,
  maxLeafSize: 40,
  windFrequency: 0.005,
};

const treeSwayConfig = {
  frequency: 0.0006, 
  amplitude: 10,
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
    return { baseX: x, bottomY: groundY, scale, layer, swayPhase: Math.random() * Math.PI * 2 };
  }
  /*
  // Layer 2: Distant swaying trees
  const distantCount = 8;
  for (let i = 0; i < distantCount; i++) {
    const x = ((i + 1) / (distantCount + 1)) * canvas.width;
    const scale = 0.4 + Math.random() * 0.2; 
    layers.distantTrees.push(createTree(x, scale, 2));
  }

  // Layer 3: Main trees
  const mainCount = 5;
  for (let i = 0; i < mainCount; i++) {
    const x = ((i + 1) / (mainCount + 1)) * canvas.width;
    const jitter = (Math.random() - 0.5) * 40;
    layers.mainPlayAreaTrees.push(createTree(x + jitter, 1, 3));
  }

  // Layer 4: Close foreground trees
  layers.foregroundTrees.push(
    createTree(canvas.width * 0.08, 1.5, 4),
    createTree(canvas.width * 0.92, 1.6, 4)
  );
  */
  // Side tall trees
  const tallImg = images.tallTree;
  if (tallImg && tallImg.complete && tallImg.naturalHeight > 0) {
    const desiredHeight = canvas.height;
    const scaleTall = desiredHeight / tallImg.naturalHeight;
    const tallWidth = tallImg.naturalWidth * scaleTall;
    const tallHeight = desiredHeight;

    layers.sideTrees.left = { x: -tallWidth / 2, y: canvas.height - tallHeight, width: tallWidth, height: tallHeight };
    layers.sideTrees.right = { x: canvas.width - tallWidth / 2, y: canvas.height - tallHeight, width: tallWidth, height: tallHeight };
  } else {
    layers.sideTrees.left = null;
    layers.sideTrees.right = null;
  }
}

const particleConfig = {
  maxActiveLeaves: particleConfigs.numLeavesAmbient + particleConfigs.numLeavesTreePerSide * 2 + particleConfigs.numLeavesSky,
  minSize: particleConfigs.minLeafSize,
  maxSize: particleConfigs.maxLeafSize,
  baseSpeed: 0.8,
  maxExtraSpeed: 1.6,
  windFrequency: particleConfigs.windFrequency,
  windAmplitude: 25,
  spawnChanceTreePerFrame: 0.08, 
  spawnChanceSkyPerFrame: 0.04, 
};

function createLeaf(sourceType) {
  const zDepth = Math.random(); 
  const size = particleConfig.minSize + Math.random() * (particleConfig.maxSize - particleConfig.minSize);
  let spawnX = Math.random() * canvas.width;
  let spawnY = -size; 

  if (sourceType === "tree") {
    const tallTrees = [];
    if (layers.sideTrees.left) tallTrees.push(layers.sideTrees.left);
    if (layers.sideTrees.right) tallTrees.push(layers.sideTrees.right);

    if (tallTrees.length > 0) {
      const tree = tallTrees[Math.floor(Math.random() * tallTrees.length)];
      const startY = tree.y + tree.height * 0.3;
      const endY = tree.y + tree.height * 0.5;
      spawnX = tree.x + Math.random() * tree.width;
      spawnY = startY + Math.random() * (endY - startY);
    } else if (layers.mainPlayAreaTrees.length > 0 && images.tree.complete) {
      const tree = layers.mainPlayAreaTrees[Math.floor(Math.random() * layers.mainPlayAreaTrees.length)];
      const treeWidth = images.tree.width * tree.scale;
      const treeHeight = images.tree.height * tree.scale;
      const xLeft = tree.baseX - treeWidth / 2;
      const yTop = tree.bottomY - treeHeight;
      const canopyStart = yTop;
      const canopyEnd = yTop + treeHeight * 0.3;
      spawnX = xLeft + Math.random() * treeWidth;
      spawnY = canopyStart + Math.random() * (canopyEnd - canopyStart);
    } else {
      spawnX = Math.random() * canvas.width;
      spawnY = Math.random() * (canvas.height * 0.3);
    }
  } else if (sourceType === "sky") {
    spawnX = Math.random() * canvas.width;
    spawnY = -Math.random() * (canvas.height * 0.2);
  }

  const mass = 0.4 + Math.random() * 0.2; 
  const rho = 1.0; 
  const Cd_base = 1.0 + Math.random() * 0.3; 
  const initialSpeedDown = 40 + Math.random() * 40; 
  const vx = (Math.random() - 0.5) * 40; 
  const vy = initialSpeedDown;
  const angle = Math.random() * Math.PI * 2; 
  const angularVel = (Math.random() - 0.5) * 1.0; 

  return { type: sourceType, x: spawnX, y: spawnY, vx, vy, angle, angularVel, mass, size, rho, Cd_base, zDepth };
}

function initParticles() { layers.particles.length = 0; }

function spawnLeaves(time) {
  const activeTreeLeaves = layers.particles.filter(leaf => leaf.type === "tree");
  if (activeTreeLeaves.length < particleConfigs.numLeavesAmbient + particleConfigs.numLeavesTreePerSide * 2 && Math.random() < particleConfig.spawnChanceTreePerFrame) {
    layers.particles.push(createLeaf("tree"));
  }
  const activeSkyLeaves = layers.particles.filter(leaf => leaf.type === "sky");
  if (activeSkyLeaves.length < particleConfigs.numLeavesSky && Math.random() < particleConfig.spawnChanceSkyPerFrame) {
    layers.particles.push(createLeaf("sky"));
  }
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
  const swayFrequency = (options && options.frequency) || treeSwayConfig.frequency;
  const swayAmplitude = (options && options.amplitude) || treeSwayConfig.amplitude;

  let drawX = tree.baseX;
  if (sway) {
    drawX += Math.sin(time * swayFrequency + tree.swayPhase) * swayAmplitude;
  }

  const treeWidth = images.tree.width * tree.scale;
  const treeHeight = images.tree.height * tree.scale;
  const x = drawX - treeWidth / 2;
  const y = tree.bottomY - treeHeight;

  ctx.save();
  let filterStr = options.blur ? `blur(${options.blur}px)` : `blur(${1}px)`;
  
  // Apply both blur (if applicable) and the new brightness filter
  if (options.sway) { // This identifies the distant trees layer
    filterStr += " brightness(65%)";
  }else{
    filterStr += " brightness(80%)";
  }
  ctx.filter = filterStr || "none";
  
  ctx.drawImage(images.tree, x, y, treeWidth, treeHeight);
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
  layers.distantTrees.forEach((tree) => { drawTree(tree, { blur: 1.5, tintColor: "rgba(40, 80, 120, 0.5)", sway: true, frequency: 0.0004, amplitude: 6 }, time); });
  layers.mainPlayAreaTrees.forEach((tree) => { drawTree(tree, { blur: 0, tintColor: null, sway: false }, time); });
  layers.foregroundTrees.forEach((tree) => { drawTree(tree, { blur: 3.5, tintColor: null, sway: false }, time); });
  drawTallSideTrees();
}

function drawAndUpdateParticles(time) {
  if (!ctx || !images.leaf.complete) return;

  const dt = 1 / 60; 
  const GRAVITY = 500; 
  const FORCE_SCALE = 0.00002; 
  const VORTEX_SCALE = 5; 

  function normalizeAngle(a) { return ((a + Math.PI) % (Math.PI * 2)) - Math.PI; }
  const leaves = layers.particles;

  for (let i = leaves.length - 1; i >= 0; i--) {
    const leaf = leaves[i];

    let vx = leaf.vx || 0;
    let vy = leaf.vy || 0;
    const v2 = vx * vx + vy * vy;
    const v = Math.sqrt(v2);

    let ax = 0;
    let ay = GRAVITY; 
    let angle = leaf.angle || 0;
    let angularVel = leaf.angularVel || 0;

    if (v > 0.01) {
      const velAngle = Math.atan2(vy, vx);
      const alpha = normalizeAngle(velAngle - angle);
      const sinAlpha = Math.sin(alpha);
      const Cd = leaf.Cd_base * (1 + 2 * sinAlpha * sinAlpha);
      const A = leaf.size * leaf.size * Math.abs(Math.cos(alpha)) + leaf.size * 0.15 * Math.abs(Math.sin(alpha));
      const rho = leaf.rho || 1.0;

      const dragMag = 0.5 * rho * Cd * A * v2 * FORCE_SCALE;
      const dragFx = (-vx / v) * dragMag;
      const dragFy = (-vy / v) * dragMag;

      const liftMag = dragMag * 0.25; 
      const liftFx = (-vy / v) * liftMag;
      const liftFy = (vx / v) * liftMag;

      let fx = dragFx + liftFx;
      let fy = dragFy + liftFy;
      fx += (Math.random() - 0.5) * VORTEX_SCALE;

      ax += fx / leaf.mass;
      ay += fy / leaf.mass;

      const I = (leaf.mass * leaf.size * leaf.size) / 12; 
      const alpha_ang = (0.01 * v2 * Math.sin(2 * alpha)) / I;
      angularVel += alpha_ang * dt;
    }

    vx += ax * dt;
    vy += ay * dt;
    leaf.x += vx * dt;
    leaf.y += vy * dt;
    leaf.vx = vx;
    leaf.vy = vy;
    leaf.angularVel = angularVel;
    leaf.angle += leaf.angularVel * dt;

    const blur = leaf.zDepth < 0.2 || leaf.zDepth > 0.8 ? 2.5 : 0;
    ctx.save();
    ctx.filter = blur ? `blur(${blur}px)` : "none";
    ctx.translate(leaf.x, leaf.y);
    ctx.rotate(leaf.angle);
    ctx.drawImage(images.leaf, -leaf.size / 2, -leaf.size / 2, leaf.size, leaf.size);
    ctx.restore();

    if (leaf.y > canvas.height + 100 || leaf.x < -100 || leaf.x > canvas.width + 100) {
      leaves.splice(i, 1);
    }
  }
}

// Sunshine ray effect overlay
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
    this.layers = [
      { radiusScale: 1.2, beamCount: 40, baseAlpha: 0.18, noiseScale: 0.0008, speed: 0.00004 },
      { radiusScale: 1.4, beamCount: 30, baseAlpha: 0.12, noiseScale: 0.0012, speed: 0.00007 },
      { radiusScale: 1.6, beamCount: 20, baseAlpha: 0.08, noiseScale: 0.0016, speed: 0.0001 },
    ];
  }

  handleResize() {
    const w = this.canvas.width;
    const h = this.canvas.height;
    this.lightSource.x = w * 0.8;
    this.lightSource.y = -h * 0.1;
    this.maxRadius = Math.sqrt(w * w + h * h) * 1.2;
  }

  noise2D(x, y, time) {
    const n1 = Math.sin(x * 0.0007 + time * 0.0013) * Math.cos(y * 0.0004 + time * 0.0011);
    const n2 = Math.sin(x * 0.0003 + time * 0.0009) * Math.cos(y * 0.0006 + time * 0.0017);
    return 0.5 + 0.5 * (0.6 * n1 + 0.4 * n2);
  }

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
    ctx.globalCompositeOperation = "screen";

    const flicker = 0.7 + 0.3 * this.noise1D(this.noiseTime * 0.8);

    this.layers.forEach((layer, index) => {
      const radius = this.maxRadius * layer.radiusScale;
      const beamCount = layer.beamCount;
      const baseAlpha = layer.baseAlpha;

      for (let i = 0; i < beamCount; i++) {
        const angle = (i / beamCount) * Math.PI + this.noiseTime * layer.speed + index * 0.12;
        const startX = this.lightSource.x;
        const startY = this.lightSource.y;
        const endX = startX + Math.cos(angle) * radius;
        const endY = startY + Math.sin(angle) * radius;

        const segments = 12;
        for (let s = 0; s < segments; s++) {
          const t = s / segments;
          const px = startX + (endX - startX) * t;
          const py = startY + (endY - startY) * t;

          const fade = 1 - t;
          const localNoise = this.noise2D(
            px + index * 50,
            py - index * 80,
            this.noiseTime * (1 + index * 0.25)
          );

          const alpha = baseAlpha * fade * localNoise * flicker;
          if (alpha <= 0.001) continue;

          const thickness = 60 * (1 - t) * (0.5 + localNoise) * (1 + index * 0.2);
          const grad = ctx.createRadialGradient(px, py, 0, px, py, thickness);
          grad.addColorStop(0, `rgba(255, 255, 220, ${alpha})`);
          grad.addColorStop(1, "rgba(255, 255, 220, 0)");

          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.ellipse(px, py, thickness, thickness * 0.35, angle, 0, Math.PI * 2);
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
  return new SunshineEffect(canvasElement);
}

function gameLoop(timestamp) {
  if (!ctx || !canvas) return;
  const time = timestamp || performance.now();

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawDeepBackground();
  drawTrees(time);
  spawnLeaves(time);
  drawAndUpdateParticles(time);
  
  if (sunshineEffect) {
    sunshineEffect.render(time);
  }
  requestAnimationFrame(gameLoop);
}

const requiredAssetKeys = ["jungleBg", "tree", "leaf", "tallTree"];
const loadedAssets = new Set();

function onAssetReady(assetKey) {
  if (loadedAssets.has(assetKey)) return;
  loadedAssets.add(assetKey);

  if (loadedAssets.size === requiredAssetKeys.length) {
    initTrees();
    initParticles();
    sunshineEffect = initSunshineEffect(canvas);
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

// ======================= Menu Interaction Logic =======================

const speech = document.getElementById("speech");
const difficultySelection = document.getElementById("difficultySelection");
let menuConfig = { mode: null, level: null };

function setSpeech(text) {
  if (speech) {
    speech.innerHTML = text;
  }
}

function selectMode(mode) {
  menuConfig.mode = mode;
  
  // 顯示難度選單
  if (difficultySelection) {
    difficultySelection.classList.remove("hidden");
  }

  // 根據選擇更新對話
  if (mode === "ascending") {
    setSpeech("👉 由 <b>小 → 大</b> 排列！<br/>而家請選擇難度啦！");
  } else {
    setSpeech("👈 由 <b>大 → 小</b> 排列！<br/>而家請選擇難度啦！");
  }
}

// 替換整個 startGame 函數為以下版本（強制重載 game.html）
function startGame(difficulty) {
  menuConfig.level = difficulty;

  const params = new URLSearchParams({
    mode: menuConfig.mode || "ascending",
    level: difficulty || "easy",
  });

  // 永遠用完整 URL，確保在 /sandbox/ 下正常工作
  const targetUrl = new URL("game.html", window.location.href);
  targetUrl.search = params.toString();

  // 如不再需要，可刪除這行
  window.selectedGameConfig = { ...menuConfig };

  setTimeout(() => {
    window.location.href = targetUrl.toString(); // 永遠做完整重載
  }, 1200);
}

// ======================= Dialog System =======================

// Simple sound helpers for dialog
let nextPageAudio = null;
let selectAudio = null;

function playNextPageSound() {
  try {
    if (!nextPageAudio) {
      nextPageAudio = new Audio("next_page_sound.mp3");
    }
    nextPageAudio.currentTime = 0;
    nextPageAudio.play().catch(() => {});
  } catch (e) {
    console.error("Failed to play next page sound", e);
  }
}

function playSelectSound() {
  try {
    if (!selectAudio) {
      selectAudio = new Audio("select_sound.mp3");
    }
    selectAudio.currentTime = 0;
    selectAudio.play().catch(() => {});
  } catch (e) {
    console.error("Failed to play select sound", e);
  }
}

// ======================= Tutorial Overlay & Window =======================
let isTutorialOpen = false;

let tutorialOverlay = null;
let tutorialWindow = null;
let tutorialContent = null;
let tutorialPrevButton = null;
let tutorialNextButton = null;
let tutorialFinishButton = null;
let tutorialPageIndicator = null;
let tutorialCloseButton = null;
let currentTutorialPage = 0;

// Developers: put tutorial page HTML content here.
// Each entry is injected as innerHTML into the main tutorial content area.
const tutorialPages = [
  `
    <div style="display: flex; flex-direction: column; align-items: center; gap: 0.75rem;">
      <img style="width: 700px; height: auto;" src="ins01.png">
      <div class="text-4xl leading-tight text-gray-700 whitespace-pre-line">
        遊戲場地內有 <b>5</b> 朵雲，印著不同的數字。
      </div>
    </div>
  `,
  `
    <div style="display: flex; flex-direction: column; align-items: center; gap: 0.1rem;">
      <img style="width: 700px; height: auto;" src="ins02.png">
      <div class="text-4xl leading-relaxed text-gray-700 whitespace-pre-line">
        如果箭頭指向 <span class="text-6xl">右 ➡➡➡</span>，
        就需要把數字從從 <span class="text-3xl">小</span> 到 <span class="text-6xl">大</span> 排列。
      </div>
    </div>
  `,
  `
    <div style="display: flex; flex-direction: column; align-items: center; gap: 0.1rem;">
      <img style="width: 700px; height: auto;" src="ins03.png">
      <div class="text-4xl leading-relaxed text-gray-700 whitespace-pre-line">
        如果箭頭指向 <span class="text-6xl">左 ⬅⬅⬅</span>，
        就需要把數字從從 <span class="text-6xl">大</span> 到 <span class="text-3xl">小</span> 排列。
      </div>
    </div>
  `,
  `
    <div style="display: flex; flex-direction: column; align-items: center; gap: 0.1rem;">
      <video src="ins04.webm" muted loop autoplay style="width: 50%;"></video>
      <div class="text-4xl leading-relaxed text-gray-700 whitespace-pre-line">用手指/滑鼠按緊雲朵，拉動，再放到正確位置上！</div>
    </div>
  `,
];

function initTutorialUI() {
  tutorialOverlay = document.getElementById("tutorialOverlay");
  tutorialWindow = document.getElementById("tutorialWindow");
  tutorialContent = document.getElementById("tutorialContent");
  tutorialPrevButton = document.getElementById("tutorialPrevButton");
  tutorialNextButton = document.getElementById("tutorialNextButton");
  tutorialFinishButton = document.getElementById("tutorialFinishButton");
  tutorialPageIndicator = document.getElementById("tutorialPageIndicator");
  tutorialCloseButton = document.getElementById("tutorialCloseButton");

  if (
    !tutorialOverlay ||
    !tutorialWindow ||
    !tutorialContent ||
    !tutorialPrevButton ||
    !tutorialNextButton ||
    !tutorialFinishButton ||
    !tutorialPageIndicator ||
    !tutorialCloseButton
  ) {
    return;
  }

  // 阻止點擊遮罩穿透到底層
  tutorialOverlay.addEventListener("click", (event) => {
    event.stopPropagation();
    event.preventDefault();
  });

  const handleClose = (event) => {
    event.stopPropagation();
    event.preventDefault();
    closeTutorial();
  };

  tutorialCloseButton.addEventListener("click", handleClose);
  tutorialFinishButton.addEventListener("click", handleClose);

  tutorialPrevButton.addEventListener("click", (event) => {
    event.stopPropagation();
    event.preventDefault();
    if (currentTutorialPage > 0) {
      currentTutorialPage -= 1;
      renderTutorialPage();
    }
  });

  tutorialNextButton.addEventListener("click", (event) => {
    event.stopPropagation();
    event.preventDefault();
    if (currentTutorialPage < tutorialPages.length - 1) {
      currentTutorialPage += 1;
      renderTutorialPage();
    }
  });
}

function openTutorial(startPage = 0) {
  if (
    !tutorialOverlay ||
    !tutorialWindow ||
    !tutorialContent ||
    !tutorialPageIndicator
  ) {
    return;
  }

  isTutorialOpen = true;
  // Always start from first page (do not remember last visit)
  currentTutorialPage = 0;

  tutorialOverlay.classList.remove("hidden");
  tutorialWindow.classList.remove("hidden");
  renderTutorialPage();
}

function closeTutorial() {
  isTutorialOpen = false;
  if (tutorialOverlay) {
    tutorialOverlay.classList.add("hidden");
  }
  if (tutorialWindow) {
    tutorialWindow.classList.add("hidden");
  }
}

function renderTutorialPage() {
  if (!tutorialContent || !tutorialPageIndicator) return;

  const total = tutorialPages.length || 1;
  if (currentTutorialPage < 0) currentTutorialPage = 0;
  if (currentTutorialPage > total - 1) currentTutorialPage = total - 1;

  tutorialContent.innerHTML = tutorialPages[currentTutorialPage] || "";

  tutorialPageIndicator.textContent = `第 ${currentTutorialPage + 1}/${total} 頁`;

  if (tutorialPrevButton) {
    if (currentTutorialPage === 0) {
      tutorialPrevButton.disabled = true;
      tutorialPrevButton.classList.add("opacity-50", "pointer-events-none");
    } else {
      tutorialPrevButton.disabled = false;
      tutorialPrevButton.classList.remove("opacity-50", "pointer-events-none");
    }
  }

  if (tutorialNextButton && tutorialFinishButton) {
    if (currentTutorialPage === total - 1) {
      tutorialNextButton.classList.add("hidden");
      tutorialFinishButton.classList.remove("hidden");
    } else {
      tutorialNextButton.classList.remove("hidden");
      tutorialFinishButton.classList.add("hidden");
    }
  }
}

class DialogManager {

  constructor(options) {
    this.infoBox = options.infoBox;
    this.speakerLabelContainer = options.speakerLabelContainer || null;
    this.speakerLabel = options.speakerLabel || null;
    this.dialogContent = options.dialogContent;
    this.script = [];
    this.currentIndex = -1;
    this.isActive = false;
    this.isTransitioning = false;
    this.globalClickHandler = this.handleGlobalClick.bind(this);
  }

  loadScript(scriptArray) {
    this.script = Array.isArray(scriptArray) ? scriptArray : [];
    this.currentIndex = -1;
  }

    start() {
    if (!this.infoBox || !this.dialogContent || !this.script.length) return;
    this.isActive = true;
    this.isTransitioning = false;
    // ensure dialogContent starts visible but we control opacity
    this.dialogContent.style.opacity = "0";
    window.addEventListener("click", this.globalClickHandler);
    this.next(true); // first node, fade-in only
  }

  stop() {
    this.isActive = false;
    window.removeEventListener("click", this.globalClickHandler);
  }

    handleGlobalClick(event) {
    if (!this.isActive || this.isTransitioning) return;

    // 如果教學視窗正在顯示，阻止對話框響應點擊
    if (typeof isTutorialOpen !== "undefined" && isTutorialOpen) {
      event.stopPropagation();
      event.preventDefault();
      return;
    }

    const node = this.script[this.currentIndex];

    if (!node) return;

    if (node.type === "TextFinal") return;

    if (node.type === "Choice") {
      // While waiting for a choice, block other interactions but do not advance
      const isChoiceButton =
        event.target &&
        event.target.closest &&
        event.target.closest(".dialog-choice-button");
      if (!isChoiceButton) {
        event.stopPropagation();
        event.preventDefault();
      }
      return;
        }

    // Text node: any click advances
    if (node.type === "Text" && node.Event && typeof window[node.Event] === "function") {
      try {
        window[node.Event](node);
      } catch (err) {
        console.error("Error running dialog event handler on leave", node.Event, err);
      }
    }

    event.stopPropagation();
    event.preventDefault();
    this.next();
  }

  next(isFirst = false) {
    if (this.isTransitioning) return;

    const proceedToNext = () => {
      this.currentIndex += 1;
      if (this.currentIndex >= this.script.length) {
        this.stop();
        document.dispatchEvent(new CustomEvent("dialogSequenceCompleted"));
        return;
      }
      const node = this.script[this.currentIndex];
      this.renderNode(node);

      // fade in
      requestAnimationFrame(() => {
        this.dialogContent.style.opacity = "1";
        setTimeout(() => {
          this.isTransitioning = false;
        }, 250);
      });
    };

    this.isTransitioning = true;

    if (isFirst) {
      // first node: no fade-out, only fade-in
      proceedToNext();
    } else {
      // fade out then change content
      this.dialogContent.style.opacity = "0";
      setTimeout(proceedToNext, 250);
    }
  }

  clearContent() {
    if (!this.dialogContent) return;
    while (this.dialogContent.firstChild) {
      this.dialogContent.removeChild(this.dialogContent.firstChild);
    }
  }

  setSpeaker(name) {
    if (!this.speakerLabelContainer || !this.speakerLabel) return;
    if (!name) {
      this.speakerLabelContainer.style.display = "none";
    } else {
      this.speakerLabelContainer.style.display = "";
      this.speakerLabel.textContent = name;
    }
  }

  renderNode(node) {
    if (!node) return;
    this.clearContent();

    if (node.type === "Text" || node.type === "TextFinal") {
      this.setSpeaker(node.Speaker || "");
      const textEl = document.createElement("div");
      textEl.className = "dialog-standard-text";
      textEl.textContent = node.Content || "";
      this.dialogContent.appendChild(textEl);
      if(node.type === "Text"){
        const continueHintEl = document.createElement("div");
        continueHintEl.className = "dialog-continue-hint";
        continueHintEl.textContent = "（點擊任何地方繼續）";
        this.dialogContent.appendChild(continueHintEl);
      }
    } else if (node.type === "Choice") {
      this.setSpeaker("");

      const questionEl = document.createElement("div");
      questionEl.className = "dialog-standard-text";
      questionEl.textContent = node.Question || "";
      this.dialogContent.appendChild(questionEl);


            const answersWrapper = document.createElement("div");
      answersWrapper.className = "flex flex-row flex-wrap items-center justify-center gap-4 mt-6";


      const answers = Array.isArray(node.AnswerArr) ? node.AnswerArr : [];
      const expectedCount =
        typeof node.AnswerNo === "number" ? node.AnswerNo : answers.length;
      const count = Math.min(expectedCount, answers.length);

                        for (let i = 0; i < count; i++) {
        const answerText = answers[i];
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "dialog-choice-button pushable-button";


        const frontSpan = document.createElement("span");
        frontSpan.className = "front";
        frontSpan.textContent = answerText;
        btn.appendChild(frontSpan);

        btn.addEventListener("click", (event) => {
          event.stopPropagation();
          event.preventDefault();

          // Visually mark selection immediately (change background color only)
          frontSpan.style.backgroundColor = "#d6cdb7";

          // Play select sound effect on choice at the moment of click
          if (typeof playSelectSound === "function") {
            playSelectSound();
          }

          const detail = {
            node,
            answerIndex: i,
            answerText,
          };
          document.dispatchEvent(
            new CustomEvent("dialogChoiceSelected", { detail })
          );

                    // Wait 1 second before advancing to the next dialog node
          this.isTransitioning = true; // block other clicks while we wait
          setTimeout(() => {
            // allow next() to proceed, it will manage isTransitioning for fade
            this.isTransitioning = false;
            this.next();
          }, 1000);

        });

        answersWrapper.appendChild(btn);
      }


      this.dialogContent.appendChild(answersWrapper);
    }
  }
}

let dialogManager = null;

function startMenuDialogSystem() {
  const infoBox = document.getElementById("infoBox");
  const speakerLabelContainer = document.getElementById("speakerLabelContainer");
  const speakerLabel = document.getElementById("speakerLabel");
  const dialogContent = document.getElementById("dialogContent");

  if (!infoBox || !dialogContent) return;

  dialogManager = new DialogManager({
    infoBox,
    speakerLabelContainer,
    speakerLabel,
    dialogContent,
  });

  // Example dialog script; you can replace this with your own JSON array
  const introDialogScript = [
        {
      type: "Text",
      Speaker: "菠蘿熊",
      Content: "水果熊朋友，你好呀！\n\n我是菠蘿熊，歡迎你來到這裏。",
      Event: "playNextPageSound",
    },
    /*{
      type: "Text",
      Speaker: "菠蘿島-啊波",
      Content: "聽村長說，你主動來幫忙趕走數字魔王，真的感謝你！",
      Event: "playNextPageSound",
    },
    {
      type: "Text",
      Speaker: "菠蘿島-啊波",
      Content: "容許我講講背景：\n\n我們島下一周就會舉辦菠蘿節，\n農夫伯伯會分享香甜菠蘿給大家吃！",
      Event: "playNextPageSound",
    },
    {
      type: "Text",
      Speaker: "菠蘿島-啊波",
      Content: "但魔王把我們的菠蘿全變成了硬硬的箱子，\n還説如果不能把他們排好順序，就不能品嘗美味的菠蘿了！",
      Event: "playNextPageSound",
    },
    {
      type: "Text",
      Speaker: "菠蘿島-啊波",
      Content: "我們導游又不懂數學，小兄弟你能試一試嗎？",
      Event: "playNextPageSound",
    },*/
    {
      type: "Choice",
      Question: "想知道任務內容嗎？",
      AnswerNo: 2,
      AnswerArr: ["好", "不用了，謝謝"],
    },
    {
      type: "Choice",
      Question: "你想怎樣排序呢？",
      AnswerNo: 2,
      AnswerArr: ["小 → 大", "大 → 小"],
    },
    {
      type: "Choice",
      Question: "選擇一個難度吧~",
      AnswerNo: 2,
      AnswerArr: ["⭐ 1-10", "⭐⭐ 1-20"],
    },
    {
      type: "TextFinal",
      Speaker: "菠蘿熊",
      Content: "水果熊，準備好了嗎？挑戰要開始啦！",
      Event: "playNextPageSound",
    },
  ];

  dialogManager.loadScript(introDialogScript);
  dialogManager.start();
}

// Example: handle dialog choices and map to mode/difficulty
// You can modify or remove this listener if you want to process choices elsewhere

document.addEventListener("dialogChoiceSelected", (event) => {
  const detail = event.detail;
  if (!detail || !detail.node) return;

  const { node, answerIndex, answerText } = detail;

    if (node.type === "Choice" && typeof node.Question === "string") {
    if (node.Question.includes("任務內容")) {
      // Tutorial: user wants to hear about the task instructions
      if (answerIndex === 0 && typeof openTutorial === "function") {
        openTutorial();
      }
    } else if (node.Question.includes("怎樣排序")) {
      // Mode selection
      menuConfig.mode = answerIndex === 0 ? "ascending" : "descending";
    } else if (node.Question.includes("難度")) {

      // Difficulty selection
      const difficulty = answerIndex === 0 ? "easy" : "hard";
      setTimeout(() => {
        startGame(difficulty);
      }, 2000);
      
    }
  }
});

// ======================= Title Animation =======================


//document.addEventListener("DOMContentLoaded", () => {
// 
window.onload = function() {

  /*if(!window.location.hash) {
      window.location = window.location + '#loaded';
      window.location.reload(true);
  }*/

  const title = document.getElementById("gameTitle");
  const runningBearVideo = document.getElementById("runningBearVideo");
  const animatedBearVideo = document.getElementById("animatedBearVideo");
  const menuContainer = document.getElementById("menu");
  const menuButtons = menuContainer
    ? Array.from(menuContainer.querySelectorAll(".menu-arrow"))
    : [];
  const infoBox = document.getElementById("infoBox");

  let bearCrossfadeStarted = false;
  const prepareAnimatedBearVideo = () => {
    if (!animatedBearVideo || animatedBearVideo.src) return;
    animatedBearVideo.src = "./animated_bear.webm";
    animatedBearVideo.load();
  };

  const startBearCrossfade = () => {
    if (bearCrossfadeStarted) return;
    bearCrossfadeStarted = true;

    runningBearVideo.style.opacity = "0";

    if (animatedBearVideo) {
      animatedBearVideo.style.visibility = "visible";
      animatedBearVideo.style.opacity = "0";
      animatedBearVideo.currentTime = 0;
      animatedBearVideo.play().catch(() => {});

      // Trigger opacity transition on next frame.
      requestAnimationFrame(() => {
        animatedBearVideo.style.opacity = "1";
      });
    }

    // Hide running bear after fade-out completes.
    setTimeout(() => {
      runningBearVideo.style.display = "none";
    }, 3000);
  };

  // 初始化教學視窗 DOM 與事件
  initTutorialUI();

  if (title) {

    // 初始狀態：隱藏並放在畫面上方
    title.style.opacity = "0";
    title.style.transform = "translateY(-100%)";

    // 1 秒後開始 3 秒由上而下的 ease-out 動畫
    setTimeout(() => {
      title.classList.add("fly-in-title");
    }, 1000);
  }

  // 設定影片來源與播放邏輯
  if (runningBearVideo) {
    let bearIntroStarted = false;
    const startBearIntro = () => {
      if (bearIntroStarted) return;
      bearIntroStarted = true;
      runningBearVideo.classList.add("bear-video-animate");

      const playPromise = runningBearVideo.play();
      if (playPromise && typeof playPromise.then === "function") {
        playPromise.catch(() => {
          // Ignore autoplay failures; video can start on later interaction.
        });
      }
    };

    runningBearVideo.src = "./running_bear.webm";
    runningBearVideo.addEventListener("loadeddata", startBearIntro, { once: true });
    runningBearVideo.addEventListener("canplay", startBearIntro, { once: true });

    // Cached-media path: start immediately when the element is already ready.
    if (runningBearVideo.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      startBearIntro();
    } else {
      runningBearVideo.load();
    }

    runningBearVideo.addEventListener("ended", () => {
      // Ensure loop bear is ready before starting fade-out to prevent blank gaps.
      if (
        animatedBearVideo &&
        animatedBearVideo.readyState < HTMLMediaElement.HAVE_CURRENT_DATA
      ) {
        const onAnimatedBearReady = () => {
          startBearCrossfade();
        };
        animatedBearVideo.addEventListener("canplay", onAnimatedBearReady, {
          once: true,
        });
        prepareAnimatedBearVideo();
      } else {
        startBearCrossfade();
      }

      // 跑步熊影片結束後，標題向下飛出畫面
      if (title) {
        title.classList.add("fly-out-title");
      }

            // 2 秒後（標題飛出完成），隱藏標題並滑出左側菜單標籤
      setTimeout(() => {
        if (title) {
          title.style.display = "none";
        }

        if (menuContainer) {
          menuContainer.classList.add("menu-visible");

          menuButtons.forEach((button, index) => {
            // 為每個標籤加入少許延遲，讓分離感更明顯
            button.style.transitionDelay = `${index * 0.15}s`;
            button.classList.add("menu-arrow-visible");
          });

          // 所有 menu-arrows 滑出後，淡入中央提示框
          if (infoBox && menuButtons.length > 0) {
                        const lastDelayMs = (menuButtons.length - 1) * 150; // 與上面 0.15s 對應
            const slideDurationMs = 1000; // .menu-arrow 的 transform transition 時長
            setTimeout(() => {
              infoBox.classList.remove("opacity-0", "pointer-events-none");
              infoBox.classList.add("opacity-100", "pointer-events-auto");

              // 中央透明提示框出現後，再啟動對話系統
              startMenuDialogSystem();
            }, lastDelayMs + slideDurationMs);
          }
        }
      }, 2000);

    });
  }

  if (animatedBearVideo) {
    // Preload the looping bear early so cross-fade can start immediately.
    animatedBearVideo.loop = true;
    animatedBearVideo.style.opacity = "0";
    animatedBearVideo.style.display = "block";
    animatedBearVideo.style.visibility = "hidden";
    prepareAnimatedBearVideo();
  }

  // 確保頁面載入時，左側菜單處於隱藏狀態
  if (menuContainer) {
    menuContainer.classList.remove("menu-visible");
  }
}
//});
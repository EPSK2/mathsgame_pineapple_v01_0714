// 遊戲狀態
let gameState = {
  numbers: [],
  mode: null,
  difficulty: null,
  selectedNumbers: [],
  nextIndex: 0,
  draggedValue: null,
  draggedElement: null
};

// 外套選項（目前未使用，但保留作擴充用）
const outfits = [
  { name: "🍌 香蕉熊外套", emoji: "🍌" },
  { name: "🍓 士多啤梨熊外套", emoji: "🍓" },
  { name: "🍉 西瓜熊外套", emoji: "🍉" },
  { name: "🍊 橙熊外套", emoji: "🍊" },
  { name: "🍇 提子熊外套", emoji: "🍇" },
  { name: "🍑 水蜜桃熊外套", emoji: "🍑" }
];

// DOM 元素
const mainMenu = document.getElementById("mainMenu");
const gameArea = document.getElementById("gameArea");
const difficultySelection = document.getElementById("difficultySelection");
const numbersBox = document.getElementById("numbers");
const slotsBox = document.getElementById("slots");
const speech = document.getElementById("speech");
const result = document.getElementById("result");
const taskText = document.getElementById("taskText");
const levelText = document.getElementById("levelText");
const treasure = document.getElementById("treasure");
const chest = document.getElementById("chest");
const outfitLayer = document.getElementById("outfitLayer");
const arrow1 = document.getElementById("arrow1");
const arrow2 = document.getElementById("arrow2");
const victoryModal = document.getElementById("victoryModal");

function setSpeech(text) {
  if (speech) {
    speech.innerHTML = text;
  }
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
  if (gameState.mode === "ascending") {
    if (arrow1) arrow1.classList.remove("hidden");
    if (arrow2) arrow2.classList.add("hidden");
    if (taskText)
      taskText.innerHTML = "👉 由 <b>小 → 大</b> 排列";
  } else {
    if (arrow1) arrow1.classList.add("hidden");
    if (arrow2) arrow2.classList.remove("hidden");
    if (taskText)
      taskText.innerHTML = "👈 由 <b>大 → 小</b> 排列（右邊最大）";
  }

  if (levelText) {
    levelText.innerHTML =
      difficulty === "easy" ? "⭐ 等級一 (1-10)" : "⭐⭐ 等級二 (1-20)";
  }

  renderNumbers();
  renderSlots();
  if (result) result.textContent = "";

  setSpeech("👋 依序拖拉數字到格仔啦！");
}

function renderNumbers() {
  if (!numbersBox) return;
  numbersBox.innerHTML = "";
  const shuffled = [...gameState.numbers].sort(() => Math.random() - 0.5);

  shuffled.forEach((num) => {
    const div = document.createElement("div");
    div.className =
      "num w-16 h-16 md:w-20 md:h-20 bg-gradient-to-b from-yellow-300 to-yellow-400 rounded-2xl flex items-center justify-center text-3xl md:text-4xl font-bold text-amber-800 shadow-lg";
    div.textContent = num;
    div.draggable = true;
    div.dataset.value = String(num);

    addNumberEventListeners(div);
    numbersBox.appendChild(div);
  });
}

function addNumberEventListeners(div) {
  div.addEventListener("dragstart", handleDragStart);
  div.addEventListener("dragend", handleDragEnd);
  div.addEventListener("touchstart", handleTouchStart, { passive: false });
  div.addEventListener("touchmove", handleTouchMove, { passive: false });
  div.addEventListener("touchend", handleTouchEnd);
}

function renderSlots() {
  if (!slotsBox) return;
  slotsBox.innerHTML = "";

  for (let i = 0; i < 5; i++) {
    const wrapper = document.createElement("div");
    wrapper.className = "slot-wrapper";

    const div = document.createElement("div");
    div.className =
      "slot w-16 h-16 md:w-20 md:h-20 rounded-2xl border-4 border-dashed border-blue-300 bg-white flex items-center justify-center text-3xl md:text-4xl font-bold text-gray-600";
    div.dataset.index = String(i);

    addSlotEventListeners(div);
    wrapper.appendChild(div);

    const gateImg = document.createElement("img");
    gateImg.src = "fence_gate.png";
    gateImg.alt = "Fence gate";
    gateImg.className = "slot-gate-image hidden";
    wrapper.appendChild(gateImg);

    slotsBox.appendChild(wrapper);
  }

  updateGateOverlays();
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
  }
}

function handleDragLeave(e) {
  const target = e.target;
  if (target.classList.contains("slot")) {
    target.classList.remove("highlight");
  }
}

function handleDrop(e) {
  e.preventDefault();
  const slot = e.target.closest(".slot");
  if (!slot) return;

  slot.classList.remove("highlight");

  const slotIndex = parseInt(slot.dataset.index, 10);
  const expectedSlotIndex =
    gameState.mode === "ascending"
      ? gameState.nextIndex
      : 4 - gameState.nextIndex;

  if (slotIndex !== expectedSlotIndex) {
    setSpeech("要依序填答案呀！");
    slot.classList.add("error");
    setTimeout(() => slot.classList.remove("error"), 500);
    return;
  }

  if (slot.textContent.trim() !== "") {
    setSpeech("呢個格仔已經有數字啦！");
    return;
  }

  if (gameState.draggedValue !== null) {
    setSlotValue(slot, gameState.draggedValue);

    if (gameState.draggedElement && gameState.draggedElement.parentNode) {
      gameState.draggedElement.parentNode.removeChild(gameState.draggedElement);
    }

    gameState.draggedValue = null;
    gameState.draggedElement = null;
  }
}

function setSlotValue(slot, value) {
  slot.textContent = value;
  slot.classList.add("filled");
  slot.classList.add("active-fill");
  slot.dataset.value = value;

  gameState.selectedNumbers.push(parseInt(value, 10));
  gameState.nextIndex++;

  document.querySelectorAll(".slot.active-fill").forEach((s) => {
    if (s !== slot) s.classList.remove("active-fill");
  });

  setTimeout(() => {
    checkDigitRealTime(slot, value);
  }, 300);
}

function checkDigitRealTime(slot, value) {
  let sorted = [...gameState.numbers];
  if (gameState.mode === "ascending") {
    sorted.sort((a, b) => a - b);
  } else {
    sorted.sort((a, b) => b - a);
  }

  const expectedSequence = sorted.slice(0, gameState.nextIndex);
  const expectedValue = expectedSequence[gameState.nextIndex - 1];

  if (parseInt(value, 10) !== expectedValue) {
    setSpeech("要依序填答案呀！");

    slot.classList.add("error");

    setTimeout(() => {
      slot.textContent = "";
      slot.classList.remove("filled", "active-fill", "error");
      slot.removeAttribute("data-value");

      gameState.selectedNumbers.pop();
      gameState.nextIndex--;

      const numDiv = document.createElement("div");
      numDiv.className =
        "num w-16 h-16 md:w-20 md:h-20 bg-gradient-to-b from-yellow-300 to-yellow-400 rounded-2xl flex items-center justify-center text-3xl md:text-4xl font-bold text-amber-800 shadow-lg bounce-back";
      numDiv.textContent = value;
      numDiv.draggable = true;
      numDiv.dataset.value = value;

      addNumberEventListeners(numDiv);
      if (numbersBox) numbersBox.appendChild(numDiv);

      setSpeech("👋 再試一次啦！");
      updateGateOverlays();
    }, 500);
  } else {
    setSpeech("👍 好嘢！繼續加油！");

    updateGateOverlays();

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
      '<span class="text-3xl text-green-600">🎉 做得好！</span>';
  }
  setSpeech("👍 好嘢！");

  document.querySelectorAll(".num").forEach((num) => {
    num.style.pointerEvents = "none";
    num.classList.add("opacity-50");
  });

  setTimeout(() => {
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
    if (
      touch.clientX >= rect.left &&
      touch.clientX <= rect.right &&
      touch.clientY >= rect.top &&
      touch.clientY <= rect.bottom
    ) {
      slot.classList.add("highlight");
    } else {
      slot.classList.remove("highlight");
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
      setSpeech("要依序填答案呀！");
      highlightedSlot.classList.add("error");
      setTimeout(() => highlightedSlot.classList.remove("error"), 500);
    } else if (highlightedSlot.textContent.trim() !== "") {
      setSpeech("呢個格仔已經有數字啦！");
    } else {
      setSlotValue(highlightedSlot, gameState.draggedValue);

      if (gameState.draggedElement && gameState.draggedElement.parentNode) {
        gameState.draggedElement.parentNode.removeChild(
          gameState.draggedElement
        );
      }
    }
    highlightedSlot.classList.remove("highlight");
  }

  document.querySelectorAll(".slot").forEach((slot) => {
    slot.classList.remove("highlight");
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

function closeVictoryModal() {
  if (typeof window.navigateToPage === "function") {
    // 使用 pp4 方法載回主選單（index.html 容器內）
    window.navigateToPage("menu.html", "Menu");
    return;
  }

  // 沒有 pp4 容器時，先關閉模態，再嘗試直接返回主選單頁面
  if (victoryModal) {
    victoryModal.classList.add("hidden");
  }

  try {
    // 直接載入 menu.html，確保「繼續玩」可以回到主選單
    window.location.href = "menu.html";
  } catch (e) {
    // 最後後備：重設遊戲畫面
    returnToMenu();
  }
}

function returnToMenu() {
  if (typeof window.navigateToPage === "function") {
    // 直接用 pp4 方法返主選單
    window.navigateToPage("menu.html", "Menu");
    return;
  }

  // 後備方案：只在獨立開啟 game.html 時使用
  if (gameArea) gameArea.classList.add("hidden");
  if (mainMenu) mainMenu.classList.remove("hidden");
  if (difficultySelection) difficultySelection.classList.add("hidden");

  gameState.mode = null;
  gameState.difficulty = null;
  gameState.selectedNumbers = [];
  gameState.nextIndex = 0;

  if (treasure) treasure.classList.add("hidden");
  if (chest) chest.classList.remove("open");
  if (outfitLayer) outfitLayer.innerHTML = "";
  if (result) result.textContent = "";
}

// 由主選單已選配置自動初始化遊戲
(function initGameFromMenu() {
  var mode = null;
  var level = null;

  if (typeof window.getSelectedGameConfig === "function") {
    var cfg = window.getSelectedGameConfig();
    mode = cfg && cfg.mode;
    level = cfg && cfg.level;
  }

  if (!mode) {
    mode = "ascending";
  }
  if (!level) {
    level = "easy";
  }

  gameState.mode = mode;
  startGame(level);
})();

const status = document.querySelector("[data-game-status]");
const toast = document.querySelector("#game-toast");
let gameState = { turns: 0 };

function resetGame(message = "ゲーム開始前です") {
  gameState = { turns: 0 };
  renderGame(message);
}

function renderGame(message) {
  status.textContent = message ?? `ゲーム固有の進行: ${gameState.turns}`;
}

function notify(message) {
  toast.textContent = message;
  toast.classList.add("is-visible");
  window.setTimeout(() => toast.classList.remove("is-visible"), 1800);
}

function registerPreset() {
  if (!window.GameFieldsPreset) {
    renderGame("Game Fields Previewから開いてください");
    return;
  }

  window.GameFieldsPreset.registerGame({
    start() {
      resetGame("ゲームを開始しました");
    },
    abort() {
      resetGame();
    },
    rematch() {
      resetGame("再戦の準備ができました");
    },
    autoProgress() {
      gameState.turns += 1;
      renderGame();
    },
    onStateChange(platformState, command) {
      document.documentElement.dataset.viewer = platformState.viewerId;
      document.documentElement.dataset.phase = platformState.phase;
      if (command) notify(`共通操作: ${command}`);
    },
  });
}

document.querySelector("[data-game-action=\"primary\"]")?.addEventListener("click", () => {
  gameState.turns += 1;
  renderGame();
});

window.addEventListener("DOMContentLoaded", registerPreset);

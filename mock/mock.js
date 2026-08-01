const status = document.querySelector("[data-game-status]");
const action = document.querySelector("[data-game-action=\"primary\"]");
const toast = document.querySelector("#game-toast");

function notify(message) {
  toast.textContent = message;
  toast.classList.add("is-visible");
  window.setTimeout(() => toast.classList.remove("is-visible"), 1800);
}

function render(snapshot) {
  const app = snapshot?.view?.app;
  const phase = snapshot?.phase ?? "loading";
  if (!app) {
    status.textContent = "Roomの同期を待っています";
    action.disabled = true;
    return;
  }
  status.textContent = phase === "result"
    ? `ゲーム終了: ${app.count} / ${app.target}`
    : phase === "playing"
      ? `ゲーム固有の進行: ${app.count} / ${app.target}`
      : "ゲーム開始前です";
  action.disabled = !app.canAdvance;
}

function connectRoom() {
  if (!window.GameFieldsRoom) {
    status.textContent = "Game Fields Roomから開いてください";
    action.disabled = true;
    return;
  }
  window.GameFieldsRoom.subscribe(render);
  action.addEventListener("click", async () => {
    action.disabled = true;
    try {
      await window.GameFieldsRoom.send({ type: "game/advance" });
    } catch (error) {
      notify(error instanceof Error ? error.message : "操作を完了できませんでした");
    }
  });
}

window.addEventListener("DOMContentLoaded", connectRoom);

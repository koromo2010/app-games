const status = document.querySelector("[data-game-status]");
const action = document.querySelector("[data-game-action=\"advance-count\"]");
const count = document.querySelector("[data-game-count]");
const target = document.querySelector("[data-game-target]");
const winner = document.querySelector(".winner-banner");
const toast = document.querySelector("#game-toast");
const reset = document.querySelector("[data-game-action=\"reset-count\"]");

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
  count.textContent = String(app.count);
  target.textContent = String(app.target);
  winner.hidden = phase !== "result";
  action.disabled = !app.canAdvance;
}

function connectRoom() {
  if (!window.GameFieldsRoom) {
    render({
      phase: "playing",
      view: { app: { count: 2, target: 3, canAdvance: true } },
    });
    action.addEventListener("click", () => {
      render({
        phase: "result",
        view: { app: { count: 3, target: 3, canAdvance: false } },
      });
      notify("カウントが3になり、勝敗が確定しました");
    });
    reset.addEventListener("click", () => render({
      phase: "playing",
      view: { app: { count: 2, target: 3, canAdvance: true } },
    }));
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

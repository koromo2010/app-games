const screens = [...document.querySelectorAll("[data-screen]")];
const title = document.querySelector("#page-title");
const toast = document.querySelector("#toast");
const titles = { lobby: "ゲーム広場", entry: "ゲーム入口", room: "新しいゲーム" };

// Game Fields Previewが参加者・デバッグ・視点・中断を提供する。
// ここにはゲーム固有状態だけを登録する。
window.addEventListener("DOMContentLoaded", () => {
  window.GameFieldsPreset?.registerGame({
    start() { notify("ゲームを開始しました"); },
    abort() { notify("ゲーム固有状態を初期化しました"); },
    rematch() { notify("同じ部屋でもう一度遊べます"); },
    autoProgress() { notify("ゲーム固有の自動進行を実行しました"); }
  });
});

function route(name) {
  screens.forEach((screen) => screen.classList.toggle("is-active", screen.dataset.screen === name));
  title.textContent = titles[name] || "Game Fields";
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function notify(message) {
  toast.textContent = message;
  toast.classList.add("is-visible");
  window.setTimeout(() => toast.classList.remove("is-visible"), 1800);
}

document.addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (!button) return;
  if (button.dataset.route) route(button.dataset.route);
  if (button.dataset.action === "rules") document.querySelector("#rules").showModal();
  if (button.dataset.action === "close") button.closest("dialog").close();
});

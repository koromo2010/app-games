const screens = [...document.querySelectorAll("[data-screen]")];
const title = document.querySelector("#page-title");
const debug = document.querySelector("#debug-panel");
const toast = document.querySelector("#toast");
const titles = { lobby: "ゲーム広場", entry: "ゲーム入口", room: "新しいゲーム" };

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
  if (button.dataset.action === "debug") {
    debug.classList.toggle("is-open");
    debug.setAttribute("aria-hidden", String(!debug.classList.contains("is-open")));
  }
  if (button.dataset.action === "dummy") notify("ダミー参加者を追加しました");
  if (button.dataset.action === "start") { notify("ゲームを開始しました"); button.textContent = "結果を表示"; }
  if (button.dataset.action === "abort") { route("room"); notify("進行中断：同じ参加者でロビーへ戻りました"); }
});

export type MyFirstGameClientSnapshot = {
  phase: string;
  view?: {
    app?: {
      count: number;
      target: number;
      canAdvance: boolean;
    };
  };
};

export type MyFirstGameClientAdapter = {
  mode: "prototype" | "formal-room";
  subscribe(listener: (snapshot: MyFirstGameClientSnapshot) => void): void;
  send(command: { type: "game/advance" | "prototype/reset" }): Promise<void>;
};

export function mountGameClient(adapter: MyFirstGameClientAdapter) {
  const status = document.querySelector<HTMLElement>("[data-game-status]");
  const action = document.querySelector<HTMLButtonElement>("[data-game-action=\"advance-count\"]");
  const reset = document.querySelector<HTMLButtonElement>("[data-game-action=\"reset-count\"]");
  const count = document.querySelector<HTMLElement>("[data-game-count]");
  const target = document.querySelector<HTMLElement>("[data-game-target]");
  const winner = document.querySelector<HTMLElement>(".winner-banner");
  if (!status || !action || !reset || !count || !target || !winner) {
    throw new Error("GAME_CLIENT_ROOT_INCOMPLETE");
  }
  adapter.subscribe((snapshot) => {
    const app = snapshot.view?.app;
    if (!app) return;
    status.textContent = snapshot.phase === "result"
      ? `ゲーム終了: ${app.count} / ${app.target}`
      : `PLAYER2の手番: ${app.count} / ${app.target}`;
    count.textContent = String(app.count);
    target.textContent = String(app.target);
    action.disabled = !app.canAdvance;
    winner.hidden = snapshot.phase !== "result";
  });
  action.addEventListener("click", () => void adapter.send({ type: "game/advance" }));
  reset.addEventListener("click", () => void adapter.send({ type: "prototype/reset" }));
}

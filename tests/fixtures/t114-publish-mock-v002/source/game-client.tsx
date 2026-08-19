import type { JankenChoice } from "./contracts.js";

export type JankenClientSnapshot = {
  phase: string;
  view?: {
    app?: {
      ownChoice: JankenChoice | null;
      choices: Array<{
        seat: number;
        submitted: boolean;
        choice: JankenChoice | null;
      }>;
      submittedSeats: number[];
      visiblePlayerSeats: number[];
      runtimeMarkers: string[];
      revealed: boolean;
      outcome: "win" | "lose" | "draw" | null;
      canChoose: boolean;
    };
  };
};

export type JankenClientAdapter = {
  mode: "prototype" | "formal-room";
  subscribe(listener: (snapshot: JankenClientSnapshot) => void): void;
  send(command:
    | { type: "game/choose"; choice: JankenChoice }
    | { type: "prototype/choose"; player: 0 | 1; choice: JankenChoice }
    | { type: "prototype/reset" }
  ): Promise<void>;
};

const choiceLabels: Record<JankenChoice, string> = {
  rock: "グー",
  paper: "パー",
  scissors: "チョキ",
};

export function mountGameClient(adapter: JankenClientAdapter) {
  const status = document.querySelector<HTMLElement>("[data-game-status]");
  const result = document.querySelector<HTMLElement>("[data-game-result]");
  const buttons = [...document.querySelectorAll<HTMLButtonElement>("[data-player][data-choice]")];
  const hands = [
    document.querySelector<HTMLElement>("[data-player-hand='0']"),
    document.querySelector<HTMLElement>("[data-player-hand='1']"),
  ];
  const reset = document.querySelector<HTMLButtonElement>("[data-game-action=reset]");
  const moduleEvidence = document.querySelector<HTMLElement>("[data-module-runtime-evidence]");
  if (!status || !result || !reset || !moduleEvidence || buttons.length !== 6 || hands.some((hand) => !hand)) {
    throw new Error("GAME_CLIENT_ROOT_INCOMPLETE");
  }
  adapter.subscribe((snapshot) => {
    const app = snapshot.view?.app;
    if (!app) return;
    status.textContent = app.revealed
      ? "両者の手を公開しました"
      : app.ownChoice
        ? `${choiceLabels[app.ownChoice]}を選択済み。相手を待っています。`
        : "手を選んでください";
    result.textContent = app.outcome === "draw"
      ? "引き分け"
      : app.outcome === "win"
        ? "あなたの勝ち"
        : app.outcome === "lose" ? "あなたの負け" : "";
    result.hidden = !app.revealed;
    moduleEvidence.replaceChildren(...app.runtimeMarkers.map((marker) => {
      const item = document.createElement("span");
      item.dataset.moduleRuntime = marker;
      item.dataset.visiblePlayerSeats = app.visiblePlayerSeats.join(",");
      item.textContent = marker === "t114-phase-flow"
        ? `${marker}:${snapshot.phase}`
        : marker === "t114-collect-choice"
          ? `${marker}:${app.submittedSeats.length}/2`
          : marker === "t114-secret-presentation"
            ? `${marker}:${app.revealed ? "revealed" : "private"}`
            : marker === "t114-standard-outcome"
              ? `${marker}:${app.outcome ?? "pending"}`
              : `${marker}:started`;
      return item;
    }));
    app.choices.forEach((row) => {
      const hand = hands[row.seat];
      if (hand) {
        hand.textContent = row.choice
          ? choiceLabels[row.choice]
          : row.submitted ? "選択済み（公開待ち）" : "未選択";
      }
    });
    buttons.forEach((button) => {
      const player = Number(button.dataset.player);
      const submitted = app.submittedSeats.includes(player);
      button.disabled = adapter.mode === "prototype"
        ? app.revealed || submitted || (player === 1 && !app.submittedSeats.includes(0))
        : player !== 0 || !app.canChoose;
    });
  });
  buttons.forEach((button) => {
    button.addEventListener("click", () => {
      const choice = button.dataset.choice as JankenChoice;
      const player = Number(button.dataset.player) as 0 | 1;
      void adapter.send(adapter.mode === "prototype"
        ? { type: "prototype/choose", player, choice }
        : { type: "game/choose", choice });
    });
  });
  reset.addEventListener("click", () => void adapter.send({ type: "prototype/reset" }));
}

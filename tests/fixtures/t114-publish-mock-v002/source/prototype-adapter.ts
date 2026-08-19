import type { JankenChoice } from "./contracts.js";
import type { JankenClientAdapter, JankenClientSnapshot } from "./game-client.js";

const beats: Record<JankenChoice, JankenChoice> = {
  rock: "scissors",
  paper: "rock",
  scissors: "paper",
};

function initialSnapshot(): JankenClientSnapshot {
  return {
    phase: "playing",
    view: {
      app: {
        ownChoice: null,
        choices: [
          { seat: 0, submitted: false, choice: null },
          { seat: 1, submitted: false, choice: null },
        ],
        submittedSeats: [],
        visiblePlayerSeats: [0, 1],
        runtimeMarkers: [
          "t114-start-guard",
          "t114-phase-flow",
          "t114-secret-presentation",
        ],
        revealed: false,
        outcome: null,
        canChoose: true,
      },
    },
  };
}

export function createPrototypeAdapter(): JankenClientAdapter {
  let snapshot = initialSnapshot();
  let choices: [JankenChoice | null, JankenChoice | null] = [null, null];
  const listeners = new Set<(value: JankenClientSnapshot) => void>();
  const publish = () => listeners.forEach((listener) => listener(snapshot));
  return {
    mode: "prototype",
    subscribe(listener) {
      listeners.add(listener);
      listener(snapshot);
    },
    async send(command) {
      if (command.type === "prototype/reset") {
        choices = [null, null];
        snapshot = initialSnapshot();
      } else if (command.type === "prototype/choose") {
        if (choices[command.player]) return;
        choices[command.player] = command.choice;
        const complete = choices.every(Boolean);
        const first = choices[0];
        const second = choices[1];
        const outcome = !complete || !first || !second
          ? null
          : first === second ? "draw" : beats[first] === second ? "win" : "lose";
        snapshot = {
          phase: complete ? "result" : "playing",
          view: {
            app: {
              ownChoice: choices[0],
              choices: choices.map((choice, seat) => ({
                seat,
                submitted: Boolean(choice),
                choice: complete ? choice : null,
              })),
              submittedSeats: choices.flatMap((choice, seat) => choice ? [seat] : []),
              visiblePlayerSeats: [0, 1],
              runtimeMarkers: [
                "t114-start-guard",
                "t114-phase-flow",
                "t114-collect-choice",
                "t114-secret-presentation",
                ...(complete ? ["t114-standard-outcome"] : []),
              ],
              revealed: complete,
              outcome,
              canChoose: !choices[0],
            },
          },
        };
      } else {
        return;
      }
      publish();
    },
  };
}

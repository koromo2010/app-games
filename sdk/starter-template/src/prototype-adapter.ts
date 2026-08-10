import type {
  MyFirstGameClientAdapter,
  MyFirstGameClientSnapshot,
} from "./game-client.js";

export function createPrototypeAdapter(): MyFirstGameClientAdapter {
  let snapshot: MyFirstGameClientSnapshot = {
    phase: "playing",
    view: { app: { count: 2, target: 3, canAdvance: true } },
  };
  const listeners = new Set<(value: MyFirstGameClientSnapshot) => void>();
  const publish = () => listeners.forEach((listener) => listener(snapshot));
  return {
    mode: "prototype",
    subscribe(listener) {
      listeners.add(listener);
      listener(snapshot);
    },
    async send(command) {
      if (command.type === "prototype/reset") {
        snapshot = {
          phase: "playing",
          view: { app: { count: 2, target: 3, canAdvance: true } },
        };
      } else {
        snapshot = {
          phase: "result",
          view: { app: { count: 3, target: 3, canAdvance: false } },
        };
      }
      publish();
    },
  };
}

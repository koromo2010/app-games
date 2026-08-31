import type { GameFieldsEnvironment } from "./game-fields-environment.ts";

export const roomChatRetention = {
  maximumMessages: 200,
  maximumAgeSeconds: 6 * 60 * 60,
  pageSize: 50,
} as const;

export function roomChatEnabled(environment: GameFieldsEnvironment) {
  return environment === "development" || environment === "test";
}

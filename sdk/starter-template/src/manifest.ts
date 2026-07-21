import { GAME_SDK_VERSION, defineGameManifest } from "@game-fields/game-sdk";

export const myFirstGameManifest = defineGameManifest({
  sdkVersion: GAME_SDK_VERSION,
  id: "my-first-game",
  title: { ja: "はじめてのゲーム", en: "My First Game" },
  playMode: "online-room",
  minimumPlayers: 2,
  maximumPlayers: 4,
  supportsDebug: true,
  supportsSpectators: false,
  supportsReplay: false,
  supportsRating: false,
  usesLlm: false,
});

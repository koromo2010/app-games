import { GAME_SDK_VERSION, defineGameManifest } from "@game-fields/game-sdk";

export const myFirstGameManifest = defineGameManifest({
  sdkVersion: GAME_SDK_VERSION,
  id: "my-first-game",
  title: { ja: "はじめてのゲーム", en: "My First Game" },
  playMode: "online-room",
  minimumPlayers: 1,
  maximumPlayers: 4,
  supportsDebug: true,
  supportsSpectators: false,
  supportsReplay: false,
  supportsRating: false,
  usesLlm: false,
  rules: [
    {
      ja: "目標値に先に到達したプレイヤーが勝利します。",
      en: "The first player to reach the target wins.",
    },
  ],
  settings: [
    {
      key: "target",
      label: { ja: "ゴール", en: "Target" },
      type: "number",
      defaultValue: 3,
      minimum: 2,
      maximum: 10,
    },
    {
      key: "timeLimitSeconds",
      label: { ja: "1手の制限時間", en: "Turn time limit" },
      type: "select",
      defaultValue: 60,
      platformRole: "time-limit",
      options: [0, 30, 60, 90, 120],
      unit: { ja: "秒", en: "s" },
    },
  ],
});

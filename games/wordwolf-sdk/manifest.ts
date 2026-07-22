import { GAME_SDK_VERSION, defineGameManifest } from "@game-fields/game-sdk";

export const wordWolfSdkManifest = defineGameManifest({
  sdkVersion: GAME_SDK_VERSION,
  id: "wordwolf-sdk",
  title: { ja: "ワードウルフ SDK", en: "Word Wolf SDK" },
  playMode: "online-room",
  minimumPlayers: 3,
  maximumPlayers: 20,
  supportsDebug: true,
  supportsSpectators: true,
  supportsReplay: true,
  supportsRating: true,
  usesLlm: true,
  settings: [
    { key: "roundsTotal", label: { ja: "ヒント周回数", en: "Clue rounds" }, type: "select", options: [1, 2, 3, 4] },
    { key: "wolfCount", label: { ja: "狼の人数", en: "Wolf count" }, type: "number", minimum: 1, maximum: 9 },
    { key: "clueMode", label: { ja: "ヒント方式", en: "Clue mode" }, type: "select", options: ["turn", "simultaneous"] },
  ],
} as const);

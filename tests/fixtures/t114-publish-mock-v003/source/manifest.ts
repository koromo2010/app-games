import { GAME_SDK_VERSION, defineGameManifest } from "@game-fields/game-sdk";

export const jankenManifest = defineGameManifest({
  sdkVersion: GAME_SDK_VERSION,
  id: "t114-publish-mock-fixture",
  title: {
    ja: "T-114 じゃんけん Fixture",
    en: "T-114 Publish Mock Fixture",
  },
  playMode: "online-room",
  minimumPlayers: 2,
  previewMinimumPlayers: 2,
  maximumPlayers: 2,
  supportsDebug: true,
  supportsSpectators: false,
  supportsReplay: false,
  supportsRating: false,
  usesLlm: false,
  rules: [
    {
      ja: "2人が同時に手を選び、両者の選択後に手と勝敗を公開します。",
      en: "Both players choose privately; choices and the result are revealed together.",
    },
    {
      ja: "グーはチョキ、チョキはパー、パーはグーに勝ちます。",
      en: "Rock beats scissors, scissors beats paper, and paper beats rock.",
    },
  ],
  settings: [
    {
      key: "timeLimitSeconds",
      label: { ja: "選択の制限時間", en: "Choice time limit" },
      type: "select",
      defaultValue: 60,
      platformRole: "time-limit",
      options: [0, 30, 60, 90, 120],
      unit: { ja: "秒", en: "s" },
    },
  ],
});

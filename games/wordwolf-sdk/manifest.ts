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
  rules: [
    {
      ja: "少数派だけが別のお題を受け取り、順番にヒントを出します。",
      en: "A minority receives a different word and everyone gives clues in turn.",
    },
    {
      ja: "投票で少数派を当てても、少数派がお題を当てれば逆転します。",
      en: "The minority can still win by guessing the majority word after the vote.",
    },
  ],
  settings: [
    { key: "roundsTotal", label: { ja: "ヒント周回数", en: "Clue rounds" }, type: "select", defaultValue: 1, platformRole: "round-count", options: [1, 2, 3, 4], unit: { ja: "回", en: "rounds" } },
    { key: "wolfCount", label: { ja: "狼の人数", en: "Wolf count" }, type: "number", defaultValue: 1, minimum: 1, maximum: 9, unit: { ja: "人", en: "players" } },
    { key: "clueMode", label: { ja: "ヒント方式", en: "Clue mode" }, type: "select", defaultValue: "turn", options: [{ value: "turn", label: { ja: "順番", en: "Turn order" } }, { value: "simultaneous", label: { ja: "同時", en: "Simultaneous" } }] },
    { key: "timeLimitSeconds", label: { ja: "1手の制限時間", en: "Turn time limit" }, type: "select", defaultValue: 60, platformRole: "time-limit", options: [0, 30, 60, 90, 120], unit: { ja: "秒", en: "s" } },
  ],
} as const);

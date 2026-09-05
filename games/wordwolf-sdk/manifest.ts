import { GAME_SDK_VERSION, defineGameManifest } from "@game-fields/game-sdk";

export const wordWolfSdkManifest = defineGameManifest({
  sdkVersion: GAME_SDK_VERSION,
  id: "wordwolf-sdk",
  title: { ja: "ワードウルフ SDK", en: "Word Wolf SDK" },
  playMode: "online-room",
  localePolicy: {
    roomContentMode: "content-bound",
    uiLocales: ["ja"],
    contentLanguages: ["ja"],
    defaultContentLanguage: "ja",
  },
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
  ruleSections: {
    summary: { ja: "少数派だけが別のお題を受け取り、会話と投票で見抜く正体隠匿ゲームです。", en: "A minority receives a different word; discussion and voting identify it." },
    playerActions: { ja: "お題を直接言わずにヒントを出し、会話後に少数派だと思う参加者へ投票します。", en: "Give indirect clues, then vote for the player you believe is in the minority." },
    winCondition: { ja: "少数派を逃すと少数派側の勝利です。選ばれても多数派のお題を当てれば逆転します。", en: "The minority wins if it escapes, or if it correctly guesses the majority word after being selected." },
    detailedRules: { ja: "各参加者には自分だけのお題が表示されます。設定された周回のヒント後に投票し、選ばれた少数派は多数派のお題を回答します。期限処理はサーバー正本です。", en: "Each player sees only their own word. After the configured clue rounds, players vote and the selected minority may guess the majority word. The server owns deadline handling." },
    playExample: { ja: "投票で少数派を選び、その人が多数派のお題を外せば多数派側の勝利です。", en: "If the vote selects the minority and that player misses the majority word, the majority wins." },
  },
  settings: [
    { key: "roundsTotal", label: { ja: "ヒント周回数", en: "Clue rounds" }, type: "select", defaultValue: 1, platformRole: "round-count", options: [1, 2, 3, 4], unit: { ja: "回", en: "rounds" } },
    { key: "wolfCount", label: { ja: "狼の人数", en: "Wolf count" }, type: "number", defaultValue: 1, minimum: 1, maximum: 9, unit: { ja: "人", en: "players" } },
    { key: "clueMode", label: { ja: "ヒント方式", en: "Clue mode" }, type: "select", defaultValue: "turn", options: [{ value: "turn", label: { ja: "順番", en: "Turn order" } }, { value: "simultaneous", label: { ja: "同時", en: "Simultaneous" } }] },
    { key: "timeLimitSeconds", label: { ja: "1手の制限時間", en: "Turn time limit" }, type: "select", defaultValue: 60, platformRole: "time-limit", options: [0, 30, 60, 90, 120], unit: { ja: "秒", en: "s" } },
  ],
} as const);

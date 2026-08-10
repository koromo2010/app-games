import type { AppLocale } from "@/lib/app-locale";

export type GameLandingFaqItem = readonly [question: string, answer: string];

type GameLandingFeature = {
  title: string;
  description: string;
};

type GameLandingStep = {
  title: string;
  description: string;
};

export type GameLandingContent = {
  eyebrow: string;
  heroDescription: string;
  overview: readonly string[];
  features: readonly GameLandingFeature[];
  steps: readonly GameLandingStep[];
  faqItems: readonly GameLandingFaqItem[];
  bottomTitle: string;
  bottomDescription: string;
};

const tahoiyaContent: Record<AppLocale, GameLandingContent> = {
  ja: {
    eyebrow: "辞書いらずで遊べる、オンラインたほいや",
    heroDescription: "知らない言葉の意味を、もっともらしくでっち上げよう。本当の説明とみんなの偽説明から、どれが本物かを見抜く言葉のブラフゲームです。",
    overview: [
      "たほい屋は、珍しい言葉の本当の意味を当てながら、自分の偽説明でほかの人をだますオンラインゲームです。",
      "お題と本当の説明はAIが用意するので、辞書も出題役も不要。正解を見抜いても、あなたの説明が本物だと信じられても得点になります。",
    ],
    features: [
      { title: "辞書も出題役もいらない", description: "珍しい言葉、読み方、本当の説明はAIが用意します。" },
      { title: "当てても、だましても得点", description: "本物を当てると1点。自分の偽説明に1票入るごとに1点を獲得します。" },
      { title: "全員が書いて、全員が投票", description: "全員が偽説明を作り、本物だと思う説明へ投票します。自分の偽説明には投票できません。" },
    ],
    steps: [
      { title: "お題を確認する", description: "意味を知らない人が多い、珍しい言葉がお題として表示されます。" },
      { title: "偽の説明を書く", description: "本当の意味に見えるように、辞書らしい説明を考えます。" },
      { title: "本物に投票する", description: "本当の説明とみんなの偽説明から1つを選びます。正解するか、自分の説明でだませば得点です。" },
    ],
    faqItems: [
      ["辞書や出題役は必要ですか？", "いいえ。お題の言葉、読み方、本当の説明はAIが用意します。辞書を用意したり、答えを知っている進行役を決めたりする必要はありません。"],
      ["言葉の意味を知らなくても遊べますか？", "はい。意味を知らない人が多い珍しい言葉を使うゲームなので、知らなくても問題ありません。もっともらしい説明を考え、本物を見抜くことがゲームの中心です。"],
      ["文章を考えるのが苦手でも遊べますか？", "はい。短い説明で参加できます。自分で考えた文章を、AIで辞書らしい言い回しに整える機能も使えます。"],
    ],
    bottomTitle: "あなたの説明は、本物に見える？",
    bottomDescription: "3人集まったら、すぐに始められます。",
  },
  en: {
    eyebrow: "Online Tahoiya, with no dictionary or moderator required",
    heroDescription: "Invent a convincing meaning for an unfamiliar word, then spot the real definition among everyone’s fakes in this dictionary bluffing game.",
    overview: [
      "Tahoiya is an online game where you identify the real meaning of an unusual word while trying to fool the other players with a fake definition of your own.",
      "AI supplies the word and its real definition, so you do not need a dictionary or a dedicated moderator. Score by finding the truth or by convincing someone that your definition is real.",
    ],
    features: [
      { title: "No dictionary or moderator", description: "AI supplies the unusual word, its reading, and the real definition." },
      { title: "Score by guessing or bluffing", description: "Earn one point for finding the real definition and one point for every vote your fake receives." },
      { title: "Everyone writes and votes", description: "Every player writes a fake definition and votes for the real one. You cannot vote for your own fake." },
    ],
    steps: [
      { title: "See the word", description: "The game presents an unusual word that most players are unlikely to know." },
      { title: "Write a fake definition", description: "Invent a short explanation that sounds as though it came from a dictionary." },
      { title: "Vote for the real one", description: "Choose from the real definition and everyone’s fakes. Score by guessing correctly or fooling another player." },
    ],
    faqItems: [
      ["Do we need a dictionary or a moderator?", "No. AI supplies the word, its reading, and the real definition, so nobody needs to prepare a dictionary or sit out as the moderator."],
      ["Can I play if I do not know the word?", "Yes. The game deliberately uses unusual words that most players will not know. Inventing a plausible definition and spotting the real one are the heart of the game."],
      ["What if I am not confident about writing?", "A short definition is enough. You can also use AI to polish your own draft into more dictionary-like wording."],
    ],
    bottomTitle: "Could your definition pass for the real one?",
    bottomDescription: "Gather three players and start right away.",
  },
};

const gameSpecificContent: Partial<Record<string, Record<AppLocale, GameLandingContent>>> = {
  tahoiya: tahoiyaContent,
};

export const sharedGameFieldsFaq: Record<AppLocale, readonly GameLandingFaqItem[]> = {
  ja: [
    ["無料で遊べますか？", "はい。Game Fieldsのアカウントでログインすると、通常は無料で遊べます。AIを使うゲームでは、共有の無料AIが利用の集中により上限に達する場合があります。"],
    ["スマートフォンでも遊べますか？", "はい。スマートフォンとPCのブラウザに対応しています。専用アプリをインストールする必要はありません。"],
    ["離れた人とも遊べますか？", "はい。それぞれの端末から同じオンライン部屋に参加できます。部屋を作った人から部屋コードと、設定されている場合は合言葉を共有してもらってください。"],
  ],
  en: [
    ["Is it free to play?", "Yes. You can normally play for free after signing in with a Game Fields account. In games that use AI, the shared free AI may reach its limit when usage is high."],
    ["Can I play on a phone?", "Yes. Game Fields supports phone and desktop browsers, with no dedicated app to install."],
    ["Can I play remotely?", "Yes. Each player can join the same online room from their own device. Ask the host for the room code and, when one is set, the passphrase."],
  ],
};

export function gameLandingContent(gameId: string, locale: AppLocale) {
  return gameSpecificContent[gameId]?.[locale] ?? null;
}

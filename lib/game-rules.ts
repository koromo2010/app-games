export const GAME_RULE_SECTION_KEYS = [
  "summary",
  "playerActions",
  "winCondition",
  "detailedRules",
  "playExample",
] as const;

export type GameRuleSectionKey = typeof GAME_RULE_SECTION_KEYS[number];
export type GameRuleSections = Readonly<Record<GameRuleSectionKey, string>>;

/**
 * Player-visible rules are content, not room administration.  The revision is
 * deliberately part of the projection so a caller must bind it explicitly
 * rather than silently resolving whatever text happens to be newest.
 */
export type BoundGameRules = Readonly<{
  gameId: string;
  revision: string;
  language: "ja" | "en";
  sections: GameRuleSections;
}>;

type BuiltInGameId =
  | "wordwolf"
  | "tahoiya"
  | "northern-branch"
  | "hodoai"
  | "kotoba-senpuku"
  | "nigoichi"
  | "code-intercept"
  | "canvas"
  | "daifugo";

const builtinRules: Readonly<Record<BuiltInGameId, BoundGameRules>> = {
  wordwolf: {
    gameId: "wordwolf", revision: "builtin:wordwolf:rules-v1", language: "ja",
    sections: {
      summary: "似たお題を話題にして、少数派の狼を投票で見抜く正体隠匿ゲームです。",
      playerActions: "自分のお題を直接言わずに話し、会話後に狼だと思う参加者へ投票します。",
      winCondition: "狼を逃すと狼側の勝利です。狼を選んでも、市民のお題を当てれば狼側が逆転します。",
      detailedRules: "全員に自分だけのお題が配られます。設定回数の会話の後に投票し、同票なら決選投票をします。選ばれた狼は市民のお題を回答できます。時間切れはサーバーがその時点の操作で進行します。",
      playExample: "市民が狼を選び、狼が市民のお題を外せば市民側の勝利です。",
    },
  },
  tahoiya: {
    gameId: "tahoiya", revision: "builtin:tahoiya:rules-v1", language: "ja",
    sections: {
      summary: "知らないことばの本当の意味を、もっともらしい偽の説明の中から見抜くブラフゲームです。",
      playerActions: "お題へ辞書らしい偽説明を書き、本物だと思う説明を一つ選びます。",
      winCondition: "本物を当てると得点になり、自分の偽説明へ集まった票も得点になります。",
      detailedRules: "全員の偽説明と本物を作者を隠して混ぜます。自分の説明は選べません。投票後に本物、作者、得点を公開し、設定ラウンドを合算します。未提出・未投票はサーバー正本で扱います。",
      playExample: "本物を当て、あなたの偽説明を二人が選べば、このラウンドは合計3点です。",
    },
  },
  "northern-branch": {
    gameId: "northern-branch", revision: "builtin:northern-branch:rules-v1", language: "ja",
    sections: {
      summary: "資源を集め、商品と建物を使って10勝利点を先に集める商会ゲームです。",
      playerActions: "手番に資源取得、生産、購入、建設の一つを行い、建物能力も使えます。",
      winCondition: "誰かが10勝利点へ到達した瞬間に、その参加者が勝利します。",
      detailedRules: "市場から商品や建物を得るには材料または支払いカードが必要です。手札は最大7枚で、公開情報と非公開の手札を区別します。0秒以外の手番時間では、期限時にサーバーが手番を終了します。",
      playExample: "9点の人が2点の建物を建てれば、合計10点になった時点で勝利です。",
    },
  },
  hodoai: {
    gameId: "hodoai", revision: "builtin:hodoai:rules-v1", language: "ja",
    sections: {
      summary: "秘密の数字を直接言わずにことばで伝え、全員のカードを小さい順に並べる協力ゲームです。",
      playerActions: "お題に対することばを各自で出し、最後に並べ替え役がカード順を確定します。",
      winCondition: "正しい順との逆転組が少ないほど、チームの得点が高くなります。",
      detailedRules: "各参加者は自分の数字だけを見ます。全員のことばを公開して相談し、並べ替え役が順番を確定します。数字そのものや直接的な数の説明は使いません。時間切れは未提出または保存済み順で正本が進行します。",
      playExample: "正解が10・50・90なのに10・90・50なら、逆転は一組なのでチームは2点です。",
    },
  },
  "kotoba-senpuku": {
    gameId: "kotoba-senpuku", revision: "builtin:kotoba-senpuku:rules-v1", language: "ja",
    sections: {
      summary: "文字を探知して相手の秘密のことばを明かし、自分のことばを最後まで隠す推理ゲームです。",
      playerActions: "手番に未使用の文字を選ぶか、許可された部屋では相手の秘密語を回答します。",
      winCondition: "最後まで秘密語が残った参加者が勝利します。",
      detailedRules: "全員がひらがなの秘密語を入力して開始します。選ばれた文字は該当する語だけで公開され、直接回答が正しければ対象が脱落します。設定により連続探知・直接回答・時間制限が変わります。",
      playExample: "「か」を探知して相手の「すいか」に含まれていれば、その文字位置が公開されます。",
    },
  },
  nigoichi: {
    gameId: "nigoichi", revision: "builtin:nigoichi:rules-v1", language: "ja",
    sections: {
      summary: "連想語を手がかりに、誰にも配られていない一枚のことばを見つけるゲームです。",
      playerActions: "自分のカード全体から連想語を書き、公開後に余りだと思うことばを選びます。",
      winCondition: "余りを当てると得点し、自分のカードを余りだと誤認された票は減点になります。",
      detailedRules: "場のカードは参加人数×配布枚数に一枚を加えた数です。自分のカードは選べず、全員の予想後に正解と得点を公開します。時間切れの入力・予想はサーバーの既存規則で処理します。",
      playExample: "4人で余りを当てれば3点ですが、自分のカードへの誤票が2票ならこのラウンドは1点です。",
    },
  },
  "code-intercept": {
    gameId: "code-intercept", revision: "builtin:code-intercept:rules-v1", language: "ja",
    sections: {
      summary: "二チームで暗号をヒントとして伝え、味方の暗号を正しく、相手の暗号を傍受するチーム戦です。",
      playerActions: "出題者は番号列を直接書かず単語ヒントにし、各チームは味方と相手の暗号を選択します。",
      winCondition: "設定ラウンド後、より多く暗号を正しく伝達・傍受したチームが勝ちます。",
      detailedRules: "秘密単語と暗号はチームごとに異なります。固定または各ラウンド選択の桁数でヒントを作り、両チームの提出後に判定します。チーム編成・難易度・時間設定はRoom設定として別に扱います。",
      playExample: "猫・宇宙・寿司・雨で暗号3・1・4なら、寿司・猫・雨を連想する三つのヒントを順に出します。",
    },
  },
  canvas: {
    gameId: "canvas", revision: "builtin:canvas:rules-v1", language: "ja",
    sections: {
      summary: "マウス、指、ペン、キーボードで共同描画できる、勝敗を持たない試作キャンバスです。",
      playerActions: "ペン・消しゴム・色・レイヤーを選び、キャンバスへ描画します。",
      winCondition: "勝敗、得点、終了条件はありません。",
      detailedRules: "通常の描画は端末へ保存され、共同Roomでは同じキャンバスを編集します。レイヤーを選んで描画し、消去の権限や範囲は既存のRoom操作に従います。キーボード操作も利用できます。",
      playExample: "矢印でキーボードカーソルを動かし、Spaceと矢印を押すと線を描けます。",
    },
  },
  daifugo: {
    gameId: "daifugo", revision: "builtin:daifugo:rules-v1", language: "ja",
    sections: {
      summary: "場より強い同枚数のカードを出し、誰より早く手札をなくすカードゲームです。",
      playerActions: "場が空なら一枚または同じ数字の組を出し、場があれば同枚数でより強い組を出すかパスします。",
      winCondition: "最初に手札をなくした人から大富豪、富豪、貧民、大貧民の順位を決めます。",
      detailedRules: "強さは3から2、ジョーカーの順です。全員がパスすると場が流れ、最後に出した人が次を始めます。革命などの未実装ローカルルールは適用しません。オンラインの期限処理はサーバー正本です。",
      playExample: "場が7一枚なら、8以上を一枚出すかパスします。全員がパスすれば場が空になります。",
    },
  },
};

export function getBuiltInGameRules(gameId: string): BoundGameRules | null {
  return builtinRules[gameId as BuiltInGameId] ?? null;
}

export function bindGameRules(
  ruleSet: BoundGameRules | null | undefined,
  expectedRevision?: string | null,
): BoundGameRules | null {
  if (!ruleSet) return null;
  if (expectedRevision && expectedRevision !== ruleSet.revision) return null;
  return ruleSet;
}

export function hasCompleteRuleSections(value: unknown): value is GameRuleSections {
  return Boolean(value)
    && typeof value === "object"
    && GAME_RULE_SECTION_KEYS.every((key) => (
      typeof (value as Partial<GameRuleSections>)[key] === "string"
      && (value as Partial<GameRuleSections>)[key]!.trim().length > 0
    ));
}

/**
 * Projects an accepted SDK manifest into the same immutable display contract
 * used by built-in games. A caller must supply the Room/package revision it
 * intends to display; incomplete or mismatched data is deliberately absent.
 */
export function getSdkGameRules(input: Readonly<{
  gameId: string;
  revision: string | null | undefined;
  locale: "ja" | "en";
  ruleSections: Readonly<Record<GameRuleSectionKey, Readonly<Record<"ja" | "en", string>>>> | null | undefined;
}>): BoundGameRules | null {
  if (!input.revision || !input.ruleSections) return null;
  const sections = Object.fromEntries(GAME_RULE_SECTION_KEYS.map((key) => [
    key,
    input.ruleSections?.[key]?.[input.locale],
  ])) as Partial<GameRuleSections>;
  if (!hasCompleteRuleSections(sections)) return null;
  return {
    gameId: input.gameId,
    revision: input.revision,
    language: input.locale,
    sections,
  };
}

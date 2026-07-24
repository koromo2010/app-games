export const GAME_SDK_MODULE_IDS = [
  "authentication",
  "account-session",
  "authorization",
  "persistence",
  "observability",
  "common-navigation",
  "player-menu",
  "common-shell",
  "online-room",
  "room-sync",
  "room-settings",
  "debug",
  "timer",
  "result",
  "rematch",
  "dissolution",
  "stats",
  "rating",
  "replay",
  "result-share",
  "spectators",
  "ai-activity",
  "ads",
  "start-guard",
  "phase-flow",
  "rounds",
  "turn-order",
  "collect-text",
  "collect-choice",
  "vote",
  "role-assignment",
  "team-assignment",
  "secret-presentation",
  "standard-outcome",
  "content-source",
  "llm",
  "playing-cards",
  "drawing",
] as const;

export type GameSdkModuleId = (typeof GAME_SDK_MODULE_IDS)[number];

export type GameSdkModuleGroup =
  | "platform"
  | "shell"
  | "flow"
  | "resource";

export type GameSdkModuleDelivery =
  | "platform-owned"
  | "sdk-helper"
  | "platform-resource"
  | "sdk-resource";

export type GameSdkModuleDefinition = {
  id: GameSdkModuleId;
  group: GameSdkModuleGroup;
  label: string;
  description: string;
  delivery: GameSdkModuleDelivery;
  packageExports: readonly string[];
  publicApis: readonly string[];
  usage: string;
};

const FLOW_MODULE_PUBLIC_APIS: Partial<
  Record<GameSdkModuleId, readonly string[]>
> = {
  "start-guard": ["assertGameSdkCanStart"],
  "phase-flow": ["assertGameSdkPhase"],
  rounds: ["nextGameSdkRoundStep"],
  "turn-order": ["nextGameSdkEligibleSeat"],
  "collect-text": [
    "recordGameSdkParticipantValue",
    "missingGameSdkParticipantIds",
    "allGameSdkParticipantsComplete",
  ],
  "collect-choice": [
    "recordGameSdkParticipantValue",
    "missingGameSdkParticipantIds",
    "allGameSdkParticipantsComplete",
  ],
  vote: ["recordGameSdkVote", "tallyGameSdkVotes"],
  "role-assignment": ["assignGameSdkRoles"],
  "team-assignment": [
    "distributeGameSdkBalancedTeams",
    "assignGameSdkBalancedTeams",
  ],
  "secret-presentation": ["gameSdkPlayerSeat", "gameSdkPlayerSeats"],
  "standard-outcome": ["defineGameSdkStandardResult"],
};

function moduleContract(
  id: GameSdkModuleId,
  group: GameSdkModuleGroup,
): Pick<
  GameSdkModuleDefinition,
  "delivery" | "packageExports" | "publicApis" | "usage"
> {
  if (id === "content-source") {
    return {
      delivery: "platform-resource",
      packageExports: ["@game-fields/game-sdk/content-source"],
      publicApis: [
        "GameSdkContentSource.drawWords",
        "GameSdkContentSource.drawWordPairs",
        "GameSdkContentSource.findDefinitions",
      ],
      usage:
        "公開型をimportし、Game Fieldsから注入されたcontent sourceを使う。DBへ直接接続しない。",
    };
  }
  if (id === "playing-cards") {
    return {
      delivery: "sdk-resource",
      packageExports: [
        "@game-fields/game-sdk/playing-cards",
        "@game-fields/game-sdk/playing-cards-react",
      ],
      publicApis: [
        "createStandardPlayingCardDeck",
        "shufflePlayingCards",
        "dealPlayingCardsRoundRobin",
        "presentPlayingCardHands",
        "PlayingCardView",
        "PlayingCardHand",
        "PlayingCardBackStack",
      ],
      usage:
        "カード型・デッキ操作・秘密手札投影・React UIを公開packageから直接importする。",
    };
  }
  if (id === "drawing") {
    return {
      delivery: "sdk-resource",
      packageExports: [
        "@game-fields/game-sdk/drawing",
        "@game-fields/game-sdk/drawing-react",
      ],
      publicApis: [
        "DrawingStroke",
        "normalizeDrawingStroke",
        "normalizeDrawingStrokes",
        "drawingFeatures",
        "DrawingCanvas",
        "DrawingToolbar",
        "DrawingLayerPanel",
      ],
      usage:
        "ストローク型・正規化・機能preset・Reactキャンバスを公開packageからimportし、保存とRoom同期はPlatform adapterへ委ねる。",
    };
  }
  if (id === "llm") {
    return {
      delivery: "platform-resource",
      packageExports: ["@game-fields/game-sdk/llm"],
      publicApis: [
        "GameSdkLlmGateway.generate",
        "GameSdkGenerationMeta",
      ],
      usage:
        "公開型をimportし、Game Fieldsから注入された共通LLM gatewayを使う。ProviderやAPIキーへ直接接続しない。",
    };
  }
  if (group === "flow") {
    return {
      delivery: "sdk-helper",
      packageExports: ["@game-fields/game-sdk/modules"],
      publicApis: FLOW_MODULE_PUBLIC_APIS[id] ?? [],
      usage:
        "公開SDKの純粋helperをimportし、ゲーム固有state transitionから利用する。",
    };
  }
  return {
    delivery: "platform-owned",
    packageExports: [],
    publicApis: [],
    usage:
      "Game Fields共通ShellまたはPlatformが合成する。ゲームpackageで再実装しない。",
  };
}

const moduleDefinition = (
  id: GameSdkModuleId,
  group: GameSdkModuleGroup,
  label: string,
  description: string,
): GameSdkModuleDefinition => ({
  id,
  group,
  label,
  description,
  ...moduleContract(id, group),
});

/**
 * Machine-readable catalog shared by the starter, SDK Portal and platform
 * preview. The AppSet may consume modules, but it never owns this policy.
 */
export const GAME_SDK_MODULE_CATALOG: readonly GameSdkModuleDefinition[] = [
  moduleDefinition("authentication", "platform", "認証", "署名済みセッションから本人を確定する。"),
  moduleDefinition("account-session", "platform", "アカウント", "ログイン状態とプレイヤー情報をPlatformが管理する。"),
  moduleDefinition("authorization", "platform", "最終認可", "Commandごとに権限・フェーズ・対象をサーバーで検証する。"),
  moduleDefinition("persistence", "platform", "保存", "Roomと索引をPlatformの保存層へ永続化する。"),
  moduleDefinition("observability", "platform", "観測", "秘密情報を除いた安全なイベントを記録する。"),
  moduleDefinition("common-navigation", "platform", "共通ナビ", "広場・ロビー・ゲーム間の共通導線を提供する。"),
  moduleDefinition("player-menu", "platform", "プレイヤーメニュー", "アカウント表示とログアウト導線を提供する。"),
  moduleDefinition("common-shell", "shell", "共通ゲームシェル", "トップバー、ロビー、参加者、ゲーム領域を合成する。"),
  moduleDefinition("online-room", "shell", "オンラインRoom", "作成・参加・退出・復帰・人数上限を管理する。"),
  moduleDefinition("room-sync", "shell", "Room同期", "revision、Realtime通知、polling fallbackを管理する。"),
  moduleDefinition("room-settings", "shell", "部屋設定", "全員への設定表示、ホスト編集、既定値保存を提供する。"),
  moduleDefinition("debug", "shell", "DEBUG", "ダミー、視点、状態再現、自動進行、中断を提供する。"),
  moduleDefinition("timer", "shell", "時間管理", "期限、受付猶予、時間切れCommand、連続放置を管理する。"),
  moduleDefinition("result", "shell", "結果画面", "標準結果を共通結果画面へ投影する。"),
  moduleDefinition("rematch", "shell", "再戦", "同じ部屋と参加者を保った再戦を管理する。"),
  moduleDefinition("dissolution", "shell", "部屋解散", "ロビー・結果での解散と索引整理を管理する。"),
  moduleDefinition("stats", "shell", "戦績", "標準結果を冪等に共通戦績へ保存する。"),
  moduleDefinition("rating", "shell", "レーティング", "標準順位・得点から共通ratingを計算する。"),
  moduleDefinition("replay", "shell", "プレイバック", "本人向けの安全な詳細記録を保存する。"),
  moduleDefinition("result-share", "shell", "結果共有", "共有前プレビューと匿名化した共有文を提供する。"),
  moduleDefinition("spectators", "shell", "観戦", "参加者とは別の安全な公開Viewを提供する。"),
  moduleDefinition("ai-activity", "shell", "AI通信表示", "共通AI通信中のバイタル表示を提供する。"),
  moduleDefinition("ads", "shell", "広告枠", "非プレイ面だけへ共通広告slotを配置する。"),
  moduleDefinition("start-guard", "flow", "開始条件", "ホスト・ロビー・最低人数の共通開始条件を検証する。"),
  moduleDefinition("phase-flow", "flow", "フェーズ進行", "フェーズ遷移と操作可能フェーズを管理する。"),
  moduleDefinition("rounds", "flow", "ラウンド", "ラウンド番号と最終ラウンド後の遷移を管理する。"),
  moduleDefinition("turn-order", "flow", "手番", "手番順と除外対象を考慮した次手番を管理する。"),
  moduleDefinition("collect-text", "flow", "文章収集", "全員分の文章提出、上書き、完了待ちを管理する。"),
  moduleDefinition("collect-choice", "flow", "選択収集", "全員分の選択提出と完了待ちを管理する。"),
  moduleDefinition("vote", "flow", "投票", "投票対象、自己投票、再投票、集計、同票を管理する。"),
  moduleDefinition("role-assignment", "flow", "役職割当", "人数に応じた役職数とランダム割当を管理する。"),
  moduleDefinition("team-assignment", "flow", "チーム割当", "均等なチーム分けと参加順を管理する。"),
  moduleDefinition("secret-presentation", "flow", "秘密情報", "内部IDをseatへ変換し閲覧者別公開を補助する。"),
  moduleDefinition("standard-outcome", "flow", "標準勝敗", "勝者・順位・得点・終了理由を共通結果へ渡す。"),
  moduleDefinition("content-source", "resource", "コンテンツ供給", "単語DBやゲーム素材の供給元をPlatformから注入する。"),
  moduleDefinition("llm", "resource", "LLM", "共通LLM gatewayと生成メタデータを利用する。"),
  moduleDefinition("playing-cards", "resource", "トランプ", "共通カード型、デッキ操作、カードUIを利用する。"),
  moduleDefinition("drawing", "resource", "描画", "共通キャンバス、ツール、ストローク、レイヤーを利用する。"),
] as const;

export type GameSdkModuleDecision =
  | { mode: "required" }
  | { mode: "disabled"; reason: string };

export type GameSdkModuleProfile = Record<
  GameSdkModuleId,
  GameSdkModuleDecision
>;

const moduleIdSet = new Set<string>(GAME_SDK_MODULE_IDS);
const platformLockedModuleIdSet = new Set<GameSdkModuleId>([
  "authentication",
  "account-session",
  "authorization",
  "persistence",
  "observability",
  "common-navigation",
  "player-menu",
]);

export function createInitialGameSdkModuleProfile(): GameSdkModuleProfile {
  return Object.fromEntries(
    GAME_SDK_MODULE_IDS.map((id) => [id, { mode: "required" }]),
  ) as GameSdkModuleProfile;
}

export function normalizeGameSdkModuleProfile(
  value: unknown,
): GameSdkModuleProfile {
  const profile = createInitialGameSdkModuleProfile();
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return profile;
  }
  const input = value as Record<string, unknown>;
  for (const definition of GAME_SDK_MODULE_CATALOG) {
    if (platformLockedModuleIdSet.has(definition.id)) continue;
    const decision = input[definition.id];
    if (!decision || typeof decision !== "object" || Array.isArray(decision)) {
      continue;
    }
    const candidate = decision as Record<string, unknown>;
    if (candidate.mode !== "disabled") continue;
    const reason = typeof candidate.reason === "string"
      ? candidate.reason.trim().slice(0, 240)
      : "";
    if (reason) profile[definition.id] = { mode: "disabled", reason };
  }
  return profile;
}

export function updateGameSdkModuleProfile(
  current: unknown,
  updates: unknown,
): GameSdkModuleProfile {
  const profile = normalizeGameSdkModuleProfile(current);
  if (!updates || typeof updates !== "object" || Array.isArray(updates)) {
    throw new Error("GAME_SDK_MODULE_UPDATES_REQUIRED");
  }
  for (const [rawId, rawDecision] of Object.entries(
    updates as Record<string, unknown>,
  )) {
    if (!moduleIdSet.has(rawId)) {
      throw new Error("GAME_SDK_UNKNOWN_MODULE");
    }
    const id = rawId as GameSdkModuleId;
    if (platformLockedModuleIdSet.has(id)) {
      throw new Error("GAME_SDK_MODULE_PLATFORM_LOCKED");
    }
    if (
      !rawDecision
      || typeof rawDecision !== "object"
      || Array.isArray(rawDecision)
    ) {
      throw new Error("GAME_SDK_INVALID_MODULE_DECISION");
    }
    const decision = rawDecision as Record<string, unknown>;
    if (decision.mode === "required") {
      profile[id] = { mode: "required" };
      continue;
    }
    if (decision.mode !== "disabled") {
      throw new Error("GAME_SDK_INVALID_MODULE_DECISION");
    }
    const reason = typeof decision.reason === "string"
      ? decision.reason.trim().slice(0, 240)
      : "";
    if (!reason) throw new Error("GAME_SDK_MODULE_REASON_REQUIRED");
    profile[id] = { mode: "disabled", reason };
  }
  return profile;
}

export function requiredGameSdkModuleIds(profile: unknown) {
  const normalized = normalizeGameSdkModuleProfile(profile);
  return GAME_SDK_MODULE_IDS.filter(
    (id) => normalized[id].mode === "required",
  );
}

export function gameSdkModuleIsRequired(
  profile: unknown,
  id: GameSdkModuleId,
) {
  return normalizeGameSdkModuleProfile(profile)[id].mode === "required";
}

export type BuiltInGameReplayGameType = "wordwolf" | "tahoiya" | "northern-branch" | "hodoai" | "kotoba-senpuku" | "nigoichi" | "code-intercept" | "daifugo" | "wordwolf-sdk";
export type GameSdkReplayGameType = `sdk:${string}`;
export type GameReplayGameType =
  | BuiltInGameReplayGameType
  | GameSdkReplayGameType;

export type GameReplayPolicy = {
  retentionDays: number;
  favoriteLimit: number;
};

export type GameReplaySummary = {
  id: string;
  gameType: GameReplayGameType;
  finishedAt: number;
  expiresAt: number;
  favorite: boolean;
  title: string;
  resultLabel: string;
  playerCount: number;
  round: number;
  shareHighlights: string[];
};

export type GameReplayScore = {
  playerName: string;
  scoreLabel: string;
  isViewer: boolean;
};

export type GenericGameReplayDetail = GameReplaySummary & {
  gameType: Exclude<GameReplayGameType, "tahoiya">;
  overview: string;
  highlights: string[];
  scores: GameReplayScore[];
};

export type TahoiyaReplayDefinition = {
  id: string;
  text: string;
  isReal: boolean;
  authorName: string | null;
  isMine: boolean;
  voteCount: number;
  voterNames: string[];
};

export type TahoiyaReplayScore = {
  playerName: string;
  points: number;
  isViewer: boolean;
};

export type TahoiyaReplayDetail = GameReplaySummary & {
  gameType: "tahoiya";
  reading?: string;
  realDefinition: string;
  resultText: string;
  definitions: TahoiyaReplayDefinition[];
  scores: TahoiyaReplayScore[];
  viewerVoteDefinitionId?: string;
};

export type GameReplayDetail = GenericGameReplayDetail | TahoiyaReplayDetail;

export type GameReplayListResponse = {
  replays: GameReplaySummary[];
  policy: GameReplayPolicy;
  favoriteCount: number;
};

type TahoiyaReplayHighlightSource = {
  definitions: Array<{ id: string; text: string; isReal: boolean }>;
  playerId: string;
  realDefinition: string;
  scores: Record<string, number>;
  votes: Record<string, string>;
};

/** Uses the same stored definitions, votes, and scores as the Tahoiya detail view. */
export function tahoiyaReplaySummaryHighlights({
  definitions,
  playerId,
  realDefinition,
  scores,
  votes,
}: TahoiyaReplayHighlightSource) {
  const selectedDefinitionId = votes[playerId];
  const definitionHighlights = definitions.map((definition) => {
    const voteCount = Object.values(votes).filter((definitionId) => definitionId === definition.id).length;
    const selectedLabel = definition.id === selectedDefinitionId ? "・あなたが選択" : "";
    return `${definition.isReal ? "本物の説明" : "偽説明"}「${definition.text}」（${voteCount}票${selectedLabel}）`;
  });

  return [
    ...(definitionHighlights.length > 0 ? definitionHighlights : [`本物の説明「${realDefinition}」`]),
    `あなたの得点 ${Math.max(0, Math.floor(scores[playerId] ?? 0))}点`,
  ];
}

export const gameReplayMetadata: Record<BuiltInGameReplayGameType, { title: string; href: string }> = {
  wordwolf: { title: "ワードウルフ", href: "/wordwolf" },
  tahoiya: { title: "たほい屋", href: "/tahoiya" },
  "northern-branch": { title: "ノーザンブランチ", href: "/northern-branch" },
  hodoai: { title: "ワードスケール", href: "/word-scale" },
  "kotoba-senpuku": { title: "ワードソナー", href: "/word-sonar" },
  nigoichi: { title: "ワードアウト", href: "/word-out" },
  "code-intercept": { title: "コードインターセプト", href: "/games/code-intercept" },
  daifugo: { title: "大富豪", href: "/daifugo" },
  "wordwolf-sdk": { title: "ワードウルフ SDK", href: "/sdk-games/wordwolf-sdk" },
};

function isGameSdkReplayGameType(
  gameType: GameReplayGameType,
): gameType is GameSdkReplayGameType {
  return gameType.startsWith("sdk:");
}

export function gameReplayMetadataFor(
  gameType: GameReplayGameType,
  fallbackTitle = "SDKゲーム",
) {
  if (isGameSdkReplayGameType(gameType)) {
    return {
      title: fallbackTitle,
      href: `/sdk-games/${gameType.slice("sdk:".length)}`,
    };
  }
  return gameReplayMetadata[gameType];
}

export function gameReplayShareText(
  replay: Pick<GameReplaySummary, "gameType" | "title" | "resultLabel" | "shareHighlights">,
) {
  const gameTitle = gameReplayMetadataFor(replay.gameType, replay.title).title;
  const highlights = replay.shareHighlights.slice(0, 3).map((highlight) => `・${highlight}`);
  return [
    `${gameTitle}のプレイバック`,
    replay.title,
    replay.resultLabel,
    ...highlights,
    "#GameFields",
  ].filter(Boolean).join("\n");
}

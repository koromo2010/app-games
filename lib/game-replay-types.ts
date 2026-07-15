export type GameReplayGameType = "wordwolf" | "tahoiya" | "northern-branch" | "hodoai" | "kotoba-senpuku" | "nigoichi" | "code-intercept";

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

export const gameReplayMetadata: Record<GameReplayGameType, { title: string; href: string }> = {
  wordwolf: { title: "ワードウルフ", href: "/wordwolf" },
  tahoiya: { title: "たほい屋", href: "/tahoiya" },
  "northern-branch": { title: "ノーザンブランチ", href: "/northern-branch" },
  hodoai: { title: "ワードスケール", href: "/word-scale" },
  "kotoba-senpuku": { title: "ことばソナー", href: "/word-sonar" },
  nigoichi: { title: "ワードアウト", href: "/word-out" },
  "code-intercept": { title: "暗号傍受（仮）", href: "/code-intercept" },
};

export function gameReplayShareText(
  replay: Pick<GameReplaySummary, "gameType" | "title" | "resultLabel" | "shareHighlights">,
) {
  const gameTitle = gameReplayMetadata[replay.gameType].title;
  const highlights = replay.shareHighlights.slice(0, 3).map((highlight) => `・${highlight}`);
  return [
    `${gameTitle}のプレイバック`,
    replay.title,
    replay.resultLabel,
    ...highlights,
    "#GameFields",
  ].filter(Boolean).join("\n");
}

export type GameReplayGameType = "tahoiya";

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

export type GameReplayListResponse = {
  replays: GameReplaySummary[];
  policy: GameReplayPolicy;
  favoriteCount: number;
};

export function gameReplayShareText(replay: Pick<GameReplaySummary, "gameType" | "title" | "resultLabel">) {
  const gameTitle = replay.gameType === "tahoiya" ? "たほい屋" : replay.gameType;
  return `${gameTitle}「${replay.title}」をプレイ！ ${replay.resultLabel}\n#GameFields`;
}

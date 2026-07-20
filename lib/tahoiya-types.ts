import type { GameGenerationMeta } from "@/lib/game-ai-types";
import type { PlayerTimeoutFields } from "./player-timeout-policy.ts";
import type { RoomLobbyReturnAction, RoomLobbyReturnState } from "./room-lobby-return.ts";
import type { AppLocale } from "./app-locale.ts";

export type TahoiyaPhase = "lobby" | "writing" | "voting" | "result";
export type TahoiyaAnswererMode = "manual" | "random";
export type TahoiyaPlayMode = "single-answerer" | "all-vote";
export type TahoiyaDifficulty = "standard" | "extreme";
export type TahoiyaTopicGenerationStage =
  | "checking-reusable"
  | "checking-screened"
  | "screening-new"
  | "generating-definition"
  | "finalizing";

export type TahoiyaTopicGenerationProgress = {
  id: string;
  stage: TahoiyaTopicGenerationStage;
  batchNumber?: number;
  batchLimit?: number;
  newCandidateFlow?: boolean;
  startedAt: number;
  updatedAt: number;
};

export type TahoiyaPlayer = {
  id: string;
  name: string;
  joinedAt: number;
  avatarColor?: string;
  avatarImage?: string;
};

export type TahoiyaTopic = {
  word: string;
  reading?: string;
  realDefinition: string;
  note: string;
  sourceDetail: string;
  source: "llm" | "fallback";
  notice?: string;
  generation?: GameGenerationMeta;
};

export type TahoiyaDefinitionOption = {
  id: string;
  text: string;
  authorId: string | null;
  isReal: boolean;
};

export type TahoiyaRoom = PlayerTimeoutFields & {
  code: string;
  contentLocale?: AppLocale;
  revision: number;
  hostId: string;
  ownerId?: string;
  passphrase: string;
  phase: TahoiyaPhase;
  debugMode?: boolean;
  debugReplayEnabled?: boolean;
  lobbyReturn?: RoomLobbyReturnState;
  players: TahoiyaPlayer[];
  parentId: string;
  playMode: TahoiyaPlayMode;
  topicDifficulty: TahoiyaDifficulty;
  answererMode: TahoiyaAnswererMode;
  showRealDefinitionToWriters: boolean;
  fakeDefinitionsPerPlayer: number;
  actionTimeLimitSeconds: number;
  correctVotePoints: number;
  fooledVotePoints: number;
  phaseStartedAt: number | null;
  answererId: string;
  round: number;
  gameStartedAt?: number | null;
  word: string;
  reading?: string;
  realDefinition: string;
  topicNote: string;
  topicSourceDetail: string;
  topicSource: TahoiyaTopic["source"] | "pending";
  topicGeneration?: GameGenerationMeta;
  topicGenerationProgress?: TahoiyaTopicGenerationProgress;
  fakeDefinitions: Record<string, string[]>;
  options: TahoiyaDefinitionOption[];
  votes: Record<string, string>;
  scores: Record<string, number>;
  resultText: string;
  createdAt: number;
  updatedAt: number;
};

export type TahoiyaLobbyConfig = Pick<TahoiyaRoom,
  | "playMode"
  | "topicDifficulty"
  | "answererMode"
  | "showRealDefinitionToWriters"
  | "fakeDefinitionsPerPlayer"
  | "actionTimeLimitSeconds"
  | "answererId"
>;

export type TahoiyaRoomAction = RoomLobbyReturnAction
  | { type: "abort-game"; actorId: string }
  | { type: "recover-player"; actorId: string }
  | { type: "update-config"; actorId: string; config: Partial<TahoiyaLobbyConfig> }
  | { type: "set-debug"; actorId: string; enabled: boolean }
  | { type: "set-debug-replay"; actorId: string; enabled: boolean }
  | { type: "debug-add-player"; actorId: string }
  | { type: "next-round"; actorId: string }
  | { type: "debug-replace-topic"; actorId: string; round: number; topic: TahoiyaTopic }
  | { type: "submit-definition"; actorId: string; playerId: string; round: number; definitionIndex: number; text: string }
  | { type: "cast-vote"; actorId: string; playerId: string; round: number; optionId: string }
  | { type: "advance-phase"; actorId: string; round: number; target: "voting" | "result"; force?: boolean }
  | { type: "debug-fill-definitions"; actorId: string; round: number }
  | { type: "debug-fill-votes"; actorId: string; round: number };

export type TahoiyaRoomChoice = {
  code: string;
  contentLocale?: AppLocale;
  hostName: string;
  playerCount: number;
  phase: TahoiyaPhase;
  hasPassphrase: boolean;
  updatedAt: number;
};

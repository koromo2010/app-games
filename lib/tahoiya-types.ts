export type TahoiyaPhase = "lobby" | "writing" | "voting" | "result";
export type TahoiyaAnswererMode = "manual" | "random";
export type TahoiyaPlayMode = "single-answerer" | "all-vote";

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

export type TahoiyaRoom = {
  code: string;
  hostId: string;
  ownerId?: string;
  passphrase: string;
  phase: TahoiyaPhase;
  debugMode?: boolean;
  players: TahoiyaPlayer[];
  parentId: string;
  playMode: TahoiyaPlayMode;
  answererMode: TahoiyaAnswererMode;
  showRealDefinitionToWriters: boolean;
  actionTimeLimitSeconds: number;
  phaseStartedAt: number | null;
  answererId: string;
  round: number;
  word: string;
  reading?: string;
  realDefinition: string;
  topicNote: string;
  topicSourceDetail: string;
  topicSource: TahoiyaTopic["source"] | "pending";
  topicGeneration?: GameGenerationMeta;
  fakeDefinitions: Record<string, string>;
  options: TahoiyaDefinitionOption[];
  votes: Record<string, string>;
  scores: Record<string, number>;
  resultText: string;
  createdAt: number;
  updatedAt: number;
};

export type TahoiyaRoomChoice = {
  code: string;
  hostName: string;
  playerCount: number;
  phase: TahoiyaPhase;
  hasPassphrase: boolean;
  updatedAt: number;
};
import type { GameGenerationMeta } from "@/lib/game-ai-types";

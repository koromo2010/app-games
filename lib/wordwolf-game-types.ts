import type { TopicDictionarySource, TopicPairDistance, TopicSourceMode, WordWolfTopic } from "@/lib/wordwolf";
import type { WordWolfGuessJudgement } from "@/lib/wordwolf-guess-judgement";

export type Phase = "lobby" | "clue" | "vote" | "wolfGuess" | "result";
export type ClueLogVisibility = "always" | "result";
export type ClueMode = "turn" | "simultaneous";
export type GameMode = "wordwolf" | "may-no-wolf";

export type Player = {
  id: string;
  name: string;
  joinedAt: number;
  avatarColor?: string;
  avatarImage?: string;
};

export type Clue = {
  playerId: string;
  round: number;
  text: string;
  at: number;
};

export type VoteRound = {
  round: number;
  votes: Record<string, string>;
  candidateIds: string[];
  at: number;
};

export type Room = {
  code: string;
  hostId: string;
  ownerId?: string;
  passphrase: string;
  phase: Phase;
  gameMode: GameMode;
  debugMode?: boolean;
  clueLogVisibility: ClueLogVisibility;
  clueMode: ClueMode;
  randomizeTurnOrder: boolean;
  players: Player[];
  roundsTotal: number;
  turnTimeLimitSeconds: number;
  currentRound: number;
  currentTurnIndex: number;
  currentTurnStartedAt: number | null;
  wolfId: string | null;
  wolfIds: string[];
  wolfCount: number;
  villageWord: string;
  wolfWord: string;
  topicReason: string;
  topicSource: WordWolfTopic["source"] | "pending";
  topicFallbackExhausted: boolean;
  topicDictionarySource: TopicDictionarySource;
  topicPairDistance: TopicPairDistance;
  topicHint: string;
  topicSourceMode?: TopicSourceMode;
  clues: Clue[];
  votes: Record<string, string>;
  voteHistory: VoteRound[];
  runoffCandidateIds: string[] | null;
  accusedId: string | null;
  wolfGuess: string;
  wolfGuessJudgement: WordWolfGuessJudgement | null;
  winner: "village" | "wolf" | "players" | null;
  resultText: string;
  scores: Record<string, number>;
  gamesPlayed: number;
  gameNumber: number;
  statsRecordedAt?: number;
  createdAt: number;
  updatedAt: number;
};

export type RoomChoice = {
  code: string;
  hostName: string;
  playerCount: number;
  roundsTotal: number;
  hasPassphrase: boolean;
  updatedAt: number;
};

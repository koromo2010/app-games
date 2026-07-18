import type { GameGenerationMeta } from "@/lib/game-ai-types";
import type { WordDifficulty } from "./word-selection-protocol.ts";

export type TopicDictionarySource = "ja-daily" | "en-common" | "curated-pairs" | "llm" | "proper-noun";

export type TopicPairDistance = "near" | "balanced" | "wide";


export type TopicSourceMode =
  | "ja-daily-near"
  | "ja-daily-balanced"
  | "ja-daily-wide"
  | "en-common-near"
  | "en-common-balanced"
  | "en-common-wide"
  | "curated-pairs"
  | "llm"
  | "proper-noun";

export type WordWolfTopic = {
  villageWord: string;
  wolfWord: string;
  reason: string;
  source: "llm" | "fallback";
  fallbackExhausted?: boolean;
  notice?: string;
  generation?: GameGenerationMeta;
  dictionarySource?: TopicDictionarySource;
  pairDistance?: TopicPairDistance;
  difficulty?: WordDifficulty;
  sourceMode?: TopicSourceMode;
  anchorWordId?: string;
  partnerWordId?: string;
  anchorWord?: string;
  commonEffectiveZipf?: number;
  wordwolfEffectiveZipf?: number;
  debugTrace?: WordWolfDebugTrace;
};

export type WordWolfDebugCandidateTrace = {
  wordId: string;
  surface: string;
  reading: string;
  zipfFrequency: number;
  decision: "accept" | "reject";
  usagePenalty: number;
  wordwolfPenalty: number;
  safetyFlags: string[];
  partner: string | null;
  pairReason: string;
  reasonCode: string;
  wordwolfEffectiveZipf: number;
  selectionWeight: number;
  outcome: "eligible" | "rejected" | "filtered" | "selected";
  outcomeReason: string;
  evaluationPersisted: boolean;
  draftPersisted: boolean;
};

export type WordWolfDebugTrace = {
  pipeline: "shared-pair" | "catalog-rag" | "direct-llm" | "local";
  difficulty: WordDifficulty;
  targetZipf: number;
  width: number;
  batchSize: number;
  candidateCount: number;
  retrievedFeedbackCount: number;
  attemptedProviders: string[];
  selectedWordId?: string;
  candidates?: WordWolfDebugCandidateTrace[];
};

export type TopicCandidate = Omit<WordWolfTopic, "source">;

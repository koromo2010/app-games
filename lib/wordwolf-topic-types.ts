import type { GameGenerationMeta } from "@/lib/game-ai-types";
import type { WordDifficulty } from "@/lib/word-selection-protocol";

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
  sourceMode?: TopicSourceMode;
  difficulty?: WordDifficulty;
  anchorWordMasterId?: number;
  partnerWordMasterId?: number;
  anchorWord?: string;
  commonEffectiveZipf?: number;
  wordwolfEffectiveZipf?: number;
};

export type WordWolfDebugCandidateTrace = {
  wordMasterId: number;
  surface: string;
  reading: string;
  zipfFrequency: number;
  storedUsagePenalty: number;
  storedWordwolfPenalty: number;
  storedFeedbackAdjustment: number;
  storedEffectiveZipf: number;
  currentFeedbackAdjustment: number;
  decision: "accept" | "reject";
  usagePenalty: number;
  wordwolfPenalty: number;
  safetyFlags: string[];
  partner: string | null;
  partnerWordMasterId: number | null;
  pairReason: string;
  reasonCode: string;
  commonEffectiveZipf: number;
  wordwolfEffectiveZipf: number;
  selectionWeight: number;
  outcome: "selected" | "eligible" | "rejected" | "filtered";
  outcomeReason: string;
  evaluationPersisted: boolean;
};

export type WordWolfDebugTrace = {
  pipeline: "catalog-reuse" | "local-candidate" | "catalog-rag" | "direct-llm" | "local-fallback";
  forceNew: boolean;
  difficulty: WordDifficulty;
  targetZipf: number;
  width: number;
  batchSize: number;
  requestExcludedCount: number;
  experiencedExcludedCount: number;
  catalogExcludedCount: number;
  totalExcludedCount: number;
  retrievedFeedbackCount: number;
  candidateCount: number;
  attemptedProviders: Array<"openai" | "gemini" | "groq">;
  selectedWordMasterId?: number;
  candidates: WordWolfDebugCandidateTrace[];
};

export type WordWolfDebugTopicResponse = WordWolfTopic & {
  debugTrace?: WordWolfDebugTrace;
  error?: string;
};

export type TopicCandidate = Omit<WordWolfTopic, "source">;

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

export type TopicCandidate = Omit<WordWolfTopic, "source">;

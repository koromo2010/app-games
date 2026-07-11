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
  dictionarySource?: TopicDictionarySource;
  pairDistance?: TopicPairDistance;
  sourceMode?: TopicSourceMode;
};

export type TopicCandidate = Omit<WordWolfTopic, "source">;

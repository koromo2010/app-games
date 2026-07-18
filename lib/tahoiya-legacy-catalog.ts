import { normalizeGameGenerationMeta } from "./game-ai-types.ts";
import { hasVeryCommonSpokenHomophone } from "./tahoiya-difficulty.ts";
import type { TahoiyaTopic } from "./tahoiya-types.ts";

export const legacyTahoiyaCatalogKey = "tahoiya:topic:catalog:v1";

export type LegacyTahoiyaTopicCatalogRecord = {
  topic: TahoiyaTopic;
  difficulty: "easy" | "standard" | "extreme";
  experiencedPlayerIds: string[];
  createdAt: number;
  lastUsedAt: number;
  useCount: number;
  genre?: string;
  sourceLibrary?: string;
  sourceUrl?: string;
  difficultyReason?: string;
  difficultyJudgedBy?: string;
  difficultyEvaluation?: "absolute";
  difficultyRubricVersion?: string;
  feedbackAnchorTags?: string[];
  difficultyFeedbackIds?: string[];
};

export function parseLegacyTahoiyaCatalogRecord(value: string): LegacyTahoiyaTopicCatalogRecord | null {
  try {
    const parsed = JSON.parse(value) as Partial<LegacyTahoiyaTopicCatalogRecord>;
    if (!parsed.topic?.word || !parsed.topic.realDefinition) return null;
    return {
      topic: {
        ...parsed.topic,
        generation: normalizeGameGenerationMeta(parsed.topic.generation),
      },
      difficulty: hasVeryCommonSpokenHomophone(parsed.topic.reading)
        ? "easy"
        : parsed.difficulty === "easy" || parsed.difficulty === "extreme" ? parsed.difficulty : "standard",
      experiencedPlayerIds: Array.isArray(parsed.experiencedPlayerIds)
        ? parsed.experiencedPlayerIds.filter((id): id is string => typeof id === "string" && Boolean(id))
        : [],
      createdAt: typeof parsed.createdAt === "number" ? parsed.createdAt : Date.now(),
      lastUsedAt: typeof parsed.lastUsedAt === "number" ? parsed.lastUsedAt : 0,
      useCount: typeof parsed.useCount === "number" ? Math.max(0, Math.floor(parsed.useCount)) : 0,
      genre: typeof parsed.genre === "string" ? parsed.genre : undefined,
      sourceLibrary: typeof parsed.sourceLibrary === "string" ? parsed.sourceLibrary : undefined,
      sourceUrl: typeof parsed.sourceUrl === "string" ? parsed.sourceUrl : undefined,
      difficultyReason: typeof parsed.difficultyReason === "string" ? parsed.difficultyReason : undefined,
      difficultyJudgedBy: typeof parsed.difficultyJudgedBy === "string" ? parsed.difficultyJudgedBy : undefined,
      difficultyEvaluation: parsed.difficultyEvaluation === "absolute" ? "absolute" : undefined,
      difficultyRubricVersion: typeof parsed.difficultyRubricVersion === "string" ? parsed.difficultyRubricVersion : undefined,
      feedbackAnchorTags: Array.isArray(parsed.feedbackAnchorTags)
        ? parsed.feedbackAnchorTags.filter((tag): tag is string => typeof tag === "string")
        : undefined,
      difficultyFeedbackIds: Array.isArray(parsed.difficultyFeedbackIds)
        ? parsed.difficultyFeedbackIds.filter((id): id is string => typeof id === "string").slice(0, 20)
        : undefined,
    };
  } catch {
    return null;
  }
}

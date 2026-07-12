export type GameGenerationMeta = {
  provider: "openai" | "gemini" | "groq" | "local";
  model: string;
  mode: "paid" | "free" | "local";
  promptVersion: string;
  latencyMs: number;
  retrievedFeedbackIds: string[];
  reviewProvider?: "openai" | "gemini" | "groq" | "local";
  reviewModel?: string;
  reusedFromCatalog?: boolean;
};

export type GameFeedbackRating = "good" | "bad";

export type GameFeedbackRecord = {
  id: string;
  artifactId: string;
  artifactText: string;
  game: string;
  task: string;
  rating: GameFeedbackRating;
  reasonTags: string[];
  comment: string;
  playerId: string;
  generation: GameGenerationMeta;
  settings: Record<string, string | number | boolean>;
  outcome: Record<string, string | number | boolean>;
  createdAt: number;
  updatedAt: number;
};

export function normalizeGameGenerationMeta(value: unknown): GameGenerationMeta | undefined {
  if (!value || typeof value !== "object") return undefined;
  const parsed = value as Partial<GameGenerationMeta>;
  const provider =
    parsed.provider === "openai" || parsed.provider === "gemini" || parsed.provider === "groq" || parsed.provider === "local"
      ? parsed.provider
      : "local";
  const mode = parsed.mode === "paid" || parsed.mode === "free" || parsed.mode === "local" ? parsed.mode : "local";

  return {
    provider,
    model: typeof parsed.model === "string" ? parsed.model.slice(0, 100) : "local",
    mode,
    promptVersion: typeof parsed.promptVersion === "string" ? parsed.promptVersion.slice(0, 100) : "unknown",
    latencyMs: typeof parsed.latencyMs === "number" ? Math.max(0, Math.round(parsed.latencyMs)) : 0,
    retrievedFeedbackIds: Array.isArray(parsed.retrievedFeedbackIds)
      ? parsed.retrievedFeedbackIds.filter((id): id is string => typeof id === "string").slice(0, 20)
      : [],
    reviewProvider:
      parsed.reviewProvider === "openai" || parsed.reviewProvider === "gemini" || parsed.reviewProvider === "groq" || parsed.reviewProvider === "local"
        ? parsed.reviewProvider
        : undefined,
    reviewModel: typeof parsed.reviewModel === "string" ? parsed.reviewModel.slice(0, 100) : undefined,
    reusedFromCatalog: parsed.reusedFromCatalog === true ? true : undefined,
  };
}

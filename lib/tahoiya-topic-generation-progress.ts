import type { TahoiyaTopicGenerationProgress, TahoiyaTopicGenerationStage } from "./tahoiya-types.ts";

export const tahoiyaTopicGenerationProgressStaleMs = 4 * 60 * 1000;

const stages = new Set<TahoiyaTopicGenerationStage>([
  "checking-reusable",
  "checking-screened",
  "screening-new",
  "generating-definition",
  "finalizing",
]);

export function normalizeTahoiyaTopicGenerationProgress(value: unknown): TahoiyaTopicGenerationProgress | undefined {
  if (!value || typeof value !== "object") return undefined;
  const parsed = value as Partial<TahoiyaTopicGenerationProgress>;
  if (
    typeof parsed.id !== "string"
    || !parsed.id.trim()
    || !stages.has(parsed.stage as TahoiyaTopicGenerationStage)
    || typeof parsed.startedAt !== "number"
    || !Number.isFinite(parsed.startedAt)
    || typeof parsed.updatedAt !== "number"
    || !Number.isFinite(parsed.updatedAt)
  ) return undefined;
  const batchLimit = typeof parsed.batchLimit === "number" && Number.isFinite(parsed.batchLimit)
    ? Math.max(1, Math.floor(parsed.batchLimit))
    : undefined;
  const batchNumber = typeof parsed.batchNumber === "number" && Number.isFinite(parsed.batchNumber)
    ? Math.max(1, Math.min(batchLimit ?? Number.MAX_SAFE_INTEGER, Math.floor(parsed.batchNumber)))
    : undefined;
  return {
    id: parsed.id.trim().slice(0, 80),
    stage: parsed.stage as TahoiyaTopicGenerationStage,
    batchNumber,
    batchLimit,
    newCandidateFlow: parsed.newCandidateFlow === true,
    startedAt: parsed.startedAt,
    updatedAt: parsed.updatedAt,
  };
}

export function isTahoiyaTopicGenerationProgressFresh(
  progress: TahoiyaTopicGenerationProgress | undefined,
  now = Date.now(),
) {
  return Boolean(progress && now - progress.updatedAt < tahoiyaTopicGenerationProgressStaleMs);
}

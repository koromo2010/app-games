export type WordDifficulty = "easy" | "normal" | "hard";

export type WordSelectionHyperparameters = {
  batchSize: number;
  difficulties: Record<WordDifficulty, { targetZipf: number; width: number }>;
  penaltySteps: readonly number[];
  feedbackAdjustmentLimit: number;
  feedbackMinimumSamples: number;
};

export const wordSelectionProtocolVersion = "word-selection-v1";

export const defaultWordSelectionHyperparameters: WordSelectionHyperparameters = {
  batchSize: 3,
  difficulties: {
    easy: { targetZipf: 6, width: 0.5 },
    normal: { targetZipf: 5, width: 0.5 },
    hard: { targetZipf: 4, width: 0.5 },
  },
  penaltySteps: [0, 0.5, 1, 1.5],
  feedbackAdjustmentLimit: 0.5,
  feedbackMinimumSamples: 5,
};

export function normalizeWordDifficulty(value: unknown): WordDifficulty {
  return value === "easy" || value === "hard" ? value : "normal";
}

function finite(value: number, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

export function clampFeedbackAdjustment(
  value: number,
  hyperparameters = defaultWordSelectionHyperparameters,
) {
  const limit = hyperparameters.feedbackAdjustmentLimit;
  return Math.max(-limit, Math.min(limit, finite(value)));
}

export function isAllowedWordPenalty(
  value: unknown,
  hyperparameters = defaultWordSelectionHyperparameters,
): value is number {
  return typeof value === "number" && hyperparameters.penaltySteps.includes(value);
}

export function commonEffectiveZipf(input: {
  zipfFrequency: number;
  usagePenalty: number;
  feedbackAdjustment?: number;
}, hyperparameters = defaultWordSelectionHyperparameters) {
  return finite(input.zipfFrequency) - finite(input.usagePenalty)
    + clampFeedbackAdjustment(input.feedbackAdjustment ?? 0, hyperparameters);
}

export function gameEffectiveZipf(input: {
  zipfFrequency: number;
  usagePenalty: number;
  gamePenalty: number;
  feedbackAdjustment?: number;
}, hyperparameters = defaultWordSelectionHyperparameters) {
  return commonEffectiveZipf(input, hyperparameters) - finite(input.gamePenalty);
}

export function wordSelectionWeight(
  effectiveZipf: number,
  difficulty: WordDifficulty,
  hyperparameters = defaultWordSelectionHyperparameters,
) {
  const { targetZipf, width } = hyperparameters.difficulties[difficulty];
  if (!Number.isFinite(effectiveZipf) || width <= 0) return 0;
  const distance = (effectiveZipf - targetZipf) / width;
  return Math.exp(-0.5 * distance * distance);
}

export function feedbackAdjustmentFromCounts(
  goodCount: number,
  badCount: number,
  hyperparameters = defaultWordSelectionHyperparameters,
) {
  const good = Math.max(0, Math.floor(finite(goodCount)));
  const bad = Math.max(0, Math.floor(finite(badCount)));
  const total = good + bad;
  if (total < hyperparameters.feedbackMinimumSamples) return 0;
  const confidence = Math.min(1, total / 20);
  const balance = (good - bad) / total;
  return clampFeedbackAdjustment(balance * hyperparameters.feedbackAdjustmentLimit * confidence, hyperparameters);
}

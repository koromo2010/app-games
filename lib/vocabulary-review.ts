export type VocabularyEvaluationDecision = "accept" | "reject";

export function resolveVocabularyEvaluationDecision(
  llmDecision: VocabularyEvaluationDecision,
  acceptCount: number,
  rejectCount: number,
): VocabularyEvaluationDecision {
  if (acceptCount > rejectCount) return "accept";
  if (rejectCount > acceptCount) return "reject";
  return llmDecision;
}

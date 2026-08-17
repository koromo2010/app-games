import type { WordwolfPartnerBatchResult } from "./wordwolf-partner-generation.ts";
import type { TopicPairDistance } from "./wordwolf-topic-types.ts";
import {
  assertVocabularyDraftWriteAllowed,
  getVocabularyPostgresClient,
} from "./vocabulary-postgres-store.ts";

export {
  findActiveVocabularyWordId,
  findActiveVocabularyWordwolfPair,
  loadVocabularyWordCandidates,
  type VocabularyWordCandidate,
} from "./wordwolf-content-source.ts";
import type { VocabularyWordCandidate } from "./wordwolf-content-source.ts";

/** Batch/admin-only evaluation write. Runtime reads live in wordwolf-content-source. */
export async function saveVocabularyWordwolfEvaluation(input: {
  candidate: VocabularyWordCandidate;
  result: WordwolfPartnerBatchResult;
  pairDistance: TopicPairDistance;
  partnerWordId: string | null;
  promptVersion: string;
  provider: string;
  model: string;
  feedbackAdjustment: number;
  generationBatchId: string;
}) {
  assertVocabularyDraftWriteAllowed();
  const sourceEnvironment = process.env.APP_ENV === "development" ? "development" : "batch";
  await getVocabularyPostgresClient()`
    INSERT INTO word_game_evaluations (
      word_id, game_id, requested_pair_distance, decision, usage_penalty, game_penalty,
      feedback_adjustment, safety_flags, reason_code, pair_reason,
      partner_text, partner_word_id, source_environment, provider, model,
      prompt_version, generation_batch_id
    ) VALUES (
      ${input.candidate.wordId}, 'wordwolf', ${input.pairDistance}, ${input.result.decision},
      ${input.result.usagePenalty}, ${input.result.wordwolfPenalty},
      ${input.feedbackAdjustment}, ${input.result.safetyFlags},
      ${input.result.reasonCode}, ${input.result.pairReason},
      ${input.result.partner}, ${input.partnerWordId}, ${sourceEnvironment},
      ${input.provider}, ${input.model}, ${input.promptVersion}, ${input.generationBatchId}
    )
  `;
}

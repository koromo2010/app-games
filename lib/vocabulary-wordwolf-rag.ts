import {
  defaultWordSelectionHyperparameters,
  gameEffectiveZipf,
  type WordDifficulty,
} from "./word-selection-protocol.ts";
import type { WordwolfPartnerBatchResult } from "./wordwolf-partner-generation.ts";
import type { TopicPairDistance } from "./wordwolf-topic-types.ts";
import {
  assertVocabularyDraftWriteAllowed,
  getVocabularyPostgresClient,
  isVocabularyPostgresConfigured,
} from "./vocabulary-postgres-store.ts";

export type VocabularyWordCandidate = {
  wordId: string;
  surface: string;
  reading: string;
  zipfFrequency: number;
  usagePenalty: number;
  wordwolfPenalty: number;
  feedbackAdjustment: number;
  effectiveZipf: number;
};

type CandidateRow = {
  id: string;
  surface: string;
  reading: string | null;
  zipf: number | string;
  usage_penalty: number | string | null;
  game_penalty: number | string | null;
  feedback_adjustment: number | string | null;
};

type ActivePairRow = {
  pair_id: string;
  word_a_id: string;
  word_b_id: string;
  word_a: string;
  word_b: string;
  reason: string | null;
};

function asNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function projectCandidate(row: CandidateRow): VocabularyWordCandidate {
  const zipfFrequency = asNumber(row.zipf);
  const usagePenalty = asNumber(row.usage_penalty);
  const wordwolfPenalty = asNumber(row.game_penalty);
  const feedbackAdjustment = asNumber(row.feedback_adjustment);
  return {
    wordId: row.id,
    surface: row.surface.trim(),
    reading: row.reading?.trim() ?? "",
    zipfFrequency,
    usagePenalty,
    wordwolfPenalty,
    feedbackAdjustment,
    effectiveZipf: gameEffectiveZipf({ zipfFrequency, usagePenalty, gamePenalty: wordwolfPenalty, feedbackAdjustment }),
  };
}

export async function loadVocabularyWordCandidates(input: {
  difficulty: WordDifficulty;
  pairDistance: TopicPairDistance;
  excludeWords?: string[];
  limit?: number;
}) {
  if (!isVocabularyPostgresConfigured()) return [];
  const sql = getVocabularyPostgresClient();
  const { targetZipf, width } = defaultWordSelectionHyperparameters.difficulties[input.difficulty];
  const limit = Math.max(1, Math.min(20, Math.floor(input.limit ?? defaultWordSelectionHyperparameters.batchSize)));
  const excluded = [...new Set((input.excludeWords ?? [])
    .map((word) => word.normalize("NFKC").trim().toLocaleLowerCase("ja"))
    .filter(Boolean))].slice(0, 1000);
  const rows = await sql`
    SELECT word.id, word.surface, word.reading, word.effective_zipf AS zipf,
      COALESCE(evaluation.usage_penalty, 0) AS usage_penalty,
      COALESCE(evaluation.game_penalty, 0) AS game_penalty,
      COALESCE(evaluation.feedback_adjustment, 0) AS feedback_adjustment
    FROM active_words word
    JOIN active_word_game_eligibility eligibility
      ON eligibility.subject_type = 'word'
      AND eligibility.subject_id = word.id
      AND eligibility.game_id = 'wordwolf'
    LEFT JOIN latest_word_game_evaluations evaluation
      ON evaluation.word_id = word.id
      AND evaluation.game_id = 'wordwolf'
      AND evaluation.requested_pair_distance = ${input.pairDistance}
    WHERE word.effective_zipf >= 3
      AND word.effective_zipf BETWEEN ${targetZipf - 1.5} AND ${targetZipf + 1.5}
      AND NOT word.proper_noun
      AND NOT (word.normalized_surface = ANY(${excluded}::text[]))
      AND COALESCE(evaluation.decision, 'accept') <> 'reject'
      AND (eligibility.valid_from IS NULL OR eligibility.valid_from <= NOW())
      AND (eligibility.valid_until IS NULL OR eligibility.valid_until > NOW())
    ORDER BY
      (-LN(GREATEST(RANDOM(), 0.000001))) /
      EXP(-0.5 * POWER(((word.effective_zipf
        - COALESCE(evaluation.usage_penalty, 0)
        - COALESCE(evaluation.game_penalty, 0)
        + COALESCE(evaluation.feedback_adjustment, 0)) - ${targetZipf}) / ${width}, 2)),
      word.id
    LIMIT ${limit}
  ` as CandidateRow[];
  return rows.map(projectCandidate).filter((item) => item.wordId && item.surface && item.zipfFrequency > 0);
}

export async function findActiveVocabularyWordId(surface: string) {
  if (!isVocabularyPostgresConfigured()) return null;
  const normalized = surface.normalize("NFKC").trim().toLocaleLowerCase("ja");
  if (!normalized) return null;
  const rows = await getVocabularyPostgresClient()`
    SELECT id FROM active_words
    WHERE normalized_surface = ${normalized}
    ORDER BY updated_at DESC LIMIT 1
  ` as Array<{ id: string }>;
  return rows[0]?.id ?? null;
}

export async function findActiveVocabularyWordwolfPair(input: {
  pairDistance: TopicPairDistance;
  difficulty: WordDifficulty;
  excludeWords?: string[];
}) {
  if (!isVocabularyPostgresConfigured()) return null;
  const excluded = [...new Set((input.excludeWords ?? [])
    .map((word) => word.normalize("NFKC").trim().toLocaleLowerCase("ja"))
    .filter(Boolean))].slice(0, 1000);
  const rows = await getVocabularyPostgresClient()`
    SELECT pair.id AS pair_id, pair.word_a_id, pair.word_b_id,
      word_a.surface AS word_a, word_b.surface AS word_b, pair.relation AS reason
    FROM active_word_pairs pair
    JOIN active_words word_a ON word_a.id = pair.word_a_id
    JOIN active_words word_b ON word_b.id = pair.word_b_id
    JOIN active_word_game_eligibility eligibility
      ON eligibility.subject_type = 'pair'
      AND eligibility.subject_id = pair.id
      AND eligibility.game_id = 'wordwolf'
    WHERE NOT (word_a.normalized_surface = ANY(${excluded}::text[]))
      AND NOT (word_b.normalized_surface = ANY(${excluded}::text[]))
      AND word_a.effective_zipf >= 3
      AND word_b.effective_zipf >= 3
      AND COALESCE(pair.pair_distance,
        CASE WHEN pair.difficulty IN ('near', 'balanced', 'wide') THEN pair.difficulty ELSE 'balanced' END
      ) = ${input.pairDistance}
      AND (pair.category IS NULL OR pair.category = ${input.difficulty})
      AND (eligibility.valid_from IS NULL OR eligibility.valid_from <= NOW())
      AND (eligibility.valid_until IS NULL OR eligibility.valid_until > NOW())
    ORDER BY RANDOM() LIMIT 1
  ` as ActivePairRow[];
  const row = rows[0];
  return row ? {
    pairId: row.pair_id,
    wordAId: row.word_a_id,
    wordBId: row.word_b_id,
    wordA: row.word_a,
    wordB: row.word_b,
    reason: row.reason ?? "共通点があり、話すと違いが見つかるペアです。",
  } : null;
}

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

import { getPostgresClient, isPostgresConfigured } from "@/lib/postgres-store";
import {
  defaultWordSelectionHyperparameters,
  gameEffectiveZipf,
  type WordDifficulty,
} from "@/lib/word-selection-protocol";
import type { WordwolfPartnerBatchResult } from "@/lib/wordwolf-partner-generation";

export type SharedWordCandidate = {
  wordMasterId: number;
  surface: string;
  reading: string;
  zipfFrequency: number;
  usagePenalty: number;
  wordwolfPenalty: number;
  feedbackAdjustment: number;
  effectiveZipf: number;
};

type CandidateRow = {
  word_master_id: string | number;
  surface: string;
  reading: string;
  zipf_frequency: string | number;
  usage_penalty?: string | number | null;
  game_penalty?: string | number | null;
  feedback_adjustment?: string | number | null;
};

function asNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function projectCandidate(row: CandidateRow): SharedWordCandidate {
  const zipfFrequency = asNumber(row.zipf_frequency);
  const usagePenalty = asNumber(row.usage_penalty);
  const wordwolfPenalty = asNumber(row.game_penalty);
  const feedbackAdjustment = asNumber(row.feedback_adjustment);
  return {
    wordMasterId: asNumber(row.word_master_id),
    surface: String(row.surface ?? "").trim(),
    reading: String(row.reading ?? "").trim(),
    zipfFrequency,
    usagePenalty,
    wordwolfPenalty,
    feedbackAdjustment,
    effectiveZipf: gameEffectiveZipf({ zipfFrequency, usagePenalty, gamePenalty: wordwolfPenalty, feedbackAdjustment }),
  };
}

export async function loadSharedWordCandidates(input: {
  difficulty: WordDifficulty;
  excludeWords?: string[];
  limit?: number;
}) {
  if (!isPostgresConfigured()) return [];
  const sql = getPostgresClient();
  const { targetZipf, width } = defaultWordSelectionHyperparameters.difficulties[input.difficulty];
  const limit = Math.max(1, Math.min(20, Math.floor(input.limit ?? defaultWordSelectionHyperparameters.batchSize)));
  const excluded = [...new Set((input.excludeWords ?? []).map((word) => word.trim().toLowerCase()).filter(Boolean))].slice(0, 1000);
  const hasEvaluationTable = await sql.query(
    "SELECT to_regclass('public.shared_word_game_evaluations') IS NOT NULL AS exists",
  ).then((rows) => Boolean(rows[0]?.exists)).catch(() => false);

  const rows = hasEvaluationTable
    ? await sql.query(`
        SELECT catalog.word_master_id, catalog.surface, catalog.reading, catalog.zipf_frequency,
               COALESCE(evaluation.usage_penalty, 0) AS usage_penalty,
               COALESCE(evaluation.game_penalty, 0) AS game_penalty,
               COALESCE(evaluation.feedback_adjustment, 0) AS feedback_adjustment
        FROM shared_word_catalog catalog
        LEFT JOIN shared_word_game_evaluations evaluation
          ON evaluation.word_master_id = catalog.word_master_id
         AND evaluation.game_type = 'wordwolf'
        WHERE catalog.active
          AND catalog.zipf_frequency BETWEEN $1 AND $2
          AND NOT (LOWER(catalog.surface) = ANY($3::text[]))
          AND COALESCE(evaluation.status, 'unreviewed') NOT IN ('disabled', 'excluded')
        ORDER BY
          (-LN(GREATEST(RANDOM(), 0.000001))) /
          EXP(-0.5 * POWER(((catalog.zipf_frequency
            - COALESCE(evaluation.usage_penalty, 0)
            - COALESCE(evaluation.game_penalty, 0)
            + COALESCE(evaluation.feedback_adjustment, 0)) - $4) / $5, 2)),
          catalog.word_master_id
        LIMIT $6
      `, [targetZipf - 1.5, targetZipf + 1.5, excluded, targetZipf, width, limit])
    : await sql.query(`
        SELECT word_master_id, surface, reading, zipf_frequency,
               0 AS usage_penalty, 0 AS game_penalty, 0 AS feedback_adjustment
        FROM shared_word_catalog
        WHERE active
          AND zipf_frequency BETWEEN $1 AND $2
          AND NOT (LOWER(surface) = ANY($3::text[]))
        ORDER BY
          (-LN(GREATEST(RANDOM(), 0.000001))) /
          EXP(-0.5 * POWER((zipf_frequency - $4) / $5, 2)),
          word_master_id
        LIMIT $6
      `, [targetZipf - 1.5, targetZipf + 1.5, excluded, targetZipf, width, limit]);

  return (rows as CandidateRow[]).map(projectCandidate).filter((item) => item.wordMasterId > 0 && item.surface);
}

export async function findSharedWordId(surface: string) {
  if (!isPostgresConfigured()) return null;
  const sql = getPostgresClient();
  const rows = await sql.query(`
    SELECT word_master_id
    FROM shared_word_catalog
    WHERE active AND surface = $1
    ORDER BY word_master_id
    LIMIT 1
  `, [surface.trim()]);
  const id = asNumber(rows[0]?.word_master_id);
  return id > 0 ? id : null;
}

export async function saveSharedWordwolfEvaluation(input: {
  candidate: SharedWordCandidate;
  result: WordwolfPartnerBatchResult;
  partnerWordMasterId: number | null;
  promptVersion: string;
  model: string;
  feedbackAdjustment: number;
}) {
  if (!isPostgresConfigured()) return;
  const sql = getPostgresClient();
  const status = input.result.decision === "accept"
    ? "accepted"
    : input.result.safetyFlags.length > 0 ? "excluded" : "disabled";
  await sql.query(`
    INSERT INTO shared_word_game_evaluations (
      word_master_id, game_type, usage_penalty, game_penalty,
      feedback_adjustment, status, reason_code, safety_flags,
      prompt_version, generation_model, reviewed_at, updated_at
    ) VALUES ($1, 'wordwolf', $2, $3, $4, $5, $6, $7::text[], $8, $9, NOW(), NOW())
    ON CONFLICT (word_master_id, game_type) DO UPDATE SET
      usage_penalty = EXCLUDED.usage_penalty,
      game_penalty = EXCLUDED.game_penalty,
      feedback_adjustment = EXCLUDED.feedback_adjustment,
      status = EXCLUDED.status,
      reason_code = EXCLUDED.reason_code,
      safety_flags = EXCLUDED.safety_flags,
      prompt_version = EXCLUDED.prompt_version,
      generation_model = EXCLUDED.generation_model,
      reviewed_at = NOW(),
      updated_at = NOW()
  `, [
    input.candidate.wordMasterId,
    input.result.usagePenalty,
    input.result.wordwolfPenalty,
    input.feedbackAdjustment,
    status,
    input.result.reasonCode,
    input.result.safetyFlags,
    input.promptVersion,
    input.model,
  ]);
  if (input.result.decision !== "accept" || !input.result.partner) return;
  await sql.query(`
    INSERT INTO shared_wordwolf_pairs (
      anchor_word_master_id, partner_word_master_id, partner_text,
      common_effective_zipf, wordwolf_effective_zipf, status,
      reason_code, pair_reason, prompt_version, generation_model,
      created_at, updated_at
    ) VALUES ($1, $2, $3, $4, $5, 'approved', $6, $7, $8, $9, NOW(), NOW())
    ON CONFLICT (anchor_word_master_id, partner_text) DO UPDATE SET
      partner_word_master_id = EXCLUDED.partner_word_master_id,
      common_effective_zipf = EXCLUDED.common_effective_zipf,
      wordwolf_effective_zipf = EXCLUDED.wordwolf_effective_zipf,
      status = 'approved',
      reason_code = EXCLUDED.reason_code,
      pair_reason = EXCLUDED.pair_reason,
      prompt_version = EXCLUDED.prompt_version,
      generation_model = EXCLUDED.generation_model,
      updated_at = NOW()
  `, [
    input.candidate.wordMasterId,
    input.partnerWordMasterId,
    input.result.partner,
    input.candidate.zipfFrequency - input.result.usagePenalty + input.feedbackAdjustment,
    input.candidate.zipfFrequency - input.result.usagePenalty - input.result.wordwolfPenalty + input.feedbackAdjustment,
    input.result.reasonCode,
    input.result.pairReason,
    input.promptVersion,
    input.model,
  ]);
}

import { pathToFileURL } from "node:url";
import { closePostgresClient, getPostgresClient, getPostgresConfig } from "../lib/postgres-store.ts";
import { ensureWordMasterSchema } from "../lib/word-master-schema.ts";

const enrichmentKey = "ai-general-enrichment-v1";
const policyVersion = "ai-general-enrichment-v1";
const expectedCount = 63;
const katakanaForReadingNormalization = Array.from(
  { length: 0x30f6 - 0x30a1 + 1 },
  (_, index) => String.fromCodePoint(0x30a1 + index),
).join("");
const hiraganaForReadingNormalization = Array.from(
  { length: 0x30f6 - 0x30a1 + 1 },
  (_, index) => String.fromCodePoint(0x3041 + index),
).join("");

function assertLocalDatabase() {
  const config = getPostgresConfig();
  if (!config) throw new Error("DATABASE_URL is required");
  const hostname = new URL(config.url).hostname.toLowerCase();
  if (!["127.0.0.1", "localhost", "::1", "[::1]"].includes(hostname)) {
    throw new Error("AI_WORD_ENRICHMENT_LOCAL_DATABASE_REQUIRED");
  }
}

async function readSummary(batchId: string | number) {
  const sql = getPostgresClient();
  const [summary] = await sql.query(
    `SELECT
       COUNT(*)::INTEGER AS enriched,
       COUNT(*) FILTER (
         WHERE enrichment_method = 'lexical_surface_variant'
       )::INTEGER AS lexical_surface_variant,
       COUNT(*) FILTER (
         WHERE enrichment_method = 'ai_category_review'
       )::INTEGER AS ai_category_review,
       COUNT(*) FILTER (WHERE primary_part_of_speech = '名詞')::INTEGER AS nouns,
       COUNT(*) FILTER (WHERE proper_noun_status = 'common')::INTEGER AS common_nouns,
       COUNT(*) FILTER (WHERE content_safety_status = 'clean')::INTEGER AS safety_clean
     FROM ai_word_candidate_enrichments
     WHERE enrichment_batch_id = $1`,
    [batchId],
  );
  const audit = await sql.query(
     `SELECT candidate.surface, candidate.reading, candidate.category_key,
            enrichment.enrichment_method, enrichment.lexical_source_key,
            enrichment.primary_part_of_speech,
            enrichment.part_of_speech_details, enrichment.form_status,
            enrichment.proper_noun_status, enrichment.content_safety_status,
            enrichment.confidence, enrichment.semantic_note
     FROM ai_word_candidate_enrichments enrichment
     JOIN ai_word_candidates candidate ON candidate.id = enrichment.candidate_id
     WHERE enrichment.enrichment_batch_id = $1
       AND (
         enrichment.enrichment_method = 'lexical_surface_variant'
         OR candidate.surface IN ('ひょう', 'ゾウ', 'エイ', 'チョウ')
       )
     ORDER BY candidate.surface`,
    [batchId],
  );
  return { summary, audit };
}

async function enrichAiGeneralWords() {
  assertLocalDatabase();
  await ensureWordMasterSchema();
  const sql = getPostgresClient();

  const [targetState] = await sql.query(
    `SELECT COUNT(*)::INTEGER AS target_count
     FROM ai_word_candidates candidate
     JOIN words word ON word.id = candidate.promoted_word_id
     JOIN word_sources source ON source.id = word.source_id
     WHERE candidate.quality_status = 'approved'
       AND candidate.review_status = 'promoted'
       AND source.source_key = 'ai-general-generated-v1'`,
  );
  if (Number(targetState.target_count) !== expectedCount) {
    throw new Error(`AI_WORD_ENRICHMENT_TARGET_COUNT:${targetState.target_count}:${expectedCount}`);
  }

  let batch = (
    await sql.query(
      `SELECT id, status
       FROM ai_word_enrichment_batches
       WHERE enrichment_key = $1`,
      [enrichmentKey],
    )
  )[0];
  if (!batch) {
    batch = (
      await sql.query(
        `INSERT INTO ai_word_enrichment_batches (
           enrichment_key, enriched_by, model, policy_version,
           lexical_source_version, expected_count
         )
         VALUES (
           $1, 'codex', 'codex', $2,
           'sudachidict-core-20260428+jmdict-local-fallback', $3
         )
         RETURNING id, status`,
        [enrichmentKey, policyVersion, expectedCount],
      )
    )[0];
  }
  const batchId = batch.id as string | number;
  await sql.query(
    `UPDATE ai_word_enrichment_batches
     SET lexical_source_version = 'sudachidict-core-20260428+jmdict-local-fallback'
     WHERE id = $1`,
    [batchId],
  );
  await sql.query(
    `UPDATE ai_word_candidate_enrichments enrichment
     SET lexical_source_key = lexical_source.source_key
     FROM ai_word_candidates candidate
     JOIN LATERAL (
       SELECT source.source_key
       FROM words lexical
       JOIN word_sources source ON source.id = lexical.source_id
       WHERE lexical.normalized_form = candidate.normalized_form
         AND translate(lexical.reading, $1, $2) <> candidate.reading
         AND lexical.primary_part_of_speech = '名詞'
         AND lexical.proper_noun_status = 'common'
         AND NOT lexical.is_name_fragment
         AND source.source_key <> 'ai-general-generated-v1'
       ORDER BY
         CASE WHEN source.source_key = 'sudachidict-core' THEN 0 ELSE 1 END,
         lexical.active DESC,
         lexical.id
       LIMIT 1
     ) lexical_source ON TRUE
     WHERE enrichment.enrichment_batch_id = $3
       AND enrichment.candidate_id = candidate.id
       AND enrichment.enrichment_method = 'lexical_surface_variant'
       AND enrichment.lexical_source_key = ''`,
    [
      katakanaForReadingNormalization,
      hiraganaForReadingNormalization,
      batchId,
    ],
  );

  if (batch.status !== "completed") {
    await sql.query(
      `WITH target_candidates AS (
         SELECT candidate.id AS candidate_id, candidate.promoted_word_id AS word_id,
                candidate.surface, candidate.reading, candidate.normalized_form,
                candidate.category_key, category.display_name AS category_name
         FROM ai_word_candidates candidate
         JOIN ai_word_categories category ON category.category_key = candidate.category_key
         JOIN words word ON word.id = candidate.promoted_word_id
         JOIN word_sources source ON source.id = word.source_id
         WHERE candidate.quality_status = 'approved'
           AND candidate.review_status = 'promoted'
           AND source.source_key = 'ai-general-generated-v1'
       ),
       variant_candidates AS (
         SELECT target.candidate_id, lexical.id, lexical.primary_part_of_speech,
                lexical.part_of_speech_details, lexical.form_status,
                lexical.proper_noun_status, lexical.proper_noun_type,
                lexical.person_name_status, lexical_source.source_key,
                COUNT(*) OVER (PARTITION BY target.candidate_id) AS match_count,
                ROW_NUMBER() OVER (
                  PARTITION BY target.candidate_id
                  ORDER BY
                    CASE WHEN lexical_source.source_key = 'sudachidict-core' THEN 0 ELSE 1 END,
                    lexical.active DESC,
                    lexical.id
                ) AS match_order
         FROM target_candidates target
         JOIN words lexical
           ON lexical.normalized_form = target.normalized_form
          AND translate(lexical.reading, $1, $2) <> target.reading
          AND lexical.primary_part_of_speech = '名詞'
          AND lexical.proper_noun_status = 'common'
          AND NOT lexical.is_name_fragment
         JOIN word_sources lexical_source ON lexical_source.id = lexical.source_id
         WHERE lexical_source.source_key <> 'ai-general-generated-v1'
       ),
       unique_variants AS (
         SELECT *
         FROM variant_candidates
         WHERE match_count = 1 AND match_order = 1
       )
       INSERT INTO ai_word_candidate_enrichments (
         candidate_id, word_id, enrichment_batch_id, enrichment_method,
         lexical_source_key,
         primary_part_of_speech, part_of_speech_details, form_status,
         proper_noun_status, proper_noun_type, person_name_status,
         surface_quality_status, surface_quality_flags,
         content_safety_status, content_safety_flags,
         confidence, semantic_note, reason
       )
       SELECT target.candidate_id, target.word_id, $3,
              CASE
                WHEN variant.candidate_id IS NOT NULL THEN 'lexical_surface_variant'
                ELSE 'ai_category_review'
              END,
              COALESCE(variant.source_key, ''),
              COALESCE(variant.primary_part_of_speech, '名詞'),
              COALESCE(variant.part_of_speech_details, ARRAY['普通名詞', '一般']::TEXT[]),
              COALESCE(NULLIF(variant.form_status, 'unknown'), 'non_inflecting'),
              COALESCE(variant.proper_noun_status, 'common'),
              variant.proper_noun_type,
              COALESCE(variant.person_name_status, 'not_person'),
              'clean', ARRAY[]::TEXT[],
              'clean', ARRAY[]::TEXT[],
              CASE WHEN variant.candidate_id IS NOT NULL THEN 0.99 ELSE 0.98 END,
              CASE
                WHEN target.surface = 'ひょう'
                  THEN '天気・気象カテゴリの「雹」をひらがな表記にした語'
                ELSE target.category_name
              END,
              CASE
                WHEN variant.candidate_id IS NOT NULL
                  THEN '固定版SudachiDict Coreを優先し、同一表記・読み違いの一意な普通名詞行を参照。存在しない場合はローカルJMdictで補完'
                ELSE 'AI生成時のカテゴリと読みを用いて、単独語として普通名詞・非活用語・安全と確認'
              END
       FROM target_candidates target
       LEFT JOIN unique_variants variant ON variant.candidate_id = target.candidate_id
       ON CONFLICT (candidate_id, enrichment_batch_id) DO NOTHING`,
      [
        katakanaForReadingNormalization,
        hiraganaForReadingNormalization,
        batchId,
      ],
    );

    await sql.query(
      `UPDATE words word
       SET primary_part_of_speech = enrichment.primary_part_of_speech,
           part_of_speech_details = enrichment.part_of_speech_details,
           form_status = enrichment.form_status,
           form_classification_reason = enrichment.reason,
           form_policy_version = $2,
           proper_noun_status = enrichment.proper_noun_status,
           proper_noun_type = enrichment.proper_noun_type,
           person_name_status = enrichment.person_name_status,
           is_name_fragment = FALSE,
           person_name_policy_version = $2,
           surface_quality_status = enrichment.surface_quality_status,
           surface_quality_flags = enrichment.surface_quality_flags,
           surface_quality_policy_version = $2,
           content_safety_status = enrichment.content_safety_status,
           content_safety_flags = enrichment.content_safety_flags,
           content_safety_policy_version = $2,
           updated_at = NOW()
       FROM ai_word_candidate_enrichments enrichment
       WHERE enrichment.enrichment_batch_id = $1
         AND word.id = enrichment.word_id`,
      [batchId, policyVersion],
    );

    const [count] = await sql.query(
      `SELECT COUNT(*)::INTEGER AS enriched_count
       FROM ai_word_candidate_enrichments
       WHERE enrichment_batch_id = $1`,
      [batchId],
    );
    if (Number(count.enriched_count) !== expectedCount) {
      await sql.query(
        `UPDATE ai_word_enrichment_batches
         SET status = 'failed',
             enriched_count = $2,
             error_message = 'unexpected enrichment count'
         WHERE id = $1`,
        [batchId, Number(count.enriched_count)],
      );
      throw new Error(`AI_WORD_ENRICHMENT_RESULT_COUNT:${count.enriched_count}:${expectedCount}`);
    }
    await sql.query(
      `UPDATE ai_word_enrichment_batches
       SET status = 'completed',
           enriched_count = $2,
           error_message = '',
           completed_at = NOW()
       WHERE id = $1`,
      [batchId, expectedCount],
    );
  }

  const result = await readSummary(batchId);
  console.log(JSON.stringify({
    enrichmentKey,
    policyVersion,
    alreadyCompleted: batch.status === "completed",
    ...result,
  }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  enrichAiGeneralWords()
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(closePostgresClient);
}

import { pathToFileURL } from "node:url";
import { Client } from "pg";
import {
  closePostgresClient,
  getPostgresConfig,
} from "../lib/postgres-store.ts";
import { ensureWordMasterSchema } from "../lib/word-master-schema.ts";

const policyVersion = "ai-word-promotion-repair-v1";
const sourceKey = "ai-general-generated-v1";

function assertLocalDatabase() {
  const config = getPostgresConfig();
  if (!config) throw new Error("DATABASE_URL is required");
  const hostname = new URL(config.url).hostname.toLowerCase();
  if (!["127.0.0.1", "localhost", "::1", "[::1]"].includes(hostname)) {
    throw new Error("AI_WORD_PROMOTION_REPAIR_LOCAL_DATABASE_REQUIRED");
  }
}

async function repairAiGeneralWordPromotions() {
  assertLocalDatabase();
  await ensureWordMasterSchema();
  const config = getPostgresConfig();
  if (!config) throw new Error("DATABASE_URL is required");
  const client = new Client({ connectionString: config.url });
  await client.connect();

  let result;
  try {
    await client.query("BEGIN");
    const query = async (text: string, values: unknown[] = []) =>
      (await client.query(text, values)).rows;

    const [source] = await query(
      `SELECT id
       FROM word_sources
       WHERE source_key = $1
       FOR UPDATE`,
      [sourceKey],
    );
    if (!source) throw new Error(`WORD_SOURCE_NOT_FOUND:${sourceKey}`);

    const targets = await query(
      `SELECT candidate.id AS candidate_id,
              candidate.surface,
              candidate.normalized_form,
              candidate.reading,
              candidate.difficulty,
              candidate.promoted_word_id AS previous_word_id
       FROM ai_word_candidates candidate
       JOIN words word ON word.id = candidate.promoted_word_id
       WHERE candidate.review_status = 'promoted'
         AND candidate.quality_status = 'approved'
         AND candidate.content_safety_status = 'clean'
         AND candidate.difficulty IS NOT NULL
         AND word.is_name_fragment
       ORDER BY candidate.id
       FOR UPDATE OF candidate, word`,
    );

    const repaired: Array<{
      candidateId: number;
      previousWordId: number;
      repairedWordId: number;
    }> = [];

    for (const target of targets) {
      const sourceEntryId = `candidate:${target.candidate_id}:common-lexeme`;
      const [word] = await query(
        `INSERT INTO words (
           surface, normalized_form, reading,
           primary_part_of_speech, part_of_speech_details,
           form_status, form_classification_reason, form_policy_version,
           proper_noun_status, proper_noun_type,
           person_name_status, is_name_fragment, person_name_policy_version,
           surface_quality_status, surface_quality_flags, surface_quality_policy_version,
           content_safety_status, content_safety_flags, content_safety_policy_version,
           zipf_frequency, source_id, source_entry_id, source_version, active
         )
         VALUES (
           $1, $2, $3,
           '名詞', ARRAY['普通名詞', '一般']::TEXT[],
           'non_inflecting', 'AI生成候補として確認済みの一般名詞', $4,
           'common', NULL,
           'not_person', FALSE, $4,
           'clean', ARRAY[]::TEXT[], $4,
           'clean', ARRAY[]::TEXT[], $4,
           NULL, $5, $6, $4, TRUE
         )
         ON CONFLICT (source_id, source_entry_id) DO UPDATE SET
           surface = EXCLUDED.surface,
           normalized_form = EXCLUDED.normalized_form,
           reading = EXCLUDED.reading,
           active = TRUE,
           updated_at = NOW()
         RETURNING id`,
        [
          target.surface,
          target.normalized_form,
          target.reading,
          policyVersion,
          source.id,
          sourceEntryId,
        ],
      );
      if (!word) throw new Error(`REPAIRED_WORD_NOT_CREATED:${target.candidate_id}`);

      await query(
        `INSERT INTO ai_word_promotion_repairs (
           candidate_id, previous_word_id, repaired_word_id,
           repair_kind, policy_version, repaired_by, reason
         )
         VALUES (
           $1, $2, $3,
           'name_fragment_to_common_lexeme', $4, 'codex',
           '一般語候補を人名の姓・名だけの語へ紐づけないため、別の一般名詞IDへ付け替え'
         )
         ON CONFLICT (candidate_id) DO UPDATE SET
           previous_word_id = EXCLUDED.previous_word_id,
           repaired_word_id = EXCLUDED.repaired_word_id,
           repair_kind = EXCLUDED.repair_kind,
           policy_version = EXCLUDED.policy_version,
           repaired_by = EXCLUDED.repaired_by,
           reason = EXCLUDED.reason`,
        [target.candidate_id, target.previous_word_id, word.id, policyVersion],
      );

      await query(
        `UPDATE ai_word_candidate_match_resolutions
         SET word_id = NULL,
             resolution_kind = 'new_lexeme',
             policy_version = $2,
             resolved_by = 'codex',
             reason = '人名断片の既存IDは再利用せず一般名詞を新規登録'
         WHERE candidate_id = $1`,
        [target.candidate_id, policyVersion],
      );

      await query(
        `UPDATE ai_word_candidates
         SET matched_word_id = NULL,
             promoted_word_id = $2,
             updated_at = NOW()
         WHERE id = $1`,
        [target.candidate_id, word.id],
      );

      await query(
        `INSERT INTO game_word_settings (
           word_id, game_type, usable, difficulty, review_status, updated_at
         )
         SELECT $1, game_type, TRUE, $2, 'approved', NOW()
         FROM (VALUES ('wordwolf'), ('nigoichi'), ('tahoiya')) game(game_type)
         ON CONFLICT (word_id, game_type) DO UPDATE SET
           usable = TRUE,
           difficulty = EXCLUDED.difficulty,
           review_status = 'approved',
           updated_at = NOW()`,
        [word.id, target.difficulty],
      );

      await query(
        `UPDATE game_word_settings setting
         SET usable = FALSE,
             review_status = 'disabled',
             updated_at = NOW()
         WHERE setting.word_id = $1
           AND NOT EXISTS (
             SELECT 1
             FROM ai_word_candidates other
             WHERE other.promoted_word_id = setting.word_id
               AND other.id <> $2
           )`,
        [target.previous_word_id, target.candidate_id],
      );

      repaired.push({
        candidateId: Number(target.candidate_id),
        previousWordId: Number(target.previous_word_id),
        repairedWordId: Number(word.id),
      });
    }

    const quality = await query(
      `UPDATE words word
       SET surface_quality_status = 'clean',
           surface_quality_flags = ARRAY[]::TEXT[],
           surface_quality_policy_version = candidate.quality_policy_version,
           content_safety_status = 'clean',
           content_safety_flags = ARRAY[]::TEXT[],
           content_safety_policy_version = candidate.content_safety_policy_version,
           updated_at = NOW()
       FROM ai_word_candidates candidate
       WHERE candidate.promoted_word_id = word.id
         AND candidate.review_status = 'promoted'
         AND candidate.quality_status = 'approved'
         AND candidate.content_safety_status = 'clean'
         AND (
           word.surface_quality_status <> 'clean'
           OR word.surface_quality_flags <> ARRAY[]::TEXT[]
           OR word.content_safety_status <> 'clean'
           OR word.content_safety_flags <> ARRAY[]::TEXT[]
         )
       RETURNING word.id`,
    );

    const [audit] = await query(
      `SELECT
         COUNT(*) FILTER (
           WHERE candidate.quality_status = 'approved'
             AND candidate.content_safety_status = 'clean'
         )::INTEGER AS eligible_candidates,
         COUNT(*) FILTER (
           WHERE candidate.quality_status = 'approved'
             AND candidate.content_safety_status = 'clean'
             AND (
               word.is_name_fragment
               OR word.surface_quality_status <> 'clean'
               OR word.content_safety_status <> 'clean'
             )
         )::INTEGER AS remaining_invalid
       FROM ai_word_candidates candidate
       JOIN words word ON word.id = candidate.promoted_word_id
       WHERE candidate.review_status = 'promoted'`,
    );

    result = {
      repaired,
      qualityRowsUpdated: quality.length,
      audit,
    };
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }

  if (!result) throw new Error("AI_WORD_PROMOTION_REPAIR_NO_RESULT");
  if (Number(result.audit.remaining_invalid) !== 0) {
    throw new Error(`AI_WORD_PROMOTION_REPAIR_INCOMPLETE:${JSON.stringify(result.audit)}`);
  }
  console.log(JSON.stringify({
    policyVersion,
    repairedCount: result.repaired.length,
    repaired: result.repaired,
    qualityRowsUpdated: result.qualityRowsUpdated,
    ...result.audit,
  }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  repairAiGeneralWordPromotions()
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(closePostgresClient);
}

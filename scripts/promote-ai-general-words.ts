import { pathToFileURL } from "node:url";
import { closePostgresClient, getPostgresClient, getPostgresConfig } from "../lib/postgres-store.ts";
import { ensureWordMasterSchema } from "../lib/word-master-schema.ts";

const promotionPolicyVersion = "ai-general-promotion-v1";
const aiSourceKey = "ai-general-generated-v1";
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
    throw new Error("AI_WORD_PROMOTION_LOCAL_DATABASE_REQUIRED");
  }
}

async function readDecisionAudit() {
  const sql = getPostgresClient();
  return sql.query(
    `SELECT candidate.surface, candidate.reading,
            candidate.matched_word_id, candidate.promoted_word_id,
            source.source_key
     FROM ai_word_candidates candidate
     JOIN words word ON word.id = candidate.promoted_word_id
     JOIN word_sources source ON source.id = word.source_id
     WHERE candidate.surface = ANY($1::TEXT[])
     ORDER BY candidate.surface`,
    [["サイ", "現金", "ひょう", "ゾウ", "エイ", "チョウ"]],
  );
}

async function promoteAiGeneralWords() {
  assertLocalDatabase();
  await ensureWordMasterSchema();
  const sql = getPostgresClient();

  const candidates = await sql.query(
    `WITH exact_matches AS (
       SELECT candidate.id AS candidate_id,
              ARRAY_AGG(word.id ORDER BY word.id) AS word_ids
       FROM ai_word_candidates candidate
       JOIN words word
         ON word.normalized_form = candidate.normalized_form
        AND translate(word.reading, $1, $2) = candidate.reading
       WHERE candidate.quality_status = 'approved'
         AND candidate.difficulty IS NOT NULL
         AND candidate.review_status <> 'promoted'
       GROUP BY candidate.id
     )
     SELECT candidate.id, candidate.surface, candidate.reading,
            COALESCE(cardinality(exact_matches.word_ids), 0)::INTEGER AS exact_count
     FROM ai_word_candidates candidate
     LEFT JOIN exact_matches ON exact_matches.candidate_id = candidate.id
     WHERE candidate.quality_status = 'approved'
       AND candidate.difficulty IS NOT NULL
       AND candidate.review_status <> 'promoted'
     ORDER BY candidate.id`,
    [katakanaForReadingNormalization, hiraganaForReadingNormalization],
  );
  if (candidates.length === 0) {
    const [summary] = await sql.query(
      `SELECT COUNT(*) FILTER (WHERE review_status = 'promoted')::INTEGER AS promoted
       FROM ai_word_candidates`,
    );
    console.log(JSON.stringify({
      alreadyPromoted: true,
      promoted: Number(summary.promoted),
      decisionAudit: await readDecisionAudit(),
    }, null, 2));
    return;
  }

  const approvedState = await sql.query(
    `SELECT
       COUNT(*)::INTEGER AS approved,
       COUNT(*) FILTER (WHERE difficulty IS NULL)::INTEGER AS unclassified
     FROM ai_word_candidates
     WHERE quality_status = 'approved'`,
  );
  if (Number(approvedState[0]?.unclassified ?? 0) !== 0) {
    throw new Error("AI_WORD_PROMOTION_UNCLASSIFIED_APPROVED_CANDIDATES");
  }

  const specialMatches = await sql.query(
    `SELECT candidate.surface, candidate.reading, word.id
     FROM ai_word_candidates candidate
     JOIN words word
       ON word.normalized_form = candidate.normalized_form
      AND translate(word.reading, $1, $2) = candidate.reading
     WHERE (candidate.surface, candidate.reading) IN (('サイ', 'さい'), ('現金', 'げんきん'))
       AND word.surface = candidate.surface
       AND word.primary_part_of_speech = '名詞'
       AND word.proper_noun_status = 'common'
       AND NOT word.is_name_fragment
     ORDER BY candidate.surface, word.id`,
    [katakanaForReadingNormalization, hiraganaForReadingNormalization],
  );
  for (const [surface, reading] of [["サイ", "さい"], ["現金", "げんきん"]] as const) {
    const matches = specialMatches.filter(
      (row) => row.surface === surface && row.reading === reading,
    );
    if (matches.length !== 1) {
      throw new Error(`AI_WORD_PROMOTION_SPECIAL_MATCH_NOT_UNIQUE:${surface}:${matches.length}`);
    }
  }

  await sql.query(
    `INSERT INTO word_sources (
       source_key, display_name, source_version, license,
       attribution, source_url, import_notes
     )
     VALUES ($1, 'AI生成・一般単語候補', $2, 'AI-generated project data',
             'Game Fields AI-assisted word curation', 'https://www.game-fields.com',
             'Reviewed and classified locally before promotion; raw generation files are not published.')
     ON CONFLICT (source_key) DO UPDATE SET
       display_name = EXCLUDED.display_name,
       source_version = EXCLUDED.source_version,
       license = EXCLUDED.license,
       attribution = EXCLUDED.attribution,
       source_url = EXCLUDED.source_url,
       import_notes = EXCLUDED.import_notes,
       active = TRUE,
       updated_at = NOW()`,
    [aiSourceKey, promotionPolicyVersion],
  );

  const promoted = await sql.query(
    `WITH source AS (
       SELECT id FROM word_sources WHERE source_key = $3
     ),
     exact_matches AS (
       SELECT candidate.id AS candidate_id,
              ARRAY_AGG(word.id ORDER BY word.id) AS word_ids
       FROM ai_word_candidates candidate
       JOIN words word
         ON word.normalized_form = candidate.normalized_form
        AND translate(word.reading, $1, $2) = candidate.reading
       WHERE candidate.quality_status = 'approved'
         AND candidate.difficulty IS NOT NULL
         AND candidate.review_status <> 'promoted'
       GROUP BY candidate.id
     ),
     resolved AS (
       SELECT candidate.*,
              CASE
                WHEN cardinality(exact_matches.word_ids) = 1 THEN exact_matches.word_ids[1]
                WHEN (candidate.surface, candidate.reading) IN (('サイ', 'さい'), ('現金', 'げんきん'))
                  THEN (
                    SELECT word.id
                    FROM words word
                    WHERE word.normalized_form = candidate.normalized_form
                      AND translate(word.reading, $1, $2) = candidate.reading
                      AND word.surface = candidate.surface
                      AND word.primary_part_of_speech = '名詞'
                      AND word.proper_noun_status = 'common'
                      AND NOT word.is_name_fragment
                  )
                ELSE NULL
              END AS resolved_word_id
       FROM ai_word_candidates candidate
       LEFT JOIN exact_matches ON exact_matches.candidate_id = candidate.id
       WHERE candidate.quality_status = 'approved'
         AND candidate.difficulty IS NOT NULL
         AND candidate.review_status <> 'promoted'
     ),
     inserted_words AS (
       INSERT INTO words (
         surface, normalized_form, reading,
         primary_part_of_speech, part_of_speech_details,
         form_status, form_classification_reason, form_policy_version,
         proper_noun_status, proper_noun_type,
         person_name_status, is_name_fragment, person_name_policy_version,
         surface_quality_status, surface_quality_flags, surface_quality_policy_version,
         content_safety_status, content_safety_flags, content_safety_policy_version,
         zipf_frequency, source_id, source_entry_id, source_version, active
       )
       SELECT resolved.surface, resolved.normalized_form, resolved.reading,
              '名詞', ARRAY['普通名詞', '一般']::TEXT[],
              'dictionary', 'AI生成・人手確認済みの見出し語', $4,
              'common', NULL,
              'not_person', FALSE, $4,
              'clean', ARRAY[]::TEXT[], $4,
              'unreviewed', ARRAY[]::TEXT[], '',
              NULL, source.id, 'candidate:' || resolved.id, $4, TRUE
       FROM resolved
       CROSS JOIN source
       WHERE resolved.resolved_word_id IS NULL
       RETURNING id, source_entry_id
     ),
     promoted_candidates AS (
       UPDATE ai_word_candidates candidate
       SET matched_word_id = resolved.resolved_word_id,
           promoted_word_id = COALESCE(
             resolved.resolved_word_id,
             (
               SELECT inserted_words.id
               FROM inserted_words
               WHERE inserted_words.source_entry_id = 'candidate:' || resolved.id
             )
           ),
           review_status = 'promoted',
           updated_at = NOW()
       FROM resolved
       WHERE candidate.id = resolved.id
       RETURNING candidate.id, candidate.promoted_word_id, candidate.difficulty,
                 (resolved.resolved_word_id IS NOT NULL) AS reused_existing
     ),
     applied_settings AS (
       INSERT INTO game_word_settings (
         word_id, game_type, usable, difficulty, review_status, updated_at
       )
       SELECT promoted_candidates.promoted_word_id, game.game_type,
              TRUE, promoted_candidates.difficulty, 'approved', NOW()
       FROM promoted_candidates
       CROSS JOIN (VALUES ('wordwolf'), ('nigoichi'), ('tahoiya')) AS game(game_type)
       ON CONFLICT (word_id, game_type) DO UPDATE SET
         usable = EXCLUDED.usable,
         difficulty = EXCLUDED.difficulty,
         review_status = EXCLUDED.review_status,
         updated_at = NOW()
       RETURNING word_id
     )
     SELECT
       COUNT(*)::INTEGER AS promoted,
       COUNT(*) FILTER (WHERE reused_existing)::INTEGER AS reused_existing,
       COUNT(*) FILTER (WHERE NOT reused_existing)::INTEGER AS inserted_new,
       COUNT(*) FILTER (WHERE difficulty = 'easy')::INTEGER AS easy,
       COUNT(*) FILTER (WHERE difficulty = 'normal')::INTEGER AS normal,
       COUNT(*) FILTER (WHERE difficulty = 'hard')::INTEGER AS hard,
       (SELECT COUNT(*)::INTEGER FROM applied_settings) AS applied_settings
     FROM promoted_candidates`,
    [
      katakanaForReadingNormalization,
      hiraganaForReadingNormalization,
      aiSourceKey,
      promotionPolicyVersion,
    ],
  );

  const verification = await sql.query(
    `SELECT
       COUNT(*) FILTER (WHERE quality_status = 'approved')::INTEGER AS approved,
       COUNT(*) FILTER (
         WHERE quality_status = 'approved' AND review_status = 'promoted'
       )::INTEGER AS promoted,
       COUNT(DISTINCT promoted_word_id) FILTER (
         WHERE quality_status = 'approved' AND promoted_word_id IS NOT NULL
       )::INTEGER AS distinct_word_ids,
       COUNT(*) FILTER (
         WHERE quality_status = 'approved' AND promoted_word_id IS NULL
       )::INTEGER AS missing_word_id
     FROM ai_word_candidates`,
  );
  const [settings] = await sql.query(
    `SELECT COUNT(*)::INTEGER AS settings
     FROM game_word_settings setting
     JOIN ai_word_candidates candidate ON candidate.promoted_word_id = setting.word_id
     WHERE candidate.quality_status = 'approved'
       AND candidate.review_status = 'promoted'
       AND setting.usable
       AND setting.difficulty = candidate.difficulty
       AND setting.review_status = 'approved'`,
  );

  console.log(JSON.stringify({
    policyVersion: promotionPolicyVersion,
    approvedBeforePromotion: Number(approvedState[0]?.approved ?? 0),
    result: promoted[0],
    verification: verification[0],
    verifiedGameSettings: Number(settings.settings),
    decisionAudit: await readDecisionAudit(),
  }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  promoteAiGeneralWords()
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(closePostgresClient);
}

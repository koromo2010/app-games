import { pathToFileURL } from "node:url";
import { closePostgresClient, getPostgresClient, getPostgresConfig } from "../lib/postgres-store.ts";
import { ensureWordMasterSchema } from "../lib/word-master-schema.ts";

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
    throw new Error("AI_WORD_RESET_COMPARE_LOCAL_DATABASE_REQUIRED");
  }
}

async function resetAndCompare() {
  assertLocalDatabase();
  await ensureWordMasterSchema();
  const sql = getPostgresClient();

  const resetRows = await sql.query(
    `SELECT word_id, game_type, difficulty, usable
     FROM game_word_settings
     WHERE difficulty IS NOT NULL
     ORDER BY word_id, game_type`,
  );
  if (resetRows.length > 0) {
    await sql.transaction((tx) => [
      tx.query(
        `INSERT INTO word_classification_history (
           word_id, game_type, previous_difficulty, new_difficulty,
           previous_usable, new_usable, reason, feedback_snapshot
         )
         SELECT word_id, game_type, difficulty, NULL, usable, FALSE,
                'ai-general-integration-v1: existing difficulty reset',
                jsonb_build_object('feedback_count', feedback_count, 'review_status', review_status)
         FROM game_word_settings
         WHERE difficulty IS NOT NULL`,
      ),
      tx.query(
        `UPDATE game_word_settings
         SET difficulty = NULL,
             usable = FALSE,
             review_status = 'unreviewed',
             updated_at = NOW()
         WHERE difficulty IS NOT NULL`,
      ),
    ]);
  }

  const summary = await sql.query(
    `WITH comparison AS (
       SELECT candidate.id,
              COUNT(DISTINCT exact_word.id)::INTEGER AS exact_count,
              COUNT(DISTINCT surface_word.id)::INTEGER AS normalized_count
       FROM ai_word_candidates candidate
       LEFT JOIN words exact_word
         ON exact_word.normalized_form = candidate.normalized_form
        AND translate(exact_word.reading, $1, $2) = candidate.reading
       LEFT JOIN words surface_word
         ON surface_word.normalized_form = candidate.normalized_form
       WHERE candidate.quality_status = 'approved'
       GROUP BY candidate.id
     )
     SELECT
       COUNT(*)::INTEGER AS approved_candidates,
       COUNT(*) FILTER (WHERE exact_count = 1)::INTEGER AS exact_unique,
       COUNT(*) FILTER (WHERE exact_count > 1)::INTEGER AS exact_ambiguous,
       COUNT(*) FILTER (WHERE exact_count = 0 AND normalized_count > 0)::INTEGER AS normalized_only,
       COUNT(*) FILTER (WHERE exact_count = 0 AND normalized_count = 0)::INTEGER AS new_words
    FROM comparison`,
    [katakanaForReadingNormalization, hiraganaForReadingNormalization],
  );
  const samples = await sql.query(
    `WITH comparison AS (
       SELECT candidate.id, candidate.surface, candidate.reading, candidate.category_key,
              COUNT(DISTINCT exact_word.id)::INTEGER AS exact_count,
              COUNT(DISTINCT surface_word.id)::INTEGER AS normalized_count
       FROM ai_word_candidates candidate
       LEFT JOIN words exact_word
         ON exact_word.normalized_form = candidate.normalized_form
        AND translate(exact_word.reading, $1, $2) = candidate.reading
       LEFT JOIN words surface_word
         ON surface_word.normalized_form = candidate.normalized_form
       WHERE candidate.quality_status = 'approved'
       GROUP BY candidate.id
     )
     SELECT surface, reading, category_key,
            CASE
              WHEN exact_count = 1 THEN 'exact_unique'
              WHEN exact_count > 1 THEN 'exact_ambiguous'
              WHEN normalized_count > 0 THEN 'normalized_only'
              ELSE 'new_word'
            END AS match_type
     FROM comparison
     WHERE exact_count <> 1
     ORDER BY match_type, id
     LIMIT 60`,
    [katakanaForReadingNormalization, hiraganaForReadingNormalization],
  );
  const [settingsState] = await sql.query(
    `SELECT
       COUNT(*) FILTER (WHERE difficulty IS NOT NULL)::INTEGER AS difficulty_remaining,
       COUNT(*) FILTER (WHERE usable)::INTEGER AS usable_remaining
     FROM game_word_settings`,
  );

  console.log(JSON.stringify({
    resetSettings: resetRows.length,
    settingsState,
    comparison: summary[0],
    nonUniqueOrNewSamples: samples,
  }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  resetAndCompare()
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(closePostgresClient);
}

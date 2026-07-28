import { pathToFileURL } from "node:url";
import { closePostgresClient, getPostgresClient, getPostgresConfig } from "../lib/postgres-store.ts";
import { ensureWordMasterSchema } from "../lib/word-master-schema.ts";

const katakanaForReadingNormalization = Array.from(
  { length: "ヶ".charCodeAt(0) - "ァ".charCodeAt(0) + 1 },
  (_, index) => String.fromCharCode("ァ".charCodeAt(0) + index),
).join("");
const hiraganaForReadingNormalization = Array.from(
  katakanaForReadingNormalization,
  (character) => String.fromCharCode(character.charCodeAt(0) - 0x60),
).join("");

function readBatchPrefix() {
  return process.argv.find((argument) => argument.startsWith("--prefix="))?.slice("--prefix=".length)
    || "general-hard-v1-";
}

function assertLocalDatabase() {
  const config = getPostgresConfig();
  if (!config) throw new Error("DATABASE_URL is required");
  const hostname = new URL(config.url).hostname.toLowerCase();
  if (!["127.0.0.1", "localhost", "::1", "[::1]"].includes(hostname)) {
    throw new Error("AI_WORD_STAGING_COMPARISON_LOCAL_DATABASE_REQUIRED");
  }
}

async function compareStaging() {
  assertLocalDatabase();
  await ensureWordMasterSchema();
  const sql = getPostgresClient();
  const prefix = readBatchPrefix();
  const [summary] = await sql.query(
    `WITH staged AS (
       SELECT staged.*,
              batch.batch_key,
              COUNT(*) OVER (PARTITION BY staged.normalized_form) AS generation_occurrences,
              ROW_NUMBER() OVER (
                PARTITION BY staged.normalized_form
                ORDER BY batch.batch_key, staged.item_order
              ) AS generation_order
       FROM ai_word_staged_candidates staged
       JOIN ai_word_generation_batches batch ON batch.id = staged.generation_batch_id
       WHERE batch.batch_key LIKE $1 || '%'
     ),
     compared AS (
       SELECT staged.*,
              EXISTS (
                SELECT 1
                FROM ai_word_candidates candidate
                WHERE candidate.normalized_form = staged.normalized_form
                  AND candidate.reading = staged.reading
              ) AS candidate_exact,
              EXISTS (
                SELECT 1
                FROM ai_word_candidates candidate
                WHERE candidate.normalized_form = staged.normalized_form
                  AND candidate.reading <> staged.reading
              ) AS candidate_reading_mismatch,
              EXISTS (
                SELECT 1
                FROM words word
                WHERE word.normalized_form = staged.normalized_form
                  AND translate(word.reading, $2, $3) = staged.reading
              ) AS word_exact,
              EXISTS (
                SELECT 1
                FROM words word
                WHERE word.normalized_form = staged.normalized_form
                  AND translate(word.reading, $2, $3) <> staged.reading
              ) AS word_reading_mismatch,
              EXISTS (
                SELECT 1
                FROM ai_word_candidates candidate
                WHERE candidate.normalized_form = staged.normalized_form
              ) OR EXISTS (
                SELECT 1
                FROM words word
                WHERE word.normalized_form = staged.normalized_form
              ) AS known_surface
       FROM staged
     )
     SELECT
       COUNT(*)::INTEGER AS staged_rows,
       COUNT(DISTINCT normalized_form)::INTEGER AS distinct_surfaces,
       (COUNT(*) - COUNT(DISTINCT normalized_form))::INTEGER AS duplicate_rows_within_generation,
       COUNT(*) FILTER (WHERE generation_occurrences > 1)::INTEGER AS rows_in_duplicate_groups,
       COUNT(DISTINCT normalized_form) FILTER (WHERE generation_occurrences > 1)::INTEGER
         AS duplicate_surface_groups,
       COUNT(*) FILTER (WHERE candidate_exact)::INTEGER AS existing_candidate_exact,
       COUNT(*) FILTER (WHERE candidate_reading_mismatch)::INTEGER AS existing_candidate_reading_mismatch,
       COUNT(*) FILTER (WHERE word_exact)::INTEGER AS existing_word_exact,
       COUNT(*) FILTER (WHERE word_reading_mismatch)::INTEGER AS existing_word_reading_mismatch,
       COUNT(*) FILTER (WHERE NOT known_surface)::INTEGER AS brand_new_surface_rows,
       COUNT(*) FILTER (
         WHERE generation_order = 1 AND candidate_exact
       )::INTEGER AS distinct_existing_candidate_exact,
       COUNT(*) FILTER (
         WHERE generation_order = 1 AND word_exact
       )::INTEGER AS distinct_existing_word_exact,
       COUNT(*) FILTER (
         WHERE generation_order = 1 AND (candidate_exact OR word_exact)
       )::INTEGER AS distinct_existing_exact,
       COUNT(*) FILTER (
         WHERE generation_order = 1
           AND known_surface
           AND NOT candidate_exact
           AND NOT word_exact
       )::INTEGER AS distinct_reading_mismatch_only,
       COUNT(*) FILTER (
         WHERE generation_order = 1 AND NOT known_surface
       )::INTEGER AS distinct_brand_new_surface
     FROM compared`,
    [prefix, katakanaForReadingNormalization, hiraganaForReadingNormalization],
  );
  const duplicateSamples = await sql.query(
    `SELECT staged.normalized_form,
            ARRAY_AGG(staged.surface ORDER BY batch.batch_key, staged.item_order) AS surfaces,
            ARRAY_AGG(staged.reading ORDER BY batch.batch_key, staged.item_order) AS readings,
            ARRAY_AGG(batch.batch_key ORDER BY batch.batch_key, staged.item_order) AS batch_keys
     FROM ai_word_staged_candidates staged
     JOIN ai_word_generation_batches batch ON batch.id = staged.generation_batch_id
     WHERE batch.batch_key LIKE $1 || '%'
     GROUP BY staged.normalized_form
     HAVING COUNT(*) > 1
     ORDER BY staged.normalized_form
     LIMIT 30`,
    [prefix],
  );
  const mismatchSamples = await sql.query(
    `SELECT staged.surface,
            staged.reading AS staged_reading,
            candidate.reading AS existing_candidate_reading,
            batch.batch_key
     FROM ai_word_staged_candidates staged
     JOIN ai_word_generation_batches batch ON batch.id = staged.generation_batch_id
     JOIN ai_word_candidates candidate ON candidate.normalized_form = staged.normalized_form
     WHERE batch.batch_key LIKE $1 || '%'
       AND candidate.reading <> staged.reading
     ORDER BY staged.normalized_form, batch.batch_key
     LIMIT 30`,
    [prefix],
  );
  const wordReadingMismatchSamples = await sql.query(
    `SELECT staged.surface,
            staged.reading AS staged_reading,
            ARRAY_AGG(
              DISTINCT translate(word.reading, $2, $3)
              ORDER BY translate(word.reading, $2, $3)
            ) AS existing_word_readings,
            batch.batch_key
     FROM ai_word_staged_candidates staged
     JOIN ai_word_generation_batches batch ON batch.id = staged.generation_batch_id
     JOIN words word ON word.normalized_form = staged.normalized_form
     WHERE batch.batch_key LIKE $1 || '%'
       AND NOT EXISTS (
         SELECT 1
         FROM words exact_word
         WHERE exact_word.normalized_form = staged.normalized_form
           AND translate(exact_word.reading, $2, $3) = staged.reading
       )
       AND NOT EXISTS (
         SELECT 1
         FROM ai_word_candidates candidate
         WHERE candidate.normalized_form = staged.normalized_form
           AND candidate.reading = staged.reading
       )
     GROUP BY staged.surface, staged.reading, batch.batch_key
     ORDER BY staged.surface, batch.batch_key
     LIMIT 30`,
    [prefix, katakanaForReadingNormalization, hiraganaForReadingNormalization],
  );
  console.log(JSON.stringify({
    batchPrefix: prefix,
    comparisonOnly: true,
    candidatesChanged: false,
    idsAssigned: false,
    summary,
    duplicateSamples,
    readingMismatchSamples: mismatchSamples,
    wordReadingMismatchSamples,
  }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  compareStaging()
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(closePostgresClient);
}

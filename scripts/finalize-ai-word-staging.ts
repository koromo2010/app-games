import { pathToFileURL } from "node:url";
import {
  closePostgresClient,
  getPostgresClient,
  getPostgresConfig,
} from "../lib/postgres-store.ts";
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
    throw new Error("AI_WORD_STAGING_FINALIZATION_LOCAL_DATABASE_REQUIRED");
  }
}

async function finalizeStaging() {
  assertLocalDatabase();
  await ensureWordMasterSchema();
  const sql = getPostgresClient();
  const prefix = readBatchPrefix();

  const batches = await sql.query(
    `SELECT id, batch_key, status
     FROM ai_word_generation_batches
     WHERE batch_key LIKE $1 || '%'
     ORDER BY batch_key`,
    [prefix],
  );
  if (batches.length === 0) {
    throw new Error(`AI_WORD_STAGING_FINALIZATION_BATCHES_NOT_FOUND:${prefix}`);
  }
  const invalidBatch = batches.find((batch) => !["staged", "completed"].includes(String(batch.status)));
  if (invalidBatch) {
    throw new Error(
      `AI_WORD_STAGING_FINALIZATION_BATCH_NOT_READY:${invalidBatch.batch_key}:${invalidBatch.status}`,
    );
  }

  const conflicts = await sql.query(
    `WITH canonical AS (
       SELECT DISTINCT ON (staged.normalized_form)
              staged.normalized_form, staged.surface, staged.reading
       FROM ai_word_staged_candidates staged
       JOIN ai_word_generation_batches batch ON batch.id = staged.generation_batch_id
       WHERE batch.batch_key LIKE $1 || '%'
       ORDER BY staged.normalized_form, batch.batch_key, staged.item_order
     )
     SELECT canonical.surface,
            canonical.reading AS staged_reading,
            candidate.reading AS candidate_reading
     FROM canonical
     JOIN ai_word_candidates candidate
       ON candidate.normalized_form = canonical.normalized_form
     WHERE candidate.reading <> canonical.reading
     ORDER BY canonical.normalized_form`,
    [prefix],
  );
  if (conflicts.length > 0) {
    throw new Error(
      `AI_WORD_STAGING_FINALIZATION_READING_CONFLICT:${JSON.stringify(conflicts)}`,
    );
  }

  const insertedCandidates = await sql.query(
    `WITH canonical AS (
       SELECT DISTINCT ON (staged.normalized_form)
              staged.*
       FROM ai_word_staged_candidates staged
       JOIN ai_word_generation_batches batch ON batch.id = staged.generation_batch_id
       WHERE batch.batch_key LIKE $1 || '%'
       ORDER BY staged.normalized_form, batch.batch_key, staged.item_order
     )
     INSERT INTO ai_word_candidates (
       surface, normalized_form, reading, category_key, generation_batch_id
     )
     SELECT canonical.surface,
            canonical.normalized_form,
            canonical.reading,
            canonical.category_key,
            canonical.generation_batch_id
     FROM canonical
     LEFT JOIN ai_word_candidates candidate
       ON candidate.normalized_form = canonical.normalized_form
     WHERE candidate.id IS NULL
     ORDER BY canonical.id
     ON CONFLICT (normalized_form) DO NOTHING
     RETURNING id`,
    [prefix],
  );

  await sql.query(
    `WITH ranked AS (
       SELECT staged.*,
              FIRST_VALUE(staged.id) OVER (
                PARTITION BY staged.normalized_form
                ORDER BY batch.batch_key, staged.item_order
              ) AS canonical_staged_candidate_id,
              ROW_NUMBER() OVER (
                PARTITION BY staged.normalized_form
                ORDER BY batch.batch_key, staged.item_order
              ) AS generation_order
       FROM ai_word_staged_candidates staged
       JOIN ai_word_generation_batches batch ON batch.id = staged.generation_batch_id
       WHERE batch.batch_key LIKE $1 || '%'
     )
     INSERT INTO ai_word_staging_resolutions (
       staged_candidate_id,
       canonical_staged_candidate_id,
       candidate_id,
       resolution_kind
     )
     SELECT ranked.id,
            ranked.canonical_staged_candidate_id,
            candidate.id,
            CASE
              WHEN ranked.generation_order > 1 THEN 'generated_duplicate'
              WHEN candidate.generation_batch_id = ranked.generation_batch_id
                THEN 'inserted_candidate'
              ELSE 'existing_candidate'
            END
     FROM ranked
     JOIN ai_word_candidates candidate
       ON candidate.normalized_form = ranked.normalized_form
      AND candidate.reading = ranked.reading
     ON CONFLICT (staged_candidate_id) DO NOTHING`,
    [prefix],
  );

  await sql.query(
    `WITH target_batches AS (
       SELECT id
       FROM ai_word_generation_batches
       WHERE batch_key LIKE $1 || '%'
     ),
     counts AS (
       SELECT staged.generation_batch_id,
              COUNT(*) FILTER (
                WHERE resolution.resolution_kind = 'inserted_candidate'
              )::INTEGER AS inserted_count,
              COUNT(*) FILTER (
                WHERE resolution.resolution_kind <> 'inserted_candidate'
              )::INTEGER AS duplicate_count,
              COUNT(resolution.id)::INTEGER AS resolved_count
       FROM ai_word_staged_candidates staged
       JOIN target_batches target ON target.id = staged.generation_batch_id
       LEFT JOIN ai_word_staging_resolutions resolution
         ON resolution.staged_candidate_id = staged.id
       GROUP BY staged.generation_batch_id
     )
     UPDATE ai_word_generation_batches batch
     SET status = CASE
           WHEN counts.resolved_count = batch.requested_count THEN 'completed'
           ELSE 'partial'
         END,
         inserted_count = counts.inserted_count,
         duplicate_count = counts.duplicate_count,
         error_message = CASE
           WHEN counts.resolved_count = batch.requested_count THEN ''
           ELSE 'staged resolution count does not match requested count'
         END,
         completed_at = NOW()
     FROM counts
     WHERE batch.id = counts.generation_batch_id`,
    [prefix],
  );

  const [summary] = await sql.query(
    `SELECT
       COUNT(*)::INTEGER AS staged_rows,
       COUNT(DISTINCT resolution.candidate_id)::INTEGER AS distinct_candidates,
       COUNT(*) FILTER (
         WHERE resolution.resolution_kind = 'inserted_candidate'
       )::INTEGER AS inserted_candidates,
       COUNT(*) FILTER (
         WHERE resolution.resolution_kind = 'existing_candidate'
       )::INTEGER AS reused_existing_candidates,
       COUNT(*) FILTER (
         WHERE resolution.resolution_kind = 'generated_duplicate'
       )::INTEGER AS generated_duplicate_rows,
       COUNT(DISTINCT resolution.candidate_id) FILTER (
         WHERE EXISTS (
           SELECT 1
           FROM ai_word_candidates candidate
           JOIN words word
             ON word.normalized_form = candidate.normalized_form
            AND translate(word.reading, $2, $3) = candidate.reading
           WHERE candidate.id = resolution.candidate_id
         )
       )::INTEGER AS candidates_with_existing_word,
       COUNT(DISTINCT resolution.candidate_id) FILTER (
         WHERE NOT EXISTS (
           SELECT 1
           FROM ai_word_candidates candidate
           JOIN words word
             ON word.normalized_form = candidate.normalized_form
            AND translate(word.reading, $2, $3) = candidate.reading
           WHERE candidate.id = resolution.candidate_id
         )
       )::INTEGER AS new_lexeme_candidates,
       COUNT(*) FILTER (WHERE resolution.id IS NULL)::INTEGER AS unresolved_rows
     FROM ai_word_staged_candidates staged
     JOIN ai_word_generation_batches batch ON batch.id = staged.generation_batch_id
     LEFT JOIN ai_word_staging_resolutions resolution
       ON resolution.staged_candidate_id = staged.id
     WHERE batch.batch_key LIKE $1 || '%'`,
    [prefix, katakanaForReadingNormalization, hiraganaForReadingNormalization],
  );
  const incompleteBatches = await sql.query(
    `SELECT batch_key, status, requested_count, inserted_count, duplicate_count
     FROM ai_word_generation_batches
     WHERE batch_key LIKE $1 || '%'
       AND status <> 'completed'
     ORDER BY batch_key`,
    [prefix],
  );
  if (Number(summary.unresolved_rows) !== 0 || incompleteBatches.length > 0) {
    throw new Error(
      `AI_WORD_STAGING_FINALIZATION_INCOMPLETE:${JSON.stringify({ summary, incompleteBatches })}`,
    );
  }

  const newLexemes = process.argv.includes("--list-new-lexemes")
    ? await sql.query(
      `SELECT DISTINCT candidate.surface, candidate.reading, candidate.category_key
       FROM ai_word_staged_candidates staged
       JOIN ai_word_generation_batches batch ON batch.id = staged.generation_batch_id
       JOIN ai_word_staging_resolutions resolution
         ON resolution.staged_candidate_id = staged.id
       JOIN ai_word_candidates candidate ON candidate.id = resolution.candidate_id
       WHERE batch.batch_key LIKE $1 || '%'
         AND NOT EXISTS (
           SELECT 1
           FROM words word
           WHERE word.normalized_form = candidate.normalized_form
             AND translate(word.reading, $2, $3) = candidate.reading
         )
       ORDER BY candidate.category_key, candidate.surface`,
      [prefix, katakanaForReadingNormalization, hiraganaForReadingNormalization],
    )
    : undefined;

  console.log(JSON.stringify({
    batchPrefix: prefix,
    batchCount: batches.length,
    newlyInsertedCandidates: insertedCandidates.length,
    summary,
    incompleteBatches,
    ...(newLexemes ? { newLexemes } : {}),
    permanentWordIdsAssigned: false,
  }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  finalizeStaging()
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(closePostgresClient);
}

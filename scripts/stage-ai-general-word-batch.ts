import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { parseAiWordBatchInput } from "../lib/ai-word-candidate-batch.ts";
import { generalWordGenres } from "../lib/general-word-genres.ts";
import { closePostgresClient, getPostgresClient, getPostgresConfig } from "../lib/postgres-store.ts";
import { ensureWordMasterSchema } from "../lib/word-master-schema.ts";

function readInputPath() {
  const value = process.argv.find((argument) => argument.startsWith("--input="))?.slice("--input=".length);
  if (!value) throw new Error("Use --input=.word-master-local/<batch>.json");
  return path.resolve(process.cwd(), value);
}

function assertLocalDatabase() {
  const config = getPostgresConfig();
  if (!config) throw new Error("DATABASE_URL is required");
  const hostname = new URL(config.url).hostname.toLowerCase();
  if (!["127.0.0.1", "localhost", "::1", "[::1]"].includes(hostname)) {
    throw new Error("AI_WORD_STAGING_LOCAL_DATABASE_REQUIRED");
  }
}

async function seedCategories() {
  const sql = getPostgresClient();
  for (const [index, genre] of generalWordGenres.entries()) {
    await sql.query(
      `INSERT INTO ai_word_categories (
         category_key, display_name, sort_order, target_count, active, updated_at
       )
       VALUES ($1, $2, $3, 30, TRUE, NOW())
       ON CONFLICT (category_key) DO UPDATE SET
         display_name = EXCLUDED.display_name,
         sort_order = EXCLUDED.sort_order,
         active = TRUE,
         updated_at = NOW()`,
      [genre.key, genre.name, index + 1],
    );
  }
}

async function assertRepairableBatch(batchId: string | number) {
  const sql = getPostgresClient();
  const candidates = await sql.query(
    `SELECT candidate.id,
            candidate.review_status,
            candidate.quality_status,
            candidate.content_safety_status,
            candidate.difficulty,
            candidate.promoted_word_id,
            EXISTS (
              SELECT 1 FROM ai_word_candidate_quality_reviews review
              WHERE review.candidate_id = candidate.id
            ) AS has_quality_history,
            EXISTS (
              SELECT 1 FROM ai_word_candidate_content_safety_reviews review
              WHERE review.candidate_id = candidate.id
            ) AS has_safety_history,
            EXISTS (
              SELECT 1 FROM ai_word_candidate_classifications classification
              WHERE classification.candidate_id = candidate.id
            ) AS has_classification_history,
            EXISTS (
              SELECT 1 FROM ai_word_candidate_corrections correction
              WHERE correction.candidate_id = candidate.id
            ) AS has_correction_history
     FROM ai_word_candidates candidate
     WHERE candidate.generation_batch_id = $1
     ORDER BY candidate.id`,
    [batchId],
  );
  const unsafe = candidates.find((candidate) =>
    candidate.review_status !== "generated"
    || candidate.quality_status !== "unreviewed"
    || candidate.content_safety_status !== "unreviewed"
    || candidate.difficulty !== null
    || candidate.promoted_word_id !== null
    || candidate.has_quality_history
    || candidate.has_safety_history
    || candidate.has_classification_history
    || candidate.has_correction_history
  );
  if (unsafe) throw new Error("AI_WORD_STAGING_REPAIR_REVIEWED_BATCH_REFUSED");
  return candidates;
}

async function stageBatch() {
  assertLocalDatabase();
  const raw = await fs.readFile(readInputPath(), "utf8");
  const parsed = parseAiWordBatchInput(JSON.parse(raw));
  const checksum = createHash("sha256").update(raw).digest("hex");
  if (parsed.rejected.length > 0) {
    throw new Error(`AI_WORD_STAGING_INVALID_ITEMS:${parsed.rejected.length}`);
  }

  await ensureWordMasterSchema();
  await seedCategories();
  const sql = getPostgresClient();
  const existing = await sql.query(
    `SELECT id, input_checksum, status
     FROM ai_word_generation_batches
     WHERE batch_key = $1`,
    [parsed.batch.batchKey],
  );
  if (existing[0] && existing[0].input_checksum !== checksum) {
    throw new Error(`AI_WORD_BATCH_KEY_REUSED_WITH_DIFFERENT_INPUT:${parsed.batch.batchKey}`);
  }

  let batchId: string | number;
  let repairedCandidateCount = 0;
  if (existing[0]) {
    batchId = existing[0].id as string | number;
    const staged = await sql.query(
      "SELECT COUNT(*)::INTEGER AS count FROM ai_word_staged_candidates WHERE generation_batch_id = $1",
      [batchId],
    );
    if (existing[0].status === "staged" && Number(staged[0]?.count ?? 0) === parsed.accepted.length) {
      console.log(JSON.stringify({
        batchKey: parsed.batch.batchKey,
        alreadyStaged: true,
        stagedCount: parsed.accepted.length,
        comparisonDeferred: true,
      }, null, 2));
      return;
    }
    if (!process.argv.includes("--repair-imported-batch")) {
      throw new Error(`AI_WORD_STAGING_BATCH_ALREADY_IMPORTED:${parsed.batch.batchKey}`);
    }
    const candidates = await assertRepairableBatch(batchId);
    repairedCandidateCount = candidates.length;
  } else {
    const rows = await sql.query(
      `INSERT INTO ai_word_generation_batches (
         batch_key, generated_by, model, prompt_version, input_checksum,
         category_keys, status, requested_count, invalid_count
       )
       VALUES ($1, $2, $3, $4, $5, $6, 'staged', $7, 0)
       RETURNING id`,
      [
        parsed.batch.batchKey,
        parsed.batch.generatedBy,
        parsed.batch.model,
        parsed.batch.promptVersion,
        checksum,
        parsed.categoryKeys,
        parsed.accepted.length,
      ],
    );
    batchId = rows[0].id as string | number;
  }

  let stagedCount = 0;
  for (const [index, candidate] of parsed.accepted.entries()) {
    const inserted = await sql.query(
      `INSERT INTO ai_word_staged_candidates (
         generation_batch_id, item_order, surface, normalized_form, reading, category_key
       )
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (generation_batch_id, item_order) DO NOTHING
       RETURNING id`,
      [
        batchId,
        index + 1,
        candidate.surface,
        candidate.normalizedForm,
        candidate.reading,
        candidate.categoryKey,
      ],
    );
    stagedCount += inserted.length;
  }

  if (repairedCandidateCount > 0) {
    await sql.query(
      "DELETE FROM ai_word_candidates WHERE generation_batch_id = $1",
      [batchId],
    );
  }
  await sql.query(
    `UPDATE ai_word_generation_batches
     SET status = 'staged',
         requested_count = $2,
         inserted_count = 0,
         duplicate_count = 0,
         invalid_count = 0,
         error_message = '',
         completed_at = NOW()
     WHERE id = $1`,
    [batchId, parsed.accepted.length],
  );

  const [verification] = await sql.query(
    `SELECT COUNT(*)::INTEGER AS staged_count
     FROM ai_word_staged_candidates
     WHERE generation_batch_id = $1`,
    [batchId],
  );
  console.log(JSON.stringify({
    batchKey: parsed.batch.batchKey,
    stagedCount: Number(verification.staged_count),
    newlyStagedCount: stagedCount,
    repairedCandidateCount,
    comparisonDeferred: true,
    matchedWordIdsAssigned: 0,
  }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  stageBatch()
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(closePostgresClient);
}

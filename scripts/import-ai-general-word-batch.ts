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
    throw new Error("AI_WORD_IMPORT_LOCAL_DATABASE_REQUIRED");
  }
}

async function seedCategories() {
  const sql = getPostgresClient();
  for (const [index, genre] of generalWordGenres.entries()) {
    await sql.query(
      `
        INSERT INTO ai_word_categories (
          category_key, display_name, sort_order, target_count, active, updated_at
        )
        VALUES ($1, $2, $3, 30, TRUE, NOW())
        ON CONFLICT (category_key) DO UPDATE SET
          display_name = EXCLUDED.display_name,
          sort_order = EXCLUDED.sort_order,
          active = TRUE,
          updated_at = NOW()
      `,
      [genre.key, genre.name, index + 1],
    );
  }
}

async function importBatch() {
  assertLocalDatabase();
  const inputPath = readInputPath();
  const raw = await fs.readFile(inputPath, "utf8");
  const parsed = parseAiWordBatchInput(JSON.parse(raw));
  const checksum = createHash("sha256").update(raw).digest("hex");

  await ensureWordMasterSchema();
  await seedCategories();
  const sql = getPostgresClient();
  const existingBatches = await sql.query(
    "SELECT id, input_checksum, status FROM ai_word_generation_batches WHERE batch_key = $1",
    [parsed.batch.batchKey],
  );
  if (existingBatches[0] && existingBatches[0].input_checksum !== checksum) {
    throw new Error(`AI_WORD_BATCH_KEY_REUSED_WITH_DIFFERENT_INPUT:${parsed.batch.batchKey}`);
  }
  if (existingBatches[0]) {
    console.log(JSON.stringify({
      batchKey: parsed.batch.batchKey,
      status: existingBatches[0].status,
      alreadyImported: true,
    }, null, 2));
    return;
  }

  const rows = await sql.query(
    `
      INSERT INTO ai_word_generation_batches (
        batch_key, generated_by, model, prompt_version, input_checksum,
        category_keys, requested_count, invalid_count
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id
    `,
    [
      parsed.batch.batchKey,
      parsed.batch.generatedBy,
      parsed.batch.model,
      parsed.batch.promptVersion,
      checksum,
      parsed.categoryKeys,
      parsed.accepted.length + parsed.rejected.length,
      parsed.rejected.length,
    ],
  );
  const batchId = rows[0].id as string | number;

  let insertedCount = 0;
  let duplicateCount = 0;
  for (const candidate of parsed.accepted) {
    const matchedWords = await sql.query(
      `
        SELECT id
        FROM words
        WHERE normalized_form = $1
        ORDER BY active DESC, id
        LIMIT 1
      `,
      [candidate.normalizedForm],
    );
    const inserted = await sql.query(
      `
        INSERT INTO ai_word_candidates (
          surface, normalized_form, reading, category_key,
          generation_batch_id, matched_word_id
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (normalized_form) DO NOTHING
        RETURNING id
      `,
      [
        candidate.surface,
        candidate.normalizedForm,
        candidate.reading,
        candidate.categoryKey,
        batchId,
        matchedWords[0]?.id ?? null,
      ],
    );
    if (inserted.length > 0) insertedCount += 1;
    else duplicateCount += 1;
  }

  const status = parsed.rejected.length > 0 || duplicateCount > 0 ? "partial" : "completed";
  await sql.query(
    `
      UPDATE ai_word_generation_batches
      SET status = $2,
          inserted_count = $3,
          duplicate_count = $4,
          invalid_count = $5,
          error_message = '',
          completed_at = NOW()
      WHERE id = $1
    `,
    [batchId, status, insertedCount, duplicateCount, parsed.rejected.length],
  );

  const counts = await sql.query(
    `
      SELECT category.category_key, category.display_name, category.target_count,
             COUNT(candidate.id)::INTEGER AS candidate_count
      FROM ai_word_categories category
      LEFT JOIN ai_word_candidates candidate
        ON candidate.category_key = category.category_key
       AND candidate.review_status <> 'rejected'
      WHERE category.category_key = ANY($1::TEXT[])
      GROUP BY category.category_key, category.display_name, category.target_count, category.sort_order
      ORDER BY category.sort_order
    `,
    [parsed.categoryKeys],
  );

  console.log(JSON.stringify({
    batchKey: parsed.batch.batchKey,
    status,
    insertedCount,
    duplicateCount,
    invalidCount: parsed.rejected.length,
    rejected: parsed.rejected,
    categoryProgress: counts,
  }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  importBatch()
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(closePostgresClient);
}

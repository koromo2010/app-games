import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  matchesAiWordBulkDifficultyTarget,
  parseAiWordBulkDifficultyClassificationInput,
} from "../lib/ai-word-bulk-difficulty-classification.ts";
import { normalizeAiWordSurface } from "../lib/ai-word-candidate-batch.ts";
import { closePostgresClient, getPostgresClient, getPostgresConfig } from "../lib/postgres-store.ts";
import { ensureWordMasterSchema } from "../lib/word-master-schema.ts";

function readInputPath() {
  const value = process.argv.find((argument) => argument.startsWith("--input="))?.slice("--input=".length);
  if (!value) throw new Error("Use --input=.word-master-local/<bulk-classification>.json");
  return path.resolve(process.cwd(), value);
}

function assertLocalDatabase() {
  const config = getPostgresConfig();
  if (!config) throw new Error("DATABASE_URL is required");
  const hostname = new URL(config.url).hostname.toLowerCase();
  if (!["127.0.0.1", "localhost", "::1", "[::1]"].includes(hostname)) {
    throw new Error("AI_WORD_BULK_CLASSIFICATION_LOCAL_DATABASE_REQUIRED");
  }
}

async function importBulkClassification() {
  assertLocalDatabase();
  const inputPath = readInputPath();
  const raw = await fs.readFile(inputPath, "utf8");
  const classification = parseAiWordBulkDifficultyClassificationInput(JSON.parse(raw));
  const checksum = createHash("sha256").update(raw).digest("hex");

  await ensureWordMasterSchema();
  const sql = getPostgresClient();
  const existing = await sql.query(
    `SELECT input_checksum, status, easy_count, normal_count, hard_count
     FROM ai_word_classification_batches
     WHERE classification_key = $1`,
    [classification.classificationKey],
  );
  if (existing[0] && existing[0].input_checksum !== checksum) {
    throw new Error(`AI_WORD_BULK_CLASSIFICATION_KEY_REUSED:${classification.classificationKey}`);
  }
  if (existing[0]) {
    console.log(JSON.stringify({
      classificationKey: classification.classificationKey,
      status: existing[0].status,
      alreadyImported: true,
      easy: Number(existing[0].easy_count),
      normal: Number(existing[0].normal_count),
      hard: Number(existing[0].hard_count),
    }, null, 2));
    return;
  }

  const allCandidates = await sql.query(
    `SELECT candidate.id,
            candidate.surface,
            candidate.normalized_form,
            candidate.category_key,
            generation_batch.batch_key AS generation_batch_key
     FROM ai_word_candidates candidate
     JOIN ai_word_generation_batches generation_batch
       ON generation_batch.id = candidate.generation_batch_id
     WHERE candidate.quality_status = 'approved'
     ORDER BY candidate.id`,
  );
  const candidates = allCandidates.filter((candidate) => matchesAiWordBulkDifficultyTarget(
    classification,
    String(candidate.generation_batch_key),
  ));
  if (candidates.length !== classification.expectedCount) {
    throw new Error(
      `AI_WORD_BULK_CLASSIFICATION_TARGET_COUNT_INVALID:${classification.expectedCount}:${candidates.length}`,
    );
  }

  const categoryDefaults = new Map(
    classification.categoryDefaults.map((item) => [item.categoryKey, item.classification]),
  );
  const exceptions = new Map(
    classification.exceptions.map((item) => [normalizeAiWordSurface(item.surface), item]),
  );
  const matchedExceptions = new Set<string>();
  const assignments = candidates.map((candidate) => {
    const normalized = String(candidate.normalized_form);
    const exception = exceptions.get(normalized);
    if (exception) matchedExceptions.add(normalized);
    const judgment = exception
      ?? categoryDefaults.get(String(candidate.category_key))
      ?? classification.defaultClassification;
    return {
      candidateId: candidate.id as string | number,
      categoryKey: String(candidate.category_key),
      difficulty: judgment.difficulty,
      confidence: judgment.confidence,
      reason: judgment.reason,
    };
  });
  const unmatched = [...exceptions.keys()].filter((surface) => !matchedExceptions.has(surface));
  if (unmatched.length > 0) {
    throw new Error(`AI_WORD_BULK_CLASSIFICATION_EXCEPTION_NOT_FOUND:${unmatched.join(",")}`);
  }

  const categoryKeys = [...new Set(assignments.map((assignment) => assignment.categoryKey))];
  const batchRows = await sql.query(
    `INSERT INTO ai_word_classification_batches (
       classification_key, classified_by, model, rubric_version,
       input_checksum, category_keys
     )
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [
      classification.classificationKey,
      classification.classifiedBy,
      classification.model,
      classification.rubricVersion,
      checksum,
      categoryKeys,
    ],
  );
  const batchId = batchRows[0].id as string | number;
  const counts = { easy: 0, normal: 0, hard: 0 };
  for (const assignment of assignments) {
    await sql.query(
      `INSERT INTO ai_word_candidate_classifications (
         candidate_id, classification_batch_id, difficulty, confidence, reason
       )
       VALUES ($1, $2, $3, $4, $5)`,
      [
        assignment.candidateId,
        batchId,
        assignment.difficulty,
        assignment.confidence,
        assignment.reason,
      ],
    );
    await sql.query(
      `UPDATE ai_word_candidates
       SET difficulty = $2,
           classification_confidence = $3,
           classification_reason = $4,
           review_status = 'classified',
           updated_at = NOW()
       WHERE id = $1`,
      [
        assignment.candidateId,
        assignment.difficulty,
        assignment.confidence,
        assignment.reason,
      ],
    );
    counts[assignment.difficulty] += 1;
  }

  await sql.query(
    `UPDATE ai_word_classification_batches
     SET status = 'completed',
         easy_count = $2,
         normal_count = $3,
         hard_count = $4,
         completed_at = NOW()
     WHERE id = $1`,
    [batchId, counts.easy, counts.normal, counts.hard],
  );

  console.log(JSON.stringify({
    classificationKey: classification.classificationKey,
    status: "completed",
    classifiedCount: assignments.length,
    ...counts,
  }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  importBulkClassification()
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(closePostgresClient);
}

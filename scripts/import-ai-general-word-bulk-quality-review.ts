import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  matchesAiWordBulkQualityTarget,
  parseAiWordBulkQualityReviewInput,
} from "../lib/ai-word-bulk-quality-review.ts";
import { normalizeAiWordSurface } from "../lib/ai-word-candidate-batch.ts";
import { applyAiWordQualityPolicy } from "../lib/ai-word-quality-review.ts";
import { closePostgresClient, getPostgresClient, getPostgresConfig } from "../lib/postgres-store.ts";
import { ensureWordMasterSchema } from "../lib/word-master-schema.ts";

function readInputPath() {
  const value = process.argv.find((argument) => argument.startsWith("--input="))?.slice("--input=".length);
  if (!value) throw new Error("Use --input=.word-master-local/<bulk-quality-review>.json");
  return path.resolve(process.cwd(), value);
}

function assertLocalDatabase() {
  const config = getPostgresConfig();
  if (!config) throw new Error("DATABASE_URL is required");
  const hostname = new URL(config.url).hostname.toLowerCase();
  if (!["127.0.0.1", "localhost", "::1", "[::1]"].includes(hostname)) {
    throw new Error("AI_WORD_BULK_QUALITY_REVIEW_LOCAL_DATABASE_REQUIRED");
  }
}

async function importBulkQualityReview() {
  assertLocalDatabase();
  const inputPath = readInputPath();
  const raw = await fs.readFile(inputPath, "utf8");
  const review = parseAiWordBulkQualityReviewInput(JSON.parse(raw));
  const checksum = createHash("sha256").update(raw).digest("hex");

  await ensureWordMasterSchema();
  const sql = getPostgresClient();
  const existing = await sql.query(
    `SELECT input_checksum, status, approved_count, review_count, rejected_count
     FROM ai_word_quality_review_batches
     WHERE review_key = $1`,
    [review.reviewKey],
  );
  if (existing[0] && existing[0].input_checksum !== checksum) {
    throw new Error(`AI_WORD_BULK_QUALITY_REVIEW_KEY_REUSED:${review.reviewKey}`);
  }
  if (existing[0]) {
    console.log(JSON.stringify({
      reviewKey: review.reviewKey,
      status: existing[0].status,
      alreadyImported: true,
      approved: Number(existing[0].approved_count),
      review: Number(existing[0].review_count),
      rejected: Number(existing[0].rejected_count),
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
     ORDER BY candidate.id`,
  );
  const candidates = allCandidates.filter((candidate) => matchesAiWordBulkQualityTarget(
    review,
    String(candidate.generation_batch_key),
  ));
  if (candidates.length !== review.expectedCount) {
    throw new Error(
      `AI_WORD_BULK_QUALITY_REVIEW_TARGET_COUNT_INVALID:${review.expectedCount}:${candidates.length}`,
    );
  }

  const exceptions = new Map(
    review.exceptions.map((exception) => [normalizeAiWordSurface(exception.surface), exception]),
  );
  const matchedExceptions = new Set<string>();
  const assignments = candidates.map((candidate) => {
    const normalized = String(candidate.normalized_form);
    const exception = exceptions.get(normalized);
    if (exception) matchedExceptions.add(normalized);
    const result = applyAiWordQualityPolicy(String(candidate.surface), {
      decision: exception?.decision ?? review.defaultDecision,
      flags: exception?.flags ?? [],
      reason: exception?.reason ?? review.defaultReason,
    });
    return {
      candidateId: candidate.id as string | number,
      categoryKey: String(candidate.category_key),
      ...result,
    };
  });
  const unmatched = [...exceptions.keys()].filter((surface) => !matchedExceptions.has(surface));
  if (unmatched.length > 0) {
    throw new Error(`AI_WORD_BULK_QUALITY_REVIEW_EXCEPTION_NOT_FOUND:${unmatched.join(",")}`);
  }

  const categoryKeys = [...new Set(assignments.map((assignment) => assignment.categoryKey))];
  const batchRows = await sql.query(
    `INSERT INTO ai_word_quality_review_batches (
       review_key, reviewed_by, model, policy_version, input_checksum, category_keys
     )
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [
      review.reviewKey,
      review.reviewedBy,
      review.model,
      review.policyVersion,
      checksum,
      categoryKeys,
    ],
  );
  const reviewBatchId = batchRows[0].id as string | number;
  const counts = { approved: 0, review: 0, rejected: 0 };
  for (const assignment of assignments) {
    await sql.query(
      `INSERT INTO ai_word_candidate_quality_reviews (
         candidate_id, review_batch_id, decision, flags, reason
       )
       VALUES ($1, $2, $3, $4, $5)`,
      [
        assignment.candidateId,
        reviewBatchId,
        assignment.decision,
        assignment.flags,
        assignment.reason,
      ],
    );
    await sql.query(
      `UPDATE ai_word_candidates
       SET quality_status = $2,
           quality_flags = $3,
           quality_reason = $4,
           quality_reviewed_by = $5,
           quality_review_model = $6,
           quality_policy_version = $7,
           quality_reviewed_at = NOW(),
           review_status = $2,
           updated_at = NOW()
       WHERE id = $1`,
      [
        assignment.candidateId,
        assignment.decision,
        assignment.flags,
        assignment.reason,
        review.reviewedBy,
        review.model,
        review.policyVersion,
      ],
    );
    counts[assignment.decision] += 1;
  }

  await sql.query(
    `UPDATE ai_word_quality_review_batches
     SET status = 'completed',
         approved_count = $2,
         review_count = $3,
         rejected_count = $4,
         completed_at = NOW()
     WHERE id = $1`,
    [reviewBatchId, counts.approved, counts.review, counts.rejected],
  );

  console.log(JSON.stringify({
    reviewKey: review.reviewKey,
    status: "completed",
    reviewedCount: assignments.length,
    ...counts,
    nonApproved: assignments
      .filter((assignment) => assignment.decision !== "approved")
      .map(({ decision, flags, reason }) => ({ decision, flags, reason })),
  }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  importBulkQualityReview()
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(closePostgresClient);
}

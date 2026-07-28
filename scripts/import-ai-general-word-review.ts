import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { normalizeAiWordSurface } from "../lib/ai-word-candidate-batch.ts";
import {
  applyAiWordQualityPolicy,
  parseAiWordQualityReviewInput,
} from "../lib/ai-word-quality-review.ts";
import { closePostgresClient, getPostgresClient, getPostgresConfig } from "../lib/postgres-store.ts";
import { ensureWordMasterSchema } from "../lib/word-master-schema.ts";

function readInputPath() {
  const value = process.argv.find((argument) => argument.startsWith("--input="))?.slice("--input=".length);
  if (!value) throw new Error("Use --input=.word-master-local/<review>.json");
  return path.resolve(process.cwd(), value);
}

function assertLocalDatabase() {
  const config = getPostgresConfig();
  if (!config) throw new Error("DATABASE_URL is required");
  const hostname = new URL(config.url).hostname.toLowerCase();
  if (!["127.0.0.1", "localhost", "::1", "[::1]"].includes(hostname)) {
    throw new Error("AI_WORD_REVIEW_LOCAL_DATABASE_REQUIRED");
  }
}

async function importReview() {
  assertLocalDatabase();
  const inputPath = readInputPath();
  const raw = await fs.readFile(inputPath, "utf8");
  const review = parseAiWordQualityReviewInput(JSON.parse(raw));
  const checksum = createHash("sha256").update(raw).digest("hex");

  await ensureWordMasterSchema();
  const sql = getPostgresClient();
  const existing = await sql.query(
    "SELECT id, input_checksum, status FROM ai_word_quality_review_batches WHERE review_key = $1",
    [review.reviewKey],
  );
  if (existing[0] && existing[0].input_checksum !== checksum) {
    throw new Error(`AI_WORD_REVIEW_KEY_REUSED_WITH_DIFFERENT_INPUT:${review.reviewKey}`);
  }
  if (existing[0]) {
    console.log(JSON.stringify({
      reviewKey: review.reviewKey,
      status: existing[0].status,
      alreadyImported: true,
    }, null, 2));
    return;
  }

  const batchRows = await sql.query(
    `
      INSERT INTO ai_word_quality_review_batches (
        review_key, reviewed_by, model, policy_version, input_checksum, category_keys
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id
    `,
    [
      review.reviewKey,
      review.reviewedBy,
      review.model,
      review.policyVersion,
      checksum,
      review.categories.map((category) => category.categoryKey),
    ],
  );
  const reviewBatchId = batchRows[0].id as string | number;
  const counts = { approved: 0, review: 0, rejected: 0 };

  for (const category of review.categories) {
    const candidates = await sql.query(
      `
        SELECT id, surface
        FROM ai_word_candidates
        WHERE category_key = $1
        ORDER BY id
      `,
      [category.categoryKey],
    );
    if (candidates.length !== 30) {
      throw new Error(`AI_WORD_REVIEW_CATEGORY_COUNT_INVALID:${category.categoryKey}:${candidates.length}`);
    }
    const exceptions = new Map(
      category.exceptions.map((exception) => [normalizeAiWordSurface(exception.surface), exception]),
    );
    const matchedExceptions = new Set<string>();

    for (const candidate of candidates) {
      const normalized = normalizeAiWordSurface(String(candidate.surface));
      const exception = exceptions.get(normalized);
      if (exception) matchedExceptions.add(normalized);
      const result = applyAiWordQualityPolicy(String(candidate.surface), {
        decision: exception?.decision ?? review.defaultDecision,
        flags: exception?.flags ?? [],
        reason: exception?.reason ?? review.defaultReason,
      });
      const { decision, flags, reason } = result;
      counts[decision] += 1;

      await sql.query(
        `
          INSERT INTO ai_word_candidate_quality_reviews (
            candidate_id, review_batch_id, decision, flags, reason
          )
          VALUES ($1, $2, $3, $4, $5)
        `,
        [candidate.id, reviewBatchId, decision, flags, reason],
      );
      await sql.query(
        `
          UPDATE ai_word_candidates
          SET quality_status = $2,
              quality_flags = $3,
              quality_reason = $4,
              quality_reviewed_by = $5,
              quality_review_model = $6,
              quality_policy_version = $7,
              quality_reviewed_at = NOW(),
              review_status = $2,
              updated_at = NOW()
          WHERE id = $1
        `,
        [
          candidate.id,
          decision,
          flags,
          reason,
          review.reviewedBy,
          review.model,
          review.policyVersion,
        ],
      );
    }

    const unmatched = [...exceptions.keys()].filter((surface) => !matchedExceptions.has(surface));
    if (unmatched.length > 0) {
      throw new Error(`AI_WORD_REVIEW_EXCEPTION_NOT_FOUND:${category.categoryKey}:${unmatched.join(",")}`);
    }
  }

  await sql.query(
    `
      UPDATE ai_word_quality_review_batches
      SET status = 'completed',
          approved_count = $2,
          review_count = $3,
          rejected_count = $4,
          completed_at = NOW()
      WHERE id = $1
    `,
    [reviewBatchId, counts.approved, counts.review, counts.rejected],
  );

  console.log(JSON.stringify({
    reviewKey: review.reviewKey,
    status: "completed",
    ...counts,
  }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  importReview()
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(closePostgresClient);
}

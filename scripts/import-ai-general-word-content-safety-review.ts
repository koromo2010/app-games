import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { normalizeAiWordSurface } from "../lib/ai-word-candidate-batch.ts";
import {
  matchesAiWordContentSafetyTarget,
  parseAiWordContentSafetyReviewInput,
} from "../lib/ai-word-content-safety-review.ts";
import {
  closePostgresClient,
  getPostgresClient,
  getPostgresConfig,
  type PostgresClient,
} from "../lib/postgres-store.ts";
import { ensureWordMasterSchema } from "../lib/word-master-schema.ts";

function readInputPath() {
  const value = process.argv.find((argument) => argument.startsWith("--input="))?.slice("--input=".length);
  if (!value) throw new Error("Use --input=.word-master-local/<content-safety-review>.json");
  return path.resolve(process.cwd(), value);
}

function assertLocalDatabase() {
  const config = getPostgresConfig();
  if (!config) throw new Error("DATABASE_URL is required");
  const hostname = new URL(config.url).hostname.toLowerCase();
  if (!["127.0.0.1", "localhost", "::1", "[::1]"].includes(hostname)) {
    throw new Error("AI_WORD_CONTENT_SAFETY_REVIEW_LOCAL_DATABASE_REQUIRED");
  }
}

async function syncLinkedWordSafety(sql: PostgresClient, reviewKey: string) {
  await sql.query(
    `WITH reviewed AS (
       SELECT DISTINCT ON (COALESCE(candidate.promoted_word_id, candidate.matched_word_id))
              COALESCE(candidate.promoted_word_id, candidate.matched_word_id) AS word_id,
              safety_review.decision,
              safety_review.flags,
              review_batch.policy_version
       FROM ai_word_candidate_content_safety_reviews safety_review
       JOIN ai_word_content_safety_review_batches review_batch
         ON review_batch.id = safety_review.review_batch_id
       JOIN ai_word_candidates candidate
         ON candidate.id = safety_review.candidate_id
       WHERE review_batch.review_key = $1
         AND COALESCE(candidate.promoted_word_id, candidate.matched_word_id) IS NOT NULL
       ORDER BY COALESCE(candidate.promoted_word_id, candidate.matched_word_id),
                safety_review.id DESC
     )
     UPDATE words word
     SET content_safety_status = CASE
           WHEN word.content_safety_status = 'exclude' THEN 'exclude'
           ELSE reviewed.decision
         END,
         content_safety_flags = CASE
           WHEN word.content_safety_status = 'exclude' THEN word.content_safety_flags
           ELSE reviewed.flags
         END,
         content_safety_policy_version = CASE
           WHEN word.content_safety_status = 'exclude' THEN word.content_safety_policy_version
           ELSE reviewed.policy_version
         END,
         updated_at = NOW()
     FROM reviewed
     WHERE word.id = reviewed.word_id`,
    [reviewKey],
  );
  await sql.query(
    `WITH reviewed AS (
       SELECT DISTINCT ON (COALESCE(candidate.promoted_word_id, candidate.matched_word_id))
              COALESCE(candidate.promoted_word_id, candidate.matched_word_id) AS word_id,
              candidate.review_status AS candidate_review_status,
              candidate.difficulty AS candidate_difficulty,
              safety_review.decision
       FROM ai_word_candidate_content_safety_reviews safety_review
       JOIN ai_word_content_safety_review_batches review_batch
         ON review_batch.id = safety_review.review_batch_id
       JOIN ai_word_candidates candidate
         ON candidate.id = safety_review.candidate_id
       WHERE review_batch.review_key = $1
         AND COALESCE(candidate.promoted_word_id, candidate.matched_word_id) IS NOT NULL
       ORDER BY COALESCE(candidate.promoted_word_id, candidate.matched_word_id),
                safety_review.id DESC
     )
     UPDATE game_word_settings setting
     SET usable = CASE
           WHEN reviewed.candidate_review_status = 'promoted'
             AND reviewed.candidate_difficulty IS NOT NULL
             THEN TRUE
           WHEN setting.game_type IN ('wordwolf', 'nigoichi')
             THEN COALESCE(word.zipf_frequency >= 2.5, FALSE)
           ELSE COALESCE(
             word.zipf_frequency >= 1.0 AND word.zipf_frequency < 3.5,
             FALSE
           )
         END,
         difficulty = CASE
           WHEN reviewed.candidate_review_status = 'promoted'
             AND reviewed.candidate_difficulty IS NOT NULL
             THEN reviewed.candidate_difficulty
           ELSE setting.difficulty
         END,
         review_status = CASE
           WHEN reviewed.candidate_review_status = 'promoted'
             AND reviewed.candidate_difficulty IS NOT NULL
             THEN 'approved'
           WHEN setting.game_type = 'tahoiya' AND word.zipf_frequency >= 1.0
             THEN 'auto'
           WHEN setting.game_type IN ('wordwolf', 'nigoichi') AND word.zipf_frequency >= 2.5
             THEN 'auto'
           ELSE 'unreviewed'
         END,
         updated_at = NOW()
     FROM reviewed
     JOIN words word ON word.id = reviewed.word_id
     WHERE setting.word_id = reviewed.word_id
       AND reviewed.decision = 'clean'
       AND setting.review_status = 'review'`,
    [reviewKey],
  );
  await sql.query(
    `UPDATE game_word_settings setting
     SET usable = FALSE,
         review_status = CASE
           WHEN word.content_safety_status = 'exclude' THEN 'disabled'
           ELSE 'review'
         END,
         updated_at = NOW()
     FROM words word
     WHERE word.id = setting.word_id
       AND word.content_safety_status IN ('review', 'exclude')`,
  );
}

async function importContentSafetyReview() {
  assertLocalDatabase();
  const inputPath = readInputPath();
  const raw = await fs.readFile(inputPath, "utf8");
  const review = parseAiWordContentSafetyReviewInput(JSON.parse(raw));
  const checksum = createHash("sha256").update(raw).digest("hex");

  await ensureWordMasterSchema();
  const sql = getPostgresClient();
  const existing = await sql.query(
    `SELECT input_checksum, status, clean_count, review_count, exclude_count
     FROM ai_word_content_safety_review_batches
     WHERE review_key = $1`,
    [review.reviewKey],
  );
  if (existing[0] && existing[0].input_checksum !== checksum) {
    throw new Error(
      `AI_WORD_CONTENT_SAFETY_REVIEW_KEY_REUSED_WITH_DIFFERENT_INPUT:${review.reviewKey}`,
    );
  }
  if (existing[0]) {
    await syncLinkedWordSafety(sql, review.reviewKey);
    console.log(JSON.stringify({
      reviewKey: review.reviewKey,
      status: existing[0].status,
      alreadyImported: true,
      clean: Number(existing[0].clean_count),
      review: Number(existing[0].review_count),
      exclude: Number(existing[0].exclude_count),
    }, null, 2));
    return;
  }

  const allCandidates = await sql.query(
    `SELECT candidate.id,
            candidate.surface,
            candidate.normalized_form,
            candidate.quality_status,
            generation_batch.batch_key AS generation_batch_key
     FROM ai_word_candidates candidate
     JOIN ai_word_generation_batches generation_batch
       ON generation_batch.id = candidate.generation_batch_id
     ORDER BY candidate.id`,
  );
  const candidates = allCandidates.filter((candidate) => matchesAiWordContentSafetyTarget(review, {
    generationBatchKey: String(candidate.generation_batch_key),
    qualityStatus: String(candidate.quality_status),
  }));
  if (candidates.length !== review.expectedCount) {
    throw new Error(
      `AI_WORD_CONTENT_SAFETY_REVIEW_TARGET_COUNT_INVALID:${review.expectedCount}:${candidates.length}`,
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
    return {
      candidateId: candidate.id as string | number,
      surface: String(candidate.surface),
      decision: exception?.decision ?? review.defaultDecision,
      flags: exception?.flags ?? [],
      reason: exception?.reason ?? review.defaultReason,
    };
  });
  const unmatched = [...exceptions.keys()].filter((surface) => !matchedExceptions.has(surface));
  if (unmatched.length > 0) {
    throw new Error(`AI_WORD_CONTENT_SAFETY_REVIEW_EXCEPTION_NOT_FOUND:${unmatched.join(",")}`);
  }

  const batchRows = await sql.query(
    `INSERT INTO ai_word_content_safety_review_batches (
       review_key, reviewed_by, model, policy_version, input_checksum, expected_count
     )
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [
      review.reviewKey,
      review.reviewedBy,
      review.model,
      review.policyVersion,
      checksum,
      review.expectedCount,
    ],
  );
  const batchId = batchRows[0].id as string | number;
  const counts = { clean: 0, review: 0, exclude: 0 };
  for (const assignment of assignments) {
    await sql.query(
      `INSERT INTO ai_word_candidate_content_safety_reviews (
         candidate_id, review_batch_id, decision, flags, reason
       )
       VALUES ($1, $2, $3, $4, $5)`,
      [
        assignment.candidateId,
        batchId,
        assignment.decision,
        assignment.flags,
        assignment.reason,
      ],
    );
    await sql.query(
      `UPDATE ai_word_candidates
       SET content_safety_status = $2,
           content_safety_flags = $3,
           content_safety_reason = $4,
           content_safety_reviewed_by = $5,
           content_safety_review_model = $6,
           content_safety_policy_version = $7,
           content_safety_reviewed_at = NOW(),
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
    `UPDATE ai_word_content_safety_review_batches
     SET status = 'completed',
         clean_count = $2,
         review_count = $3,
         exclude_count = $4,
         completed_at = NOW()
     WHERE id = $1`,
    [batchId, counts.clean, counts.review, counts.exclude],
  );
  await syncLinkedWordSafety(sql, review.reviewKey);

  console.log(JSON.stringify({
    reviewKey: review.reviewKey,
    status: "completed",
    reviewedCount: assignments.length,
    ...counts,
    heldForReview: assignments
      .filter((assignment) => assignment.decision === "review")
      .map(({ surface, flags, reason }) => ({ surface, flags, reason })),
    excluded: assignments
      .filter((assignment) => assignment.decision === "exclude")
      .map(({ surface, flags, reason }) => ({ surface, flags, reason })),
  }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  importContentSafetyReview()
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(closePostgresClient);
}

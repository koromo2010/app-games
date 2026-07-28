import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { normalizeAiWordSurface } from "../lib/ai-word-candidate-batch.ts";
import { parseAiWordCorrectionInput } from "../lib/ai-word-correction.ts";
import { closePostgresClient, getPostgresClient, getPostgresConfig } from "../lib/postgres-store.ts";
import { ensureWordMasterSchema } from "../lib/word-master-schema.ts";

function readInputPath() {
  const value = process.argv.find((argument) => argument.startsWith("--input="))?.slice("--input=".length);
  if (!value) throw new Error("Use --input=.word-master-local/<correction>.json");
  return path.resolve(process.cwd(), value);
}

function assertLocalDatabase() {
  const config = getPostgresConfig();
  if (!config) throw new Error("DATABASE_URL is required");
  const hostname = new URL(config.url).hostname.toLowerCase();
  if (!["127.0.0.1", "localhost", "::1", "[::1]"].includes(hostname)) {
    throw new Error("AI_WORD_CORRECTION_LOCAL_DATABASE_REQUIRED");
  }
}

async function applyCorrections() {
  assertLocalDatabase();
  const inputPath = readInputPath();
  const raw = await fs.readFile(inputPath, "utf8");
  const correction = parseAiWordCorrectionInput(JSON.parse(raw));
  const checksum = createHash("sha256").update(raw).digest("hex");

  await ensureWordMasterSchema();
  const sql = getPostgresClient();
  const existing = await sql.query(
    "SELECT id, input_checksum, status FROM ai_word_correction_batches WHERE correction_key = $1",
    [correction.correctionKey],
  );
  if (existing[0] && existing[0].input_checksum !== checksum) {
    throw new Error(`AI_WORD_CORRECTION_KEY_REUSED_WITH_DIFFERENT_INPUT:${correction.correctionKey}`);
  }
  if (existing[0]) {
    console.log(JSON.stringify({
      correctionKey: correction.correctionKey,
      status: existing[0].status,
      alreadyApplied: true,
    }, null, 2));
    return;
  }

  const batchRows = await sql.query(
    `
      INSERT INTO ai_word_correction_batches (
        correction_key, corrected_by, policy_version, input_checksum
      )
      VALUES ($1, $2, $3, $4)
      RETURNING id
    `,
    [correction.correctionKey, correction.correctedBy, correction.policyVersion, checksum],
  );
  const correctionBatchId = batchRows[0].id as string | number;
  let correctedCount = 0;
  let approvedCount = 0;
  let excludedCount = 0;

  for (const item of correction.items) {
    const normalized = normalizeAiWordSurface(item.surface);
    const candidates = await sql.query(
      `
        SELECT id, surface, normalized_form
        FROM ai_word_candidates
        WHERE normalized_form = $1
      `,
      [normalized],
    );
    if (candidates.length !== 1) {
      throw new Error(`AI_WORD_CORRECTION_CANDIDATE_NOT_UNIQUE:${item.surface}:${candidates.length}`);
    }
    const candidate = candidates[0];
    const newSurface = item.action === "replace_surface" ? item.newSurface : null;
    const newNormalized = newSurface ? normalizeAiWordSurface(newSurface) : null;

    if (newNormalized) {
      const conflicts = await sql.query(
        "SELECT id FROM ai_word_candidates WHERE normalized_form = $1 AND id <> $2",
        [newNormalized, candidate.id],
      );
      if (conflicts.length > 0) {
        throw new Error(`AI_WORD_CORRECTION_SURFACE_CONFLICT:${newSurface}`);
      }
    }

    await sql.query(
      `
        INSERT INTO ai_word_candidate_corrections (
          candidate_id, correction_batch_id, action,
          old_surface, old_normalized_form, new_surface, new_normalized_form, reason
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `,
      [
        candidate.id,
        correctionBatchId,
        item.action,
        candidate.surface,
        candidate.normalized_form,
        newSurface,
        newNormalized,
        item.reason,
      ],
    );

    if (item.action === "exclude") {
      await sql.query(
        `
          UPDATE ai_word_candidates
          SET quality_status = 'rejected',
              quality_flags = ARRAY['user_excluded']::TEXT[],
              quality_reason = $2,
              quality_reviewed_by = $3,
              quality_review_model = 'human',
              quality_policy_version = $4,
              quality_reviewed_at = NOW(),
              review_status = 'rejected',
              updated_at = NOW()
          WHERE id = $1
        `,
        [candidate.id, item.reason, correction.correctedBy, correction.policyVersion],
      );
      excludedCount += 1;
    } else if (item.action === "replace_surface") {
      await sql.query(
        `
          UPDATE ai_word_candidates
          SET surface = $2,
              normalized_form = $3,
              quality_status = 'approved',
              quality_flags = '{}',
              quality_reason = $4,
              quality_reviewed_by = $5,
              quality_review_model = 'human',
              quality_policy_version = $6,
              quality_reviewed_at = NOW(),
              review_status = 'approved',
              updated_at = NOW()
          WHERE id = $1
        `,
        [
          candidate.id,
          item.newSurface,
          newNormalized,
          item.reason,
          correction.correctedBy,
          correction.policyVersion,
        ],
      );
      correctedCount += 1;
    } else {
      await sql.query(
        `
          UPDATE ai_word_candidates
          SET quality_status = 'approved',
              quality_flags = '{}',
              quality_reason = $2,
              quality_reviewed_by = $3,
              quality_review_model = 'human',
              quality_policy_version = $4,
              quality_reviewed_at = NOW(),
              review_status = 'approved',
              updated_at = NOW()
          WHERE id = $1
        `,
        [candidate.id, item.reason, correction.correctedBy, correction.policyVersion],
      );
      approvedCount += 1;
    }
  }

  await sql.query(
    `
      UPDATE ai_word_correction_batches
      SET status = 'completed',
          corrected_count = $2,
          approved_count = $3,
          excluded_count = $4,
          completed_at = NOW()
      WHERE id = $1
    `,
    [correctionBatchId, correctedCount, approvedCount, excludedCount],
  );

  console.log(JSON.stringify({
    correctionKey: correction.correctionKey,
    status: "completed",
    correctedCount,
    approvedCount,
    excludedCount,
  }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  applyCorrections()
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(closePostgresClient);
}

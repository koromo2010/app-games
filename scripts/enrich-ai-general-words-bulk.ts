import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  matchesAiWordBulkEnrichmentTarget,
  parseAiWordBulkEnrichmentInput,
} from "../lib/ai-word-bulk-enrichment.ts";
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

function readInputPath() {
  const value = process.argv.find((argument) => argument.startsWith("--input="))?.slice("--input=".length);
  if (!value) throw new Error("Use --input=.word-master-local/<bulk-enrichment>.json");
  return path.resolve(process.cwd(), value);
}

function assertLocalDatabase() {
  const config = getPostgresConfig();
  if (!config) throw new Error("DATABASE_URL is required");
  const hostname = new URL(config.url).hostname.toLowerCase();
  if (!["127.0.0.1", "localhost", "::1", "[::1]"].includes(hostname)) {
    throw new Error("AI_WORD_BULK_ENRICHMENT_LOCAL_DATABASE_REQUIRED");
  }
}

async function enrichBulkAiGeneralWords() {
  assertLocalDatabase();
  const inputPath = readInputPath();
  const input = parseAiWordBulkEnrichmentInput(
    JSON.parse(await fs.readFile(inputPath, "utf8")),
  );

  await ensureWordMasterSchema();
  const sql = getPostgresClient();
  const existing = await sql.query(
    `SELECT id, status, enriched_count
     FROM ai_word_enrichment_batches
     WHERE enrichment_key = $1`,
    [input.enrichmentKey],
  );
  if (existing[0]) {
    console.log(JSON.stringify({
      enrichmentKey: input.enrichmentKey,
      status: existing[0].status,
      enrichedCount: Number(existing[0].enriched_count),
      alreadyImported: true,
    }, null, 2));
    return;
  }

  const allTargets = await sql.query(
    `SELECT candidate.id AS candidate_id,
            candidate.surface,
            candidate.reading,
            candidate.normalized_form,
            candidate.category_key,
            candidate.content_safety_status,
            candidate.content_safety_flags,
            candidate.promoted_word_id AS word_id,
            category.display_name AS category_name,
            generation_batch.batch_key AS generation_batch_key
     FROM ai_word_candidates candidate
     JOIN ai_word_categories category ON category.category_key = candidate.category_key
     JOIN ai_word_generation_batches generation_batch
       ON generation_batch.id = candidate.generation_batch_id
     JOIN words word ON word.id = candidate.promoted_word_id
     JOIN word_sources source ON source.id = word.source_id
     WHERE candidate.quality_status = 'approved'
       AND candidate.content_safety_status = 'clean'
       AND candidate.review_status = 'promoted'
       AND source.source_key = 'ai-general-generated-v1'
     ORDER BY candidate.id`,
  );
  const targets = allTargets.filter((target) => matchesAiWordBulkEnrichmentTarget(
    input,
    String(target.generation_batch_key),
  ));
  if (targets.length !== input.expectedCount) {
    throw new Error(
      `AI_WORD_BULK_ENRICHMENT_TARGET_COUNT_INVALID:${input.expectedCount}:${targets.length}`,
    );
  }

  const batchRows = await sql.query(
    `INSERT INTO ai_word_enrichment_batches (
       enrichment_key, enriched_by, model, policy_version,
       lexical_source_version, expected_count
     )
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [
      input.enrichmentKey,
      input.enrichedBy,
      input.model,
      input.policyVersion,
      input.lexicalSourceVersion,
      input.expectedCount,
    ],
  );
  const batchId = batchRows[0].id as string | number;
  const counts = { lexicalSurfaceVariant: 0, aiCategoryReview: 0 };

  for (const target of targets) {
    const variants = await sql.query(
      `SELECT lexical.primary_part_of_speech,
              lexical.part_of_speech_details,
              lexical.form_status,
              lexical.proper_noun_status,
              lexical.proper_noun_type,
              lexical.person_name_status,
              source.source_key
       FROM words lexical
       JOIN word_sources source ON source.id = lexical.source_id
       WHERE lexical.normalized_form = $1
         AND translate(lexical.reading, $2, $3) <> $4
         AND lexical.primary_part_of_speech = '名詞'
         AND lexical.proper_noun_status = 'common'
         AND NOT lexical.is_name_fragment
         AND source.source_key <> 'ai-general-generated-v1'
       ORDER BY
         CASE WHEN source.source_key = 'sudachidict-core' THEN 0 ELSE 1 END,
         lexical.active DESC,
         lexical.id`,
      [
        target.normalized_form,
        katakanaForReadingNormalization,
        hiraganaForReadingNormalization,
        target.reading,
      ],
    );
    const variant = variants.length === 1 ? variants[0] : null;
    const method = variant ? "lexical_surface_variant" : "ai_category_review";
    const primaryPartOfSpeech = variant?.primary_part_of_speech ?? "名詞";
    const partOfSpeechDetails = variant?.part_of_speech_details ?? ["普通名詞", "一般"];
    const formStatus = variant?.form_status === "unknown" || !variant
      ? "non_inflecting"
      : variant.form_status;
    const properNounStatus = variant?.proper_noun_status ?? "common";
    const properNounType = variant?.proper_noun_type ?? null;
    const personNameStatus = variant?.person_name_status ?? "not_person";
    const confidence = variant ? 0.99 : 0.98;
    const reason = variant
      ? "固定版辞書の同一表記・別読みから、一意な普通名詞の品詞情報を引き継いだ"
      : "品質審査済みの一般名詞候補として、カテゴリと読みを根拠に非活用の普通名詞と判定した";

    await sql.query(
      `INSERT INTO ai_word_candidate_enrichments (
         candidate_id, word_id, enrichment_batch_id, enrichment_method,
         lexical_source_key,
         primary_part_of_speech, part_of_speech_details, form_status,
         proper_noun_status, proper_noun_type, person_name_status,
         surface_quality_status, surface_quality_flags,
         content_safety_status, content_safety_flags,
         confidence, semantic_note, reason
       )
       VALUES (
         $1, $2, $3, $4, $5,
         $6, $7, $8,
         $9, $10, $11,
         'clean', ARRAY[]::TEXT[],
         $12, $13,
         $14, $15, $16
       )`,
      [
        target.candidate_id,
        target.word_id,
        batchId,
        method,
        variant?.source_key ?? "",
        primaryPartOfSpeech,
        partOfSpeechDetails,
        formStatus,
        properNounStatus,
        properNounType,
        personNameStatus,
        target.content_safety_status,
        target.content_safety_flags,
        confidence,
        target.category_name,
        reason,
      ],
    );
    await sql.query(
      `UPDATE words
       SET primary_part_of_speech = $2,
           part_of_speech_details = $3,
           form_status = $4,
           form_classification_reason = $5,
           form_policy_version = $6,
           proper_noun_status = $7,
           proper_noun_type = $8,
           person_name_status = $9,
           is_name_fragment = FALSE,
           person_name_policy_version = $6,
           surface_quality_status = 'clean',
           surface_quality_flags = ARRAY[]::TEXT[],
           surface_quality_policy_version = $6,
           content_safety_status = $10,
           content_safety_flags = $11,
           content_safety_policy_version = $6,
           updated_at = NOW()
       WHERE id = $1`,
      [
        target.word_id,
        primaryPartOfSpeech,
        partOfSpeechDetails,
        formStatus,
        reason,
        input.policyVersion,
        properNounStatus,
        properNounType,
        personNameStatus,
        target.content_safety_status,
        target.content_safety_flags,
      ],
    );
    if (variant) counts.lexicalSurfaceVariant += 1;
    else counts.aiCategoryReview += 1;
  }

  await sql.query(
    `UPDATE ai_word_enrichment_batches
     SET status = 'completed',
         enriched_count = $2,
         error_message = '',
         completed_at = NOW()
     WHERE id = $1`,
    [batchId, targets.length],
  );

  console.log(JSON.stringify({
    enrichmentKey: input.enrichmentKey,
    status: "completed",
    enrichedCount: targets.length,
    ...counts,
  }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  enrichBulkAiGeneralWords()
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(closePostgresClient);
}

import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import {
  generalGameWordDifficultyTags,
  generalGameWordPoolFlag,
  generalGameWordPoolKey,
  normalizeLegacyGeneralGameWordClassifications,
  type LegacyGeneralGameWordClassificationRow,
} from "../lib/general-game-word-classification.ts";
import { sharedEnvironmentVariable } from "../lib/shared-environment.ts";

const targetUrl = sharedEnvironmentVariable("VOCABULARY_ADMIN_DATABASE_URL");
const apply = process.argv.includes("--apply");
const importedReason = "legacy standard-game classification import";

if (!targetUrl) throw new Error("VOCABULARY_ADMIN_DATABASE_URL is required");

const target = neon(targetUrl);

const sourceCandidates = [
  ["LEGACY_WORD_DATABASE_URL", process.env.LEGACY_WORD_DATABASE_URL],
  ["database_DATABASE_URL", process.env.database_DATABASE_URL],
  ["DATABASE_URL", process.env.DATABASE_URL],
  ["POSTGRES_PRISMA_URL", process.env.POSTGRES_PRISMA_URL],
  ["POSTGRES_URL", process.env.POSTGRES_URL],
  ["APP_DATABASE_URL", process.env.APP_DATABASE_URL],
  ["NEON_DATABASE_URL", process.env.NEON_DATABASE_URL],
] as const;

let source: NeonQueryFunction<false, false> | null = null;
let sourceName = "";
const visitedUrls = new Set<string>();
for (const [candidateName, rawCandidateUrl] of sourceCandidates) {
  const candidateUrl = rawCandidateUrl?.trim();
  if (!candidateUrl || candidateUrl === targetUrl || visitedUrls.has(candidateUrl)) continue;
  visitedUrls.add(candidateUrl);
  const candidate = neon(candidateUrl);
  try {
    const sourceTables = await candidate`
      SELECT
        to_regclass('public.shared_word_catalog')::text AS catalog_table,
        to_regclass('public.shared_word_pool_evaluations')::text AS evaluations_table
    ` as Array<{ catalog_table: string | null; evaluations_table: string | null }>;
    if (sourceTables[0]?.catalog_table && sourceTables[0]?.evaluations_table) {
      source = candidate;
      sourceName = candidateName;
      break;
    }
  } catch {
    // Keep probing known server-only compatibility connections. Values and
    // provider error messages must never be written to build logs.
  }
}
if (!source) throw new Error("LEGACY_GENERAL_GAME_CLASSIFICATION_SOURCE_NOT_FOUND");
process.stdout.write(`[general-game-classification] source=${sourceName}\n`);

const targetTables = await target`
    SELECT
      to_regclass('public.words')::text AS words_table,
      to_regclass('public.word_game_eligibility')::text AS eligibility_table
` as Array<{ words_table: string | null; eligibility_table: string | null }>;
if (!targetTables[0]?.words_table || !targetTables[0]?.eligibility_table) {
  throw new Error("GENERAL_GAME_CLASSIFICATION_TARGET_SCHEMA_NOT_FOUND");
}

const sourceRows = await source`
  SELECT
    catalog.word_master_id,
    catalog.surface,
    catalog.reading,
    evaluation.difficulty_tier,
    evaluation.evaluation_flags
  FROM shared_word_catalog catalog
  JOIN shared_word_pool_evaluations evaluation
    ON evaluation.word_master_id = catalog.word_master_id
  WHERE catalog.active
    AND evaluation.pool_key = ${generalGameWordPoolKey}
    AND evaluation.active
    AND evaluation.eligibility_status = 'eligible'
    AND evaluation.difficulty_tier IN ('easy', 'normal', 'hard')
    AND ${generalGameWordPoolFlag} = ANY(evaluation.evaluation_flags)
    AND ('difficulty_' || evaluation.difficulty_tier) = ANY(evaluation.evaluation_flags)
  ORDER BY catalog.word_master_id
` as LegacyGeneralGameWordClassificationRow[];

const records = normalizeLegacyGeneralGameWordClassifications(sourceRows);
if (records.length === 0) throw new Error("GENERAL_GAME_CLASSIFICATION_SOURCE_EMPTY");
const payload = JSON.stringify(records);

const matchRows = await target`
  WITH incoming AS (
    SELECT *
    FROM jsonb_to_recordset(${payload}::jsonb) AS item(
      "wordMasterId" bigint,
      surface text,
      "normalizedSurface" text,
      reading text,
      difficulty text
    )
  )
  SELECT
    COUNT(*)::bigint AS source_count,
    COUNT(word.id)::bigint AS matched_count
  FROM incoming
  LEFT JOIN words word
    ON word.normalized_surface = incoming."normalizedSurface"
    AND COALESCE(word.reading, '') = incoming.reading
    AND word.status = 'active'
` as Array<{ source_count: string; matched_count: string }>;

const sourceCount = Number(matchRows[0]?.source_count ?? 0);
const matchedCount = Number(matchRows[0]?.matched_count ?? 0);
const byDifficulty = Object.fromEntries(
  Object.keys(generalGameWordDifficultyTags).map((difficulty) => [
    difficulty,
    records.filter((record) => record.difficulty === difficulty).length,
  ]),
);

if (!apply) {
  process.stdout.write(JSON.stringify({
    dryRun: true,
    selectedLegacyRows: sourceRows.length,
    uniqueClassifications: records.length,
    matchedTargetWords: matchedCount,
    missingTargetWords: sourceCount - matchedCount,
    byDifficulty,
    next: "Re-run with --apply only after missingTargetWords is zero.",
  }) + "\n");
  process.exit(0);
}

if (matchedCount !== sourceCount) {
  throw new Error("GENERAL_GAME_CLASSIFICATION_TARGET_WORDS_MISSING");
}

await target`
  WITH incoming AS (
    SELECT *
    FROM jsonb_to_recordset(${payload}::jsonb) AS item(
      "wordMasterId" bigint,
      surface text,
      "normalizedSurface" text,
      reading text,
      difficulty text
    )
  ), matched AS (
    SELECT word.id AS word_id, incoming.difficulty
    FROM incoming
    JOIN words word
      ON word.normalized_surface = incoming."normalizedSurface"
      AND COALESCE(word.reading, '') = incoming.reading
      AND word.status = 'active'
  ), desired AS (
    SELECT word_id, ${generalGameWordPoolKey}::text AS game_id,
      TRUE AS enabled, difficulty, ${importedReason}::text AS reason
    FROM matched
    UNION ALL
    SELECT word_id, ${generalGameWordPoolFlag}::text,
      TRUE, NULL::text, ${importedReason}::text
    FROM matched
    UNION ALL
    SELECT word_id, ('difficulty_' || difficulty)::text,
      TRUE, NULL::text, ${importedReason}::text
    FROM matched
  ), disabled AS (
    UPDATE word_game_eligibility eligibility
    SET enabled = FALSE, updated_at = NOW()
    WHERE eligibility.subject_type = 'word'
      AND eligibility.reason = ${importedReason}
      AND NOT EXISTS (
        SELECT 1
        FROM desired
        WHERE desired.word_id = eligibility.subject_id
          AND desired.game_id = eligibility.game_id
      )
    RETURNING eligibility.id
  )
  INSERT INTO word_game_eligibility (
    subject_type,
    subject_id,
    game_id,
    enabled,
    difficulty,
    reason,
    manually_suspended
  )
  SELECT 'word', word_id, game_id, enabled, difficulty, reason, FALSE
  FROM desired
  ON CONFLICT (subject_type, subject_id, game_id) DO UPDATE SET
    enabled = EXCLUDED.enabled,
    difficulty = EXCLUDED.difficulty,
    reason = EXCLUDED.reason,
    manually_suspended = FALSE,
    updated_at = NOW()
`;

const verificationRows = await target`
  SELECT pool.difficulty, COUNT(*)::bigint AS count
  FROM active_words word
  JOIN active_word_game_eligibility pool
    ON pool.subject_type = 'word'
    AND pool.subject_id = word.id
    AND pool.game_id = ${generalGameWordPoolKey}
  JOIN active_word_game_eligibility general_flag
    ON general_flag.subject_type = 'word'
    AND general_flag.subject_id = word.id
    AND general_flag.game_id = ${generalGameWordPoolFlag}
  JOIN active_word_game_eligibility difficulty_flag
    ON difficulty_flag.subject_type = 'word'
    AND difficulty_flag.subject_id = word.id
    AND difficulty_flag.game_id = ('difficulty_' || pool.difficulty)
  WHERE pool.difficulty IN ('easy', 'normal', 'hard')
  GROUP BY pool.difficulty
  ORDER BY pool.difficulty
` as Array<{ difficulty: string; count: string }>;

process.stdout.write(JSON.stringify({
  complete: true,
  selectedLegacyRows: sourceRows.length,
  importedClassifications: records.length,
  activeByDifficulty: Object.fromEntries(
    verificationRows.map((row) => [row.difficulty, Number(row.count)]),
  ),
}) + "\n");

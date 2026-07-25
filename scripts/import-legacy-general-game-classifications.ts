import { neon } from "@neondatabase/serverless";
import {
  generalGameWordDifficultyTags,
  generalGameWordPoolFlag,
  generalGameWordPoolKey,
  normalizeLegacyGeneralGameWordClassifications,
  type LegacyGeneralGameWordClassificationRow,
} from "../lib/general-game-word-classification.ts";
import { sharedEnvironmentVariable } from "../lib/shared-environment.ts";

const sourceUrl = process.env.LEGACY_WORD_DATABASE_URL?.trim();
const targetUrl = sharedEnvironmentVariable("VOCABULARY_ADMIN_DATABASE_URL");
const apply = process.argv.includes("--apply");
const syncMissingWords = process.argv.includes("--sync-missing-words");
const importedReason = "legacy standard-game classification import";
const expectedLegacyRows = 347;
const expectedUniqueClassifications = 346;

if (!sourceUrl || !targetUrl) {
  throw new Error("LEGACY_WORD_DATABASE_URL and VOCABULARY_ADMIN_DATABASE_URL are required");
}
if (sourceUrl === targetUrl) throw new Error("SOURCE_AND_TARGET_DATABASE_MUST_DIFFER");
if (apply && syncMissingWords) {
  throw new Error("GENERAL_GAME_CLASSIFICATION_MIGRATION_MODE_CONFLICT");
}

const source = neon(sourceUrl);
const target = neon(targetUrl);

const [sourceTables, targetTables] = await Promise.all([
  source`
    SELECT
      to_regclass('public.shared_word_catalog')::text AS catalog_table,
      to_regclass('public.shared_word_pool_evaluations')::text AS evaluations_table
  `,
  target`
    SELECT
      to_regclass('public.words')::text AS words_table,
      to_regclass('public.word_game_eligibility')::text AS eligibility_table
  `,
]) as [
  Array<{ catalog_table: string | null; evaluations_table: string | null }>,
  Array<{ words_table: string | null; eligibility_table: string | null }>,
];

if (!sourceTables[0]?.catalog_table || !sourceTables[0]?.evaluations_table) {
  throw new Error("LEGACY_GENERAL_GAME_CLASSIFICATION_SOURCE_NOT_FOUND");
}
if (!targetTables[0]?.words_table || !targetTables[0]?.eligibility_table) {
  throw new Error("GENERAL_GAME_CLASSIFICATION_TARGET_SCHEMA_NOT_FOUND");
}

const sourceRows = await source`
  SELECT
    catalog.word_master_id,
    catalog.surface,
    catalog.reading,
    catalog.zipf_frequency,
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
` as Array<LegacyGeneralGameWordClassificationRow & {
  zipf_frequency: string | number | null;
}>;

const records = normalizeLegacyGeneralGameWordClassifications(sourceRows);
if (records.length === 0) throw new Error("GENERAL_GAME_CLASSIFICATION_SOURCE_EMPTY");
const sourceDetails = new Map(
  sourceRows.map((row) => {
    const surface = String(row.surface ?? "").normalize("NFKC").trim();
    const reading = String(row.reading ?? "").normalize("NFKC").trim();
    const zipf = Number(row.zipf_frequency);
    return [
      `${surface.toLocaleLowerCase("ja-JP")}\u0000${reading}`,
      {
        zipf: Number.isFinite(zipf) && zipf >= 0 && zipf <= 10 ? zipf : null,
        characterCount: Array.from(surface).length,
      },
    ] as const;
  }),
);
const importRecords = records.map((record) => ({
  ...record,
  ...(sourceDetails.get(`${record.normalizedSurface}\u0000${record.reading}`) ?? {
    zipf: null,
    characterCount: Array.from(record.surface).length,
  }),
}));
const payload = JSON.stringify(importRecords);

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
  ), match_stats AS (
    SELECT
      incoming."wordMasterId",
      (
        SELECT COUNT(*)::integer
        FROM words word
        WHERE word.normalized_surface = incoming."normalizedSurface"
          AND COALESCE(word.reading, '') = incoming.reading
          AND word.status = 'active'
      ) AS exact_active_matches,
      (
        SELECT COUNT(*)::integer
        FROM words word
        WHERE word.normalized_surface = incoming."normalizedSurface"
          AND COALESCE(word.reading, '') = incoming.reading
      ) AS exact_all_status_matches,
      (
        SELECT COUNT(*)::integer
        FROM words word
        WHERE word.source_reference =
          ('legacy-shared-word-catalog:' || incoming."wordMasterId"::text)
          AND word.status = 'active'
      ) AS source_reference_matches,
      (
        SELECT COUNT(*)::integer
        FROM words word
        WHERE word.normalized_surface = incoming."normalizedSurface"
          AND word.status = 'active'
      ) AS surface_active_matches
    FROM incoming
  )
  SELECT
    COUNT(*)::bigint AS source_count,
    COUNT(*) FILTER (WHERE exact_active_matches = 1)::bigint AS matched_count,
    COUNT(*) FILTER (
      WHERE exact_active_matches = 0 AND exact_all_status_matches > 0
    )::bigint AS inactive_exact_count,
    COUNT(*) FILTER (
      WHERE exact_active_matches = 0 AND source_reference_matches = 1
    )::bigint AS source_reference_only_count,
    COUNT(*) FILTER (
      WHERE exact_active_matches = 0 AND surface_active_matches = 1
    )::bigint AS unique_surface_only_count,
    COUNT(*) FILTER (
      WHERE exact_active_matches = 0 AND surface_active_matches > 1
    )::bigint AS ambiguous_surface_count,
    COUNT(*) FILTER (
      WHERE exact_active_matches = 0
        AND exact_all_status_matches = 0
        AND source_reference_matches = 0
        AND surface_active_matches = 0
    )::bigint AS absent_surface_count
  FROM match_stats
` as Array<{
  source_count: string;
  matched_count: string;
  inactive_exact_count: string;
  source_reference_only_count: string;
  unique_surface_only_count: string;
  ambiguous_surface_count: string;
  absent_surface_count: string;
}>;

const sourceCount = Number(matchRows[0]?.source_count ?? 0);
const matchedCount = Number(matchRows[0]?.matched_count ?? 0);
const byDifficulty = Object.fromEntries(
  Object.keys(generalGameWordDifficultyTags).map((difficulty) => [
    difficulty,
    records.filter((record) => record.difficulty === difficulty).length,
  ]),
);
const regressionRows = await target`
  SELECT COUNT(DISTINCT word.id)::bigint AS classified_count
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
  WHERE word.normalized_surface = ${"度者".normalize("NFKC").toLocaleLowerCase("ja-JP")}
` as Array<{ classified_count: string }>;
const unreviewedEasyRegressionClassified =
  Number(regressionRows[0]?.classified_count ?? 0) > 0;

if (
  (apply || syncMissingWords)
  && (
    sourceRows.length !== expectedLegacyRows
    || records.length !== expectedUniqueClassifications
  )
) {
  throw new Error("GENERAL_GAME_CLASSIFICATION_SOURCE_COUNT_CHANGED");
}

if (syncMissingWords) {
  await target`
    WITH incoming AS (
      SELECT *
      FROM jsonb_to_recordset(${payload}::jsonb) AS item(
        "wordMasterId" bigint,
        surface text,
        "normalizedSurface" text,
        reading text,
        difficulty text,
        zipf double precision,
        "characterCount" integer
      )
    )
    INSERT INTO words (
      surface,
      reading,
      normalized_surface,
      proper_noun,
      character_count,
      zipf,
      source_name,
      status,
      source_type,
      source_environment,
      source_reference,
      created_by,
      reviewed_at,
      reviewed_by
    )
    SELECT
      surface,
      NULLIF(reading, ''),
      "normalizedSurface",
      FALSE,
      "characterCount",
      zipf,
      'legacy-shared-word-catalog',
      'active',
      'import',
      'admin',
      'legacy-shared-word-catalog:' || "wordMasterId"::text,
      'legacy-import',
      NOW(),
      'legacy-import'
    FROM incoming
    ON CONFLICT (normalized_surface, (COALESCE(reading, ''))) DO NOTHING
  `;

  const syncedRows = await target`
    WITH incoming AS (
      SELECT *
      FROM jsonb_to_recordset(${payload}::jsonb) AS item(
        "wordMasterId" bigint,
        surface text,
        "normalizedSurface" text,
        reading text,
        difficulty text,
        zipf double precision,
        "characterCount" integer
      )
    )
    SELECT COUNT(word.id)::bigint AS matched_count
    FROM incoming
    LEFT JOIN words word
      ON word.normalized_surface = incoming."normalizedSurface"
      AND COALESCE(word.reading, '') = incoming.reading
      AND word.status = 'active'
  ` as Array<{ matched_count: string }>;
  const syncedCount = Number(syncedRows[0]?.matched_count ?? 0);
  if (syncedCount !== sourceCount) {
    throw new Error("GENERAL_GAME_CLASSIFICATION_WORD_SYNC_INCOMPLETE");
  }

  process.stdout.write(JSON.stringify({
    wordSyncComplete: true,
    selectedLegacyRows: sourceRows.length,
    uniqueClassifications: records.length,
    matchedBeforeSync: matchedCount,
    matchedAfterSync: syncedCount,
    insertedOrRecoveredWords: syncedCount - matchedCount,
    next: "Re-run the dry run and require missingTargetWords to be zero before --apply.",
  }) + "\n");
  process.exit(0);
}

if (!apply) {
  process.stdout.write(JSON.stringify({
    dryRun: true,
    selectedLegacyRows: sourceRows.length,
    uniqueClassifications: records.length,
    matchedTargetWords: matchedCount,
    missingTargetWords: sourceCount - matchedCount,
    byDifficulty,
    matchDiagnostics: {
      inactiveExact: Number(matchRows[0]?.inactive_exact_count ?? 0),
      sourceReferenceOnly: Number(matchRows[0]?.source_reference_only_count ?? 0),
      uniqueSurfaceOnly: Number(matchRows[0]?.unique_surface_only_count ?? 0),
      ambiguousSurface: Number(matchRows[0]?.ambiguous_surface_count ?? 0),
      absentSurface: Number(matchRows[0]?.absent_surface_count ?? 0),
    },
    expectedSource: {
      selectedLegacyRows: expectedLegacyRows,
      uniqueClassifications: expectedUniqueClassifications,
    },
    regressionChecks: {
      unreviewedEasyTermExcluded: !unreviewedEasyRegressionClassified,
    },
    next: matchedCount === sourceCount
      ? "Re-run with --apply."
      : "Run --sync-missing-words, then repeat this dry run before --apply.",
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
  regressionChecks: {
    unreviewedEasyTermExcluded: !unreviewedEasyRegressionClassified,
  },
}) + "\n");

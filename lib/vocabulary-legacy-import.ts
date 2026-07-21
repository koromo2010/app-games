import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import { assertRuntimeEnvironmentAgreement } from "./storage-environment-guard.ts";
import { sharedEnvironmentVariable } from "./shared-environment.ts";

const legacyCatalogTable = "shared_word_catalog";
const importBatchSize = 1_000;

export type LegacyCatalogRow = {
  word_master_id: string | number;
  surface: string;
  reading: string | null;
  zipf_frequency: string | number;
};

export type NormalizedLegacyCatalogRow = {
  wordMasterId: number;
  surface: string;
  reading: string;
  normalizedSurface: string;
  zipf: number;
  characterCount: number;
};

export type LegacyVocabularyImportStatus = {
  sourceActiveCount: number;
  sourceUniqueCount: number;
  targetActiveWordCount: number;
  targetWordwolfEligibleCount: number;
  targetImportedWordwolfCount: number;
  complete: boolean;
};

let sourceClient: NeonQueryFunction<boolean, boolean> | null = null;
let sourceClientUrl = "";
let targetClient: NeonQueryFunction<boolean, boolean> | null = null;
let targetClientUrl = "";

export function resolveLegacyVocabularySourceUrl(env: Record<string, string | undefined>) {
  return env.LEGACY_WORD_DATABASE_URL?.trim() || env.APP_DATABASE_URL?.trim() || null;
}

function importClients() {
  if (assertRuntimeEnvironmentAgreement() !== "development") {
    throw new Error("LEGACY_VOCABULARY_IMPORT_PREVIEW_ONLY");
  }
  const sourceUrl = resolveLegacyVocabularySourceUrl(process.env);
  const targetUrl = sharedEnvironmentVariable("VOCABULARY_ADMIN_DATABASE_URL");
  if (!sourceUrl) throw new Error("LEGACY_VOCABULARY_SOURCE_NOT_CONFIGURED");
  if (!targetUrl) throw new Error("VOCABULARY_ADMIN_STORE_NOT_CONFIGURED");
  if (sourceUrl === targetUrl) throw new Error("LEGACY_VOCABULARY_SOURCE_TARGET_MUST_DIFFER");
  if (!sourceClient || sourceClientUrl !== sourceUrl) {
    sourceClient = neon(sourceUrl);
    sourceClientUrl = sourceUrl;
  }
  if (!targetClient || targetClientUrl !== targetUrl) {
    targetClient = neon(targetUrl);
    targetClientUrl = targetUrl;
  }
  return { source: sourceClient, target: targetClient };
}

export function normalizeLegacyCatalogRows(rows: LegacyCatalogRow[]) {
  const normalized = new Map<string, NormalizedLegacyCatalogRow>();
  for (const row of rows) {
    const wordMasterId = Number(row.word_master_id);
    const surface = String(row.surface ?? "").normalize("NFKC").trim();
    const reading = String(row.reading ?? "").normalize("NFKC").trim();
    const normalizedSurface = surface.toLocaleLowerCase("ja");
    const zipf = Number(row.zipf_frequency);
    if (!Number.isSafeInteger(wordMasterId) || wordMasterId <= 0 || !surface || !Number.isFinite(zipf) || zipf < 0 || zipf > 10) {
      continue;
    }
    normalized.set(`${normalizedSurface}\u0000${reading}`, {
      wordMasterId,
      surface,
      reading,
      normalizedSurface,
      zipf,
      characterCount: Array.from(surface).length,
    });
  }
  return [...normalized.values()];
}

export function isLegacyVocabularyImportComplete(sourceUniqueCount: number, targetImportedWordwolfCount: number) {
  return sourceUniqueCount > 0 && targetImportedWordwolfCount >= sourceUniqueCount;
}

async function sourceCounts(sql: NeonQueryFunction<boolean, boolean>) {
  const tableRows = await sql`
    SELECT to_regclass(${`public.${legacyCatalogTable}`})::text AS table_name
  ` as Array<{ table_name: string | null }>;
  if (!tableRows[0]?.table_name) throw new Error("LEGACY_VOCABULARY_CATALOG_NOT_FOUND");
  const rows = await sql`
    SELECT
      COUNT(*)::bigint AS active_count,
      COUNT(DISTINCT ROW(
        LOWER(BTRIM(normalize(surface, NFKC))),
        BTRIM(normalize(COALESCE(reading, ''), NFKC))
      )) FILTER (
        WHERE word_master_id > 0
          AND BTRIM(normalize(surface, NFKC)) <> ''
          AND zipf_frequency BETWEEN 0 AND 10
      )::bigint AS unique_count
    FROM shared_word_catalog
    WHERE active
  ` as Array<{ active_count: string; unique_count: string }>;
  return {
    sourceActiveCount: Number(rows[0]?.active_count ?? 0),
    sourceUniqueCount: Number(rows[0]?.unique_count ?? 0),
  };
}

async function targetCounts(sql: NeonQueryFunction<boolean, boolean>) {
  const rows = await sql`
    SELECT
      (SELECT COUNT(*)::bigint FROM active_words) AS active_words,
      (SELECT COUNT(*)::bigint FROM active_word_game_eligibility
        WHERE subject_type = 'word' AND game_id = 'wordwolf') AS wordwolf_eligible,
      (SELECT COUNT(*)::bigint FROM active_word_game_eligibility
        WHERE subject_type = 'word'
          AND game_id = 'wordwolf'
          AND reason = 'legacy shared catalog import') AS imported_wordwolf
  ` as Array<{ active_words: string; wordwolf_eligible: string; imported_wordwolf: string }>;
  return {
    targetActiveWordCount: Number(rows[0]?.active_words ?? 0),
    targetWordwolfEligibleCount: Number(rows[0]?.wordwolf_eligible ?? 0),
    targetImportedWordwolfCount: Number(rows[0]?.imported_wordwolf ?? 0),
  };
}

export async function inspectLegacyVocabularyImport(): Promise<LegacyVocabularyImportStatus> {
  const { source, target } = importClients();
  const [sourceSummary, counts] = await Promise.all([sourceCounts(source), targetCounts(target)]);
  return {
    ...sourceSummary,
    ...counts,
    complete: isLegacyVocabularyImportComplete(sourceSummary.sourceUniqueCount, counts.targetImportedWordwolfCount),
  };
}

export async function importLegacyVocabularyBatch(afterId: number) {
  if (!Number.isSafeInteger(afterId) || afterId < 0) throw new Error("LEGACY_VOCABULARY_CURSOR_INVALID");
  const { source, target } = importClients();
  const rows = await source`
    SELECT word_master_id, surface, reading, zipf_frequency
    FROM shared_word_catalog
    WHERE active AND word_master_id > ${afterId}
    ORDER BY word_master_id
    LIMIT ${importBatchSize}
  ` as LegacyCatalogRow[];
  if (rows.length === 0) {
    return { processed: 0, imported: 0, nextCursor: afterId, done: true, status: await inspectLegacyVocabularyImport() };
  }

  const normalized = normalizeLegacyCatalogRows(rows);
  if (normalized.length > 0) {
    const payload = JSON.stringify(normalized);
    await target`
      WITH incoming AS (
        SELECT * FROM jsonb_to_recordset(${payload}::jsonb) AS item(
          "wordMasterId" bigint,
          surface text,
          reading text,
          "normalizedSurface" text,
          zipf double precision,
          "characterCount" integer
        )
      ), imported AS (
        INSERT INTO words (
          surface, reading, normalized_surface, proper_noun, character_count, zipf,
          source_name, status, source_type, source_environment, source_reference,
          created_by, reviewed_at, reviewed_by
        )
        SELECT surface, NULLIF(reading, ''), "normalizedSurface", FALSE, "characterCount", zipf,
          'legacy-shared-word-catalog', 'active', 'import', 'admin',
          'legacy-shared-word-catalog:' || "wordMasterId", 'legacy-import', NOW(), 'legacy-import'
        FROM incoming
        ON CONFLICT (normalized_surface, (COALESCE(reading, ''))) DO UPDATE SET
          surface = EXCLUDED.surface,
          zipf = EXCLUDED.zipf,
          status = 'active',
          updated_at = NOW()
        RETURNING id
      )
      INSERT INTO word_game_eligibility (subject_type, subject_id, game_id, enabled, reason)
      SELECT 'word', imported.id, 'wordwolf', TRUE, 'legacy shared catalog import'
      FROM imported
      ON CONFLICT (subject_type, subject_id, game_id) DO UPDATE SET
        enabled = TRUE,
        manually_suspended = FALSE,
        reason = EXCLUDED.reason,
        updated_at = NOW()
    `;
  }

  const nextCursor = Number(rows.at(-1)?.word_master_id ?? afterId);
  return {
    processed: rows.length,
    imported: normalized.length,
    nextCursor,
    done: rows.length < importBatchSize,
    status: rows.length < importBatchSize ? await inspectLegacyVocabularyImport() : null,
  };
}

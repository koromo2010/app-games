import { neon } from "@neondatabase/serverless";
import { sharedEnvironmentVariable } from "../lib/shared-environment.ts";

type LegacyRow = {
  word_master_id: string | number;
  surface: string;
  reading: string | null;
  zipf_frequency: string | number;
};

const sourceUrl = process.env.LEGACY_WORD_DATABASE_URL?.trim();
const targetUrl = sharedEnvironmentVariable("VOCABULARY_ADMIN_DATABASE_URL");
const apply = process.argv.includes("--apply");
const batchSize = 500;

if (!sourceUrl || !targetUrl) {
  throw new Error("LEGACY_WORD_DATABASE_URL and VOCABULARY_ADMIN_DATABASE_URL are required");
}
if (sourceUrl === targetUrl) throw new Error("SOURCE_AND_TARGET_DATABASE_MUST_DIFFER");

const source = neon(sourceUrl);
const target = neon(targetUrl);
const [sourceInfo, targetInfo] = await Promise.all([
  source`SELECT current_database() AS database, COUNT(*)::bigint AS count FROM shared_word_catalog WHERE active`,
  target`SELECT current_database() AS database, COUNT(*)::bigint AS count FROM words`,
]) as [Array<{ database: string; count: string }>, Array<{ database: string; count: string }>];

if (!apply) {
  process.stdout.write(JSON.stringify({
    dryRun: true,
    sourceDatabase: sourceInfo[0]?.database,
    sourceActiveCount: Number(sourceInfo[0]?.count ?? 0),
    targetDatabase: targetInfo[0]?.database,
    targetWordCount: Number(targetInfo[0]?.count ?? 0),
    next: "Re-run with --apply after confirming source and target database names.",
  }) + "\n");
  process.exit(0);
}

let cursor = 0;
let processed = 0;
while (true) {
  const rows = await source`
    SELECT word_master_id, surface, reading, zipf_frequency
    FROM shared_word_catalog
    WHERE active AND word_master_id > ${cursor}
    ORDER BY word_master_id
    LIMIT ${batchSize}
  ` as LegacyRow[];
  if (rows.length === 0) break;

  const deduplicated = new Map<string, {
    wordMasterId: number;
    surface: string;
    reading: string;
    normalizedSurface: string;
    zipf: number;
    characterCount: number;
  }>();
  for (const row of rows) {
    const surface = String(row.surface ?? "").normalize("NFKC").trim();
    const reading = String(row.reading ?? "").normalize("NFKC").trim();
    const normalizedSurface = surface.toLocaleLowerCase("ja");
    const zipf = Number(row.zipf_frequency);
    if (!surface || !Number.isFinite(zipf) || zipf < 0 || zipf > 10) continue;
    const item = {
      wordMasterId: Number(row.word_master_id),
      surface,
      reading,
      normalizedSurface,
      zipf,
      characterCount: Array.from(surface).length,
    };
    deduplicated.set(`${normalizedSurface}\u0000${reading}`, item);
  }
  const payload = JSON.stringify([...deduplicated.values()]);
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
      RETURNING id, normalized_surface, COALESCE(reading, '') AS reading
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
  cursor = Number(rows.at(-1)?.word_master_id ?? cursor);
  processed += rows.length;
  process.stdout.write(JSON.stringify({ processed, cursor }) + "\n");
}

const finalRows = await target`
  SELECT
    (SELECT COUNT(*)::bigint FROM active_words) AS active_words,
    (SELECT COUNT(*)::bigint FROM active_word_game_eligibility
      WHERE subject_type = 'word' AND game_id = 'wordwolf') AS wordwolf_eligible
` as Array<{ active_words: string; wordwolf_eligible: string }>;
process.stdout.write(JSON.stringify({
  complete: true,
  processed,
  activeWords: Number(finalRows[0]?.active_words ?? 0),
  wordwolfEligible: Number(finalRows[0]?.wordwolf_eligible ?? 0),
}) + "\n");

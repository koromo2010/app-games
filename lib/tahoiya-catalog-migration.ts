import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import { sharedEnvironmentVariable } from "./shared-environment.ts";
import { redisCommand } from "./redis-store.ts";
import {
  legacyTahoiyaCatalogKey,
  parseLegacyTahoiyaCatalogRecord,
  type LegacyTahoiyaTopicCatalogRecord,
} from "./tahoiya-legacy-catalog.ts";
import { migrateLegacyTahoiyaTopicHistory } from "./tahoiya-topic-history-store.ts";
import { assertRuntimeEnvironmentAgreement } from "./storage-environment-guard.ts";

const completionKey = "tahoiya:catalog-migration:v2:complete";
const migrationBatchSize = 100;

export type TahoiyaCatalogMigrationStatus = {
  sourceRecordCount: number;
  sourceValidCount: number;
  targetTopicCount: number;
  complete: boolean;
};

export function isTahoiyaCatalogMigrationComplete(input: {
  sourceRecordCount: number;
  sourceValidCount: number;
  targetTopicCount: number;
  completedSourceCount: string | null;
}) {
  if (input.sourceRecordCount === 0) return true;
  return input.sourceValidCount > 0 &&
    Number(input.completedSourceCount) === input.sourceValidCount &&
    input.targetTopicCount >= input.sourceValidCount;
}

type MigrationInput = {
  surface: string;
  reading: string | null;
  normalizedSurface: string;
  characterCount: number;
  realDefinition: string;
  difficulty: LegacyTahoiyaTopicCatalogRecord["difficulty"];
  note: string;
  sourceDetail: string;
  sourceKind: "llm" | "fallback";
  genre: string | null;
  sourceLibrary: string | null;
  sourceUrl: string | null;
  difficultyReason: string | null;
  difficultyJudgedBy: string | null;
  difficultyRubricVersion: string | null;
  feedbackAnchorTags: string[];
  difficultyFeedbackIds: string[];
  generation: Record<string, unknown> | null;
  useCount: number;
  lastUsedAt: string | null;
  createdAt: string;
};

let targetClient: NeonQueryFunction<boolean, boolean> | null = null;
let targetClientUrl = "";

function targetDatabase() {
  if (process.env.VERCEL_ENV !== "preview" || assertRuntimeEnvironmentAgreement() !== "development") {
    throw new Error("TAHOIYA_CATALOG_MIGRATION_PREVIEW_ONLY");
  }
  const url = sharedEnvironmentVariable("VOCABULARY_ADMIN_DATABASE_URL");
  if (!url) throw new Error("VOCABULARY_ADMIN_STORE_NOT_CONFIGURED");
  if (!targetClient || targetClientUrl !== url) {
    targetClient = neon(url);
    targetClientUrl = url;
  }
  return targetClient;
}

function normalizedWord(value: string) {
  return value.normalize("NFKC").trim().toLocaleLowerCase("ja");
}

function clip(value: string | undefined, maximum: number) {
  const normalized = value?.normalize("NFKC").trim() ?? "";
  return normalized ? normalized.slice(0, maximum) : null;
}

export function legacyTahoiyaRecordToMigrationInput(
  record: LegacyTahoiyaTopicCatalogRecord,
): MigrationInput | null {
  const surface = record.topic.word.normalize("NFKC").trim();
  const realDefinition = record.topic.realDefinition.normalize("NFKC").trim();
  if (!surface || !realDefinition) return null;
  const generation = record.topic.generation
    ? JSON.parse(JSON.stringify(record.topic.generation)) as Record<string, unknown>
    : null;
  return {
    surface: surface.slice(0, 100),
    reading: clip(record.topic.reading, 100),
    normalizedSurface: normalizedWord(surface).slice(0, 100),
    characterCount: Array.from(surface.slice(0, 100)).length,
    realDefinition: realDefinition.slice(0, 500),
    difficulty: record.difficulty,
    note: (record.topic.note ?? "").normalize("NFKC").trim().slice(0, 1_000),
    sourceDetail: (record.topic.sourceDetail ?? "").normalize("NFKC").trim().slice(0, 2_000),
    sourceKind: record.topic.source === "fallback" ? "fallback" : "llm",
    genre: clip(record.genre, 200),
    sourceLibrary: clip(record.sourceLibrary, 300),
    sourceUrl: clip(record.sourceUrl, 2_000),
    difficultyReason: clip(record.difficultyReason, 1_000),
    difficultyJudgedBy: clip(record.difficultyJudgedBy, 200),
    difficultyRubricVersion: clip(record.difficultyRubricVersion, 200),
    feedbackAnchorTags: (record.feedbackAnchorTags ?? []).slice(0, 20).map((tag) => tag.slice(0, 200)),
    difficultyFeedbackIds: (record.difficultyFeedbackIds ?? []).slice(0, 20).map((id) => id.slice(0, 200)),
    generation,
    useCount: Math.max(0, Math.floor(record.useCount)),
    lastUsedAt: record.lastUsedAt > 0 ? new Date(record.lastUsedAt).toISOString() : null,
    createdAt: new Date(record.createdAt > 0 ? record.createdAt : Date.now()).toISOString(),
  };
}

async function assertSchema(sql: NeonQueryFunction<boolean, boolean>) {
  const rows = await sql`SELECT to_regclass('public.tahoiya_topics')::text AS table_name` as Array<{ table_name: string | null }>;
  if (!rows[0]?.table_name) throw new Error("TAHOIYA_CATALOG_SCHEMA_MISSING");
}

async function sourceSummary() {
  const [count, values] = await Promise.all([
    redisCommand<number>(["HLEN", legacyTahoiyaCatalogKey]),
    redisCommand<string[]>(["HVALS", legacyTahoiyaCatalogKey]),
  ]);
  const valid = (Array.isArray(values) ? values : [])
    .map(parseLegacyTahoiyaCatalogRecord)
    .filter((record): record is LegacyTahoiyaTopicCatalogRecord => Boolean(record))
    .map(legacyTahoiyaRecordToMigrationInput)
    .filter(Boolean).length;
  return { sourceRecordCount: Number(count) || 0, sourceValidCount: valid };
}

async function targetCount(sql: NeonQueryFunction<boolean, boolean>) {
  const rows = await sql`SELECT COUNT(*)::bigint AS count FROM tahoiya_topics` as Array<{ count: string | number }>;
  return Number(rows[0]?.count ?? 0);
}

export async function inspectTahoiyaCatalogMigration(): Promise<TahoiyaCatalogMigrationStatus> {
  const sql = targetDatabase();
  await assertSchema(sql);
  const [source, targetTopicCount, completedSourceCount] = await Promise.all([
    sourceSummary(),
    targetCount(sql),
    redisCommand<string | null>(["GET", completionKey]).catch(() => null),
  ]);
  return {
    ...source,
    targetTopicCount,
    complete: isTahoiyaCatalogMigrationComplete({
      ...source,
      targetTopicCount,
      completedSourceCount,
    }),
  };
}

async function upsertTopics(sql: NeonQueryFunction<boolean, boolean>, inputs: MigrationInput[]) {
  if (inputs.length === 0) return 0;
  const payload = JSON.stringify(inputs);
  await sql`
    WITH incoming AS (
      SELECT * FROM jsonb_to_recordset(${payload}::jsonb) AS item(
        surface text, reading text, "normalizedSurface" text, "characterCount" integer,
        "realDefinition" text, difficulty text, note text, "sourceDetail" text,
        "sourceKind" text, genre text, "sourceLibrary" text, "sourceUrl" text,
        "difficultyReason" text, "difficultyJudgedBy" text, "difficultyRubricVersion" text,
        "feedbackAnchorTags" text[], "difficultyFeedbackIds" text[], generation jsonb,
        "useCount" bigint, "lastUsedAt" timestamptz, "createdAt" timestamptz
      )
    ), upserted_words AS (
      INSERT INTO words (
        surface, reading, normalized_surface, proper_noun, character_count,
        status, source_type, source_environment, source_name, source_reference,
        created_by, reviewed_at, reviewed_by, selection_zipf_override
      )
      SELECT surface, reading, "normalizedSurface", FALSE, "characterCount",
        'active', 'import', 'admin', COALESCE("sourceLibrary", 'legacy-tahoiya-redis'),
        'legacy-tahoiya-catalog:' || "normalizedSurface", 'tahoiya-catalog-migration',
        NOW(), 'tahoiya-catalog-migration', CASE WHEN difficulty = 'extreme' THEN 0 ELSE 2.9 END
      FROM incoming
      ON CONFLICT (normalized_surface, (COALESCE(reading, ''))) DO UPDATE SET
        surface = EXCLUDED.surface,
        status = 'active',
        selection_zipf_override = CASE
          WHEN EXCLUDED.selection_zipf_override = 0 THEN 0
          WHEN words.zipf > 0 AND words.zipf < 3 THEN NULL
          ELSE 2.9
        END,
        updated_at = NOW()
      RETURNING id, normalized_surface, reading
    ), selected_words AS (
      SELECT DISTINCT ON (incoming."normalizedSurface")
        word.id, incoming.*
      FROM incoming
      JOIN upserted_words word
        ON word.normalized_surface = incoming."normalizedSurface"
        AND COALESCE(word.reading, '') = COALESCE(incoming.reading, '')
      ORDER BY incoming."normalizedSurface", word.id
    ), existing_definitions AS (
      SELECT DISTINCT ON (selected_words.id)
        selected_words.id AS word_id, definition.id AS definition_id
      FROM selected_words
      JOIN word_definitions definition
        ON definition.word_id = selected_words.id
        AND definition.display_game_id = 'tahoiya'
        AND definition.source_reference = 'legacy-tahoiya-catalog:' || selected_words."normalizedSurface"
      ORDER BY selected_words.id, definition.updated_at DESC, definition.id
    ), inserted_definitions AS (
      INSERT INTO word_definitions (
        word_id, short_definition, source_name, display_game_id, status,
        source_type, source_environment, source_reference, created_by, reviewed_at, reviewed_by
      )
      SELECT selected_words.id, selected_words."realDefinition",
        COALESCE(selected_words."sourceLibrary", 'legacy-tahoiya-redis'), 'tahoiya',
        'active', 'import', 'admin',
        'legacy-tahoiya-catalog:' || selected_words."normalizedSurface",
        'tahoiya-catalog-migration', NOW(), 'tahoiya-catalog-migration'
      FROM selected_words
      WHERE NOT EXISTS (
        SELECT 1 FROM existing_definitions existing
        WHERE existing.word_id = selected_words.id
      )
      RETURNING word_id, id AS definition_id
    ), selected_definitions AS (
      SELECT * FROM existing_definitions
      UNION ALL
      SELECT * FROM inserted_definitions
    ), eligibility AS (
      INSERT INTO word_game_eligibility (subject_type, subject_id, game_id, enabled, reason)
      SELECT 'word', id, 'tahoiya', TRUE, 'legacy Tahoiya Redis catalog import'
      FROM selected_words
      ON CONFLICT (subject_type, subject_id, game_id) DO UPDATE SET
        enabled = TRUE,
        manually_suspended = FALSE,
        reason = EXCLUDED.reason,
        updated_at = NOW()
      RETURNING subject_id
    )
    INSERT INTO tahoiya_topics (
      word_id, definition_id, difficulty, note, source_detail, source_kind,
      genre, source_library, source_url, difficulty_reason, difficulty_judged_by,
      difficulty_rubric_version, feedback_anchor_tags, difficulty_feedback_ids,
      generation, use_count, last_used_at, status, source_type, source_environment,
      source_reference, created_by, reviewed_at, reviewed_by, created_at
    )
    SELECT selected_words.id, selected_definitions.definition_id,
      selected_words.difficulty, selected_words.note, selected_words."sourceDetail",
      selected_words."sourceKind", selected_words.genre, selected_words."sourceLibrary",
      selected_words."sourceUrl", selected_words."difficultyReason",
      selected_words."difficultyJudgedBy", selected_words."difficultyRubricVersion",
      selected_words."feedbackAnchorTags", selected_words."difficultyFeedbackIds",
      selected_words.generation, selected_words."useCount", selected_words."lastUsedAt",
      'active', 'import', 'admin',
      'legacy-tahoiya-catalog:' || selected_words."normalizedSurface",
      'tahoiya-catalog-migration', NOW(), 'tahoiya-catalog-migration', selected_words."createdAt"
    FROM selected_words
    JOIN selected_definitions ON selected_definitions.word_id = selected_words.id
    ON CONFLICT (word_id) DO UPDATE SET
      definition_id = EXCLUDED.definition_id,
      difficulty = EXCLUDED.difficulty,
      note = EXCLUDED.note,
      source_detail = EXCLUDED.source_detail,
      source_kind = EXCLUDED.source_kind,
      genre = EXCLUDED.genre,
      source_library = EXCLUDED.source_library,
      source_url = EXCLUDED.source_url,
      difficulty_reason = EXCLUDED.difficulty_reason,
      difficulty_judged_by = EXCLUDED.difficulty_judged_by,
      difficulty_rubric_version = EXCLUDED.difficulty_rubric_version,
      feedback_anchor_tags = EXCLUDED.feedback_anchor_tags,
      difficulty_feedback_ids = EXCLUDED.difficulty_feedback_ids,
      generation = EXCLUDED.generation,
      use_count = GREATEST(tahoiya_topics.use_count, EXCLUDED.use_count),
      last_used_at = GREATEST(tahoiya_topics.last_used_at, EXCLUDED.last_used_at),
      status = 'active',
      updated_at = NOW()
  `;
  return inputs.length;
}

export async function importTahoiyaCatalogBatch(cursor: string) {
  if (!/^\d+$/.test(cursor)) throw new Error("TAHOIYA_CATALOG_CURSOR_INVALID");
  const sql = targetDatabase();
  await assertSchema(sql);
  const scan = await redisCommand<[string, string[]]>([
    "HSCAN", legacyTahoiyaCatalogKey, cursor, "COUNT", migrationBatchSize,
  ]);
  const nextCursor = String(scan?.[0] ?? "0");
  const entries = Array.isArray(scan?.[1]) ? scan[1] : [];
  const records = [] as LegacyTahoiyaTopicCatalogRecord[];
  for (let index = 1; index < entries.length; index += 2) {
    const parsed = parseLegacyTahoiyaCatalogRecord(entries[index]);
    if (parsed) records.push(parsed);
  }
  const inputs = records
    .map(legacyTahoiyaRecordToMigrationInput)
    .filter((input): input is MigrationInput => Boolean(input));
  const imported = await upsertTopics(sql, inputs);
  const historyMemberships = await migrateLegacyTahoiyaTopicHistory(records.map((record) => ({
    word: record.topic.word,
    experiencedPlayerIds: record.experiencedPlayerIds,
  })));
  const done = nextCursor === "0";
  let status: TahoiyaCatalogMigrationStatus | null = null;
  if (done) {
    const summary = await sourceSummary();
    await redisCommand<string>(["SET", completionKey, String(summary.sourceValidCount)]);
    status = await inspectTahoiyaCatalogMigration();
  }
  return {
    processed: Math.floor(entries.length / 2),
    imported,
    historyMemberships,
    nextCursor,
    done,
    status,
  };
}

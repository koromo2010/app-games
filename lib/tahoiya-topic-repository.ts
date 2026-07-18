import { normalizeGameGenerationMeta } from "./game-ai-types.ts";
import type { TahoiyaDifficulty, TahoiyaTopic } from "./tahoiya-types.ts";
import { getVocabularyPostgresClient } from "./vocabulary-postgres-store.ts";

export type StoredTahoiyaTopic = {
  id: string;
  normalizedWord: string;
  topic: TahoiyaTopic;
  difficulty: "easy" | "standard" | "extreme";
  useCount: number;
  lastUsedAt: number;
};

type TahoiyaTopicRow = {
  id: string;
  surface: string;
  reading: string | null;
  normalized_surface: string;
  real_definition: string;
  difficulty: StoredTahoiyaTopic["difficulty"];
  note: string;
  source_detail: string;
  source_kind: TahoiyaTopic["source"];
  generation: unknown;
  use_count: number | string;
  last_used_at: string | null;
};

function fromRow(row: TahoiyaTopicRow): StoredTahoiyaTopic {
  return {
    id: row.id,
    normalizedWord: row.normalized_surface,
    topic: {
      word: row.surface,
      reading: row.reading ?? undefined,
      realDefinition: row.real_definition,
      note: row.note,
      sourceDetail: row.source_detail,
      source: row.source_kind,
      generation: normalizeGameGenerationMeta(row.generation),
    },
    difficulty: row.difficulty,
    useCount: Math.max(0, Number(row.use_count) || 0),
    lastUsedAt: row.last_used_at ? Date.parse(row.last_used_at) || 0 : 0,
  };
}

export async function listActiveTahoiyaTopics(
  difficulty: TahoiyaDifficulty,
  limit = 200,
): Promise<StoredTahoiyaTopic[]> {
  const sql = getVocabularyPostgresClient();
  const safeLimit = Math.max(1, Math.min(500, Math.floor(limit)));
  const rows = await sql`
    SELECT id, surface, reading, normalized_surface, real_definition,
      difficulty, note, source_detail, source_kind, generation,
      use_count, last_used_at
    FROM active_tahoiya_topics
    WHERE difficulty = ${difficulty}
    ORDER BY use_count ASC, last_used_at ASC NULLS FIRST, created_at ASC
    LIMIT ${safeLimit}
  ` as TahoiyaTopicRow[];
  return rows.map(fromRow);
}

export async function listActiveTahoiyaCatalogWords(limit = 5000) {
  const sql = getVocabularyPostgresClient();
  const safeLimit = Math.max(1, Math.min(5000, Math.floor(limit)));
  const rows = await sql`
    SELECT normalized_surface
    FROM active_tahoiya_topics
    ORDER BY updated_at DESC
    LIMIT ${safeLimit}
  ` as Array<{ normalized_surface: string }>;
  return rows.map((row) => row.normalized_surface).filter(Boolean);
}

export async function recordTahoiyaTopicUsageByWord(normalizedWord: string) {
  const sql = getVocabularyPostgresClient();
  const rows = await sql`
    SELECT id FROM active_tahoiya_topics
    WHERE normalized_surface = ${normalizedWord}
    ORDER BY updated_at DESC LIMIT 1
  ` as Array<{ id: string }>;
  if (!rows[0]?.id) return false;
  await sql`SELECT record_tahoiya_topic_usage(${rows[0].id}::uuid)`;
  return true;
}

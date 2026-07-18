import type { GameGenerationMeta } from "./game-ai-types.ts";
import type { TahoiyaDifficulty } from "./tahoiya-types.ts";
import type { TahoiyaDifficultyScreeningItem } from "./tahoiya-difficulty-screening.ts";
import { getVocabularyPostgresClient } from "./vocabulary-postgres-store.ts";

export type StoredTahoiyaScreeningCandidate = {
  id: string;
  word: string;
  reading?: string;
  effectiveZipf: number;
  estimatedRecognitionPercent: number;
  confidence: number;
  exclusionFlags: string[];
  reason: string;
};

type ScreeningCandidateRow = {
  id: string;
  surface: string;
  reading: string | null;
  effective_zipf: number | string;
  estimated_recognition_percent: number | string;
  confidence: number | string;
  exclusion_flags: string[];
  reason: string;
};

function fromScreeningRow(row: ScreeningCandidateRow): StoredTahoiyaScreeningCandidate {
  return {
    id: row.id,
    word: row.surface,
    reading: row.reading ?? undefined,
    effectiveZipf: Number(row.effective_zipf),
    estimatedRecognitionPercent: Number(row.estimated_recognition_percent),
    confidence: Number(row.confidence),
    exclusionFlags: Array.isArray(row.exclusion_flags) ? row.exclusion_flags : [],
    reason: row.reason,
  };
}

export async function listScreenedTahoiyaWordCandidates(
  difficulty: TahoiyaDifficulty,
  limit = 500,
) {
  const sql = getVocabularyPostgresClient();
  const safeLimit = Math.max(1, Math.min(500, Math.floor(limit)));
  const rows = await sql`
    SELECT word.id, word.surface, word.reading, word.effective_zipf,
      screening.estimated_recognition_percent, screening.confidence,
      screening.exclusion_flags, screening.reason
    FROM active_words word
    JOIN tahoiya_word_screenings screening ON screening.word_id = word.id
    LEFT JOIN active_tahoiya_topics topic ON topic.word_id = word.id
    WHERE screening.difficulty = ${difficulty}
      AND topic.id IS NULL
    ORDER BY screening.screened_at ASC, word.updated_at DESC
    LIMIT ${safeLimit}
  ` as ScreeningCandidateRow[];
  return rows.map(fromScreeningRow);
}

export async function listUnscreenedTahoiyaWordCandidates(limit = 500) {
  const sql = getVocabularyPostgresClient();
  const safeLimit = Math.max(1, Math.min(500, Math.floor(limit)));
  const rows = await sql`
    SELECT word.id, word.surface, word.reading, word.effective_zipf
    FROM active_words word
    LEFT JOIN tahoiya_word_screenings screening ON screening.word_id = word.id
    LEFT JOIN active_tahoiya_topics topic ON topic.word_id = word.id
    WHERE word.effective_zipf >= 0
      AND word.effective_zipf < 3
      AND screening.word_id IS NULL
      AND topic.id IS NULL
    ORDER BY word.updated_at DESC
    LIMIT ${safeLimit}
  ` as Array<{
    id: string;
    surface: string;
    reading: string | null;
    effective_zipf: number | string;
  }>;
  return rows.map((row) => ({
    id: row.id,
    word: row.surface,
    reading: row.reading ?? undefined,
    effectiveZipf: Number(row.effective_zipf),
  }));
}

export async function saveTahoiyaDifficultyScreenings(
  items: TahoiyaDifficultyScreeningItem[],
  generation: GameGenerationMeta,
) {
  if (items.length < 1 || items.length > 10) throw new Error("TAHOIYA_SCREENING_BATCH_SIZE_INVALID");
  const sql = getVocabularyPostgresClient();
  const serializedItems = JSON.stringify(items.map((item) => ({
    wordId: item.wordId,
    estimatedRecognitionPercent: item.estimatedRecognitionPercent,
    confidence: item.confidence,
    exclusionFlags: item.exclusionFlags,
    reason: item.reason,
  })));
  const serializedGeneration = JSON.stringify(generation);
  const rows = await sql`
    SELECT record_tahoiya_screening_batch(
      ${serializedItems}::jsonb,
      ${serializedGeneration}::jsonb
    ) AS affected_count
  ` as Array<{ affected_count: number | string }>;
  return Number(rows[0]?.affected_count ?? 0);
}

export async function addTahoiyaScreeningExclusion(wordId: string, flag: "sensitive") {
  const sql = getVocabularyPostgresClient();
  const rows = await sql`
    SELECT add_tahoiya_screening_exclusion(${wordId}::uuid, ${flag}) AS updated
  ` as Array<{ updated: boolean }>;
  return rows[0]?.updated === true;
}

export async function saveTahoiyaScreenedTopic(input: {
  wordId: string;
  reading: string;
  realDefinition: string;
  note?: string;
  sourceDetail?: string;
  generation: GameGenerationMeta;
}) {
  const sql = getVocabularyPostgresClient();
  const serializedGeneration = JSON.stringify(input.generation);
  const rows = await sql`
    SELECT materialize_tahoiya_screened_topic(
      ${input.wordId}::uuid,
      ${input.reading},
      ${input.realDefinition},
      ${input.note ?? ""},
      ${input.sourceDetail ?? ""},
      ${serializedGeneration}::jsonb
    ) AS topic_id
  ` as Array<{ topic_id: string }>;
  return rows[0]?.topic_id ?? null;
}

import { createHash } from "node:crypto";
import {
  listActiveTahoiyaTopics,
  recordTahoiyaTopicUsageByWord,
  type StoredTahoiyaTopic,
} from "./tahoiya-topic-repository.ts";
import type { TahoiyaDifficulty, TahoiyaTopic } from "./tahoiya-types.ts";

export type RareWordDifficulty = "easy" | "standard" | "extreme";

export type RareWordContent = {
  /** Opaque identifier used only at the platform boundary. */
  id: string;
  word: string;
  reading: string | null;
  definition: string;
  difficulty: RareWordDifficulty;
  exclusionKey: string;
};

/**
 * Stable rare-word catalog shape exposed to game consumers.
 *
 * The storage/repository row type stays private to this source module so
 * callers cannot couple themselves to the database implementation.
 */
export type RareWordTopicRecord = {
  id: string;
  normalizedWord: string;
  topic: TahoiyaTopic;
  difficulty: RareWordDifficulty;
  useCount: number;
  lastUsedAt: number;
};

function toRareWordTopicRecord(topic: StoredTahoiyaTopic): RareWordTopicRecord {
  return {
    id: topic.id,
    normalizedWord: topic.normalizedWord,
    topic: topic.topic,
    difficulty: topic.difficulty,
    useCount: topic.useCount,
    lastUsedAt: topic.lastUsedAt,
  };
}

function opaqueRareWordId(topic: StoredTahoiyaTopic) {
  const secret = process.env.PLAYER_SESSION_SECRET
    ?? process.env.LLM_SESSION_SECRET
    ?? (process.env.NODE_ENV === "test" ? "game-fields-rare-word-test-secret" : "");
  if (secret.length < 16) throw new Error("RARE_WORD_ID_SECRET_UNAVAILABLE");
  return `gfr2.${createHash("sha256")
    .update("game-fields-rare-word:v2:")
    .update(secret)
    .update("\u0000")
    .update(topic.id)
    .digest("base64url")}`;
}

function normalize(value: string) {
  return value.normalize("NFKC").trim().toLocaleLowerCase("ja-JP");
}

export async function drawRareWords(input: {
  difficulty: RareWordDifficulty;
  count: number;
  excludeIds?: readonly string[];
  excludeWords?: readonly string[];
  historyWords?: readonly string[];
}) {
  const count = Math.max(1, Math.min(100, Math.floor(input.count)));
  const blockedIds = new Set([...(input.excludeIds ?? [])]);
  const blockedWords = new Set([
    ...(input.excludeWords ?? []),
    ...(input.historyWords ?? []),
  ].map(normalize).filter(Boolean));
  const topics = await listActiveTahoiyaTopics(input.difficulty as TahoiyaDifficulty, Math.max(50, count * 4));
  const selected: RareWordContent[] = [];
  const seen = new Set<string>();
  for (const topic of topics) {
    const id = opaqueRareWordId(topic);
    const exclusionKey = normalize(topic.topic.word);
    if (blockedIds.has(id) || blockedIds.has(topic.id) || blockedWords.has(exclusionKey) || seen.has(exclusionKey)) continue;
    seen.add(exclusionKey);
    selected.push({
      id,
      word: topic.topic.word,
      reading: topic.topic.reading ?? null,
      definition: topic.topic.realDefinition,
      difficulty: topic.difficulty,
      exclusionKey,
    });
    if (selected.length >= count) break;
  }
  if (selected.length !== count) throw new Error("RARE_WORD_CONTENT_UNAVAILABLE");
  return selected;
}

/** Tahoiya's reusable catalog stays separate from reviewed general pools. */
export async function loadRareWordTopics(
  difficulty: RareWordDifficulty,
  limit = 200,
): Promise<RareWordTopicRecord[]> {
  const topics = await listActiveTahoiyaTopics(difficulty as TahoiyaDifficulty, limit);
  return topics.map(toRareWordTopicRecord);
}

export async function recordRareWordUsage(exclusionKey: string) {
  return recordTahoiyaTopicUsageByWord(normalize(exclusionKey));
}

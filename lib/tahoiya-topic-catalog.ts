import type { TahoiyaDifficulty, TahoiyaTopic } from "@/lib/tahoiya-types";
import { normalizeGameGenerationMeta } from "@/lib/game-ai-types";
import { retrieveGameFeedback } from "@/lib/game-feedback-store";
import { redisCommand } from "@/lib/redis-store";

const catalogKey = "tahoiya:topic:catalog:v1";

type TahoiyaTopicCatalogRecord = {
  topic: TahoiyaTopic;
  difficulty: TahoiyaDifficulty;
  experiencedPlayerIds: string[];
  createdAt: number;
  lastUsedAt: number;
  useCount: number;
};

function normalizeWord(value: string) {
  return value.normalize("NFKC").trim().toLocaleLowerCase("ja");
}

function parseRecord(value: string): TahoiyaTopicCatalogRecord | null {
  try {
    const parsed = JSON.parse(value) as Partial<TahoiyaTopicCatalogRecord>;
    if (!parsed.topic?.word || !parsed.topic.realDefinition) return null;
    return {
      topic: {
        ...parsed.topic,
        generation: normalizeGameGenerationMeta(parsed.topic.generation),
      },
      difficulty: parsed.difficulty === "extreme" ? "extreme" : "standard",
      experiencedPlayerIds: Array.isArray(parsed.experiencedPlayerIds)
        ? parsed.experiencedPlayerIds.filter((id): id is string => typeof id === "string" && Boolean(id))
        : [],
      createdAt: typeof parsed.createdAt === "number" ? parsed.createdAt : Date.now(),
      lastUsedAt: typeof parsed.lastUsedAt === "number" ? parsed.lastUsedAt : 0,
      useCount: typeof parsed.useCount === "number" ? Math.max(0, Math.floor(parsed.useCount)) : 0,
    };
  } catch {
    return null;
  }
}

async function loadTopicRatingScores() {
  const records = await retrieveGameFeedback({
    game: "tahoiya",
    task: "tahoiya.topic",
    goodLimit: 200,
    badLimit: 200,
  });
  const scores = new Map<string, { good: number; bad: number }>();
  for (const record of records) {
    const match = record.artifactText.match(/(?:^|\s\/\s)単語=([^/]+)/);
    if (!match?.[1]) continue;
    const word = normalizeWord(match[1]);
    const current = scores.get(word) ?? { good: 0, bad: 0 };
    current[record.rating] += 1;
    scores.set(word, current);
  }
  return scores;
}

export async function findReusableTahoiyaTopic(
  difficulty: TahoiyaDifficulty,
  playerIds: string[],
  blockedWords: string[],
) {
  if (playerIds.length === 0) return null;
  const blocked = new Set(blockedWords.map(normalizeWord));
  const [values, ratingScores] = await Promise.all([
    redisCommand<string[]>(["HVALS", catalogKey]),
    loadTopicRatingScores().catch(() => new Map<string, { good: number; bad: number }>()),
  ]);
  const candidates = (Array.isArray(values) ? values : [])
    .map(parseRecord)
    .filter((record): record is TahoiyaTopicCatalogRecord => Boolean(
      record &&
      record.difficulty === difficulty &&
      !blocked.has(normalizeWord(record.topic.word)) &&
      playerIds.every((playerId) => !record.experiencedPlayerIds.includes(playerId)),
    ))
    .sort((left, right) => {
      const leftRating = ratingScores.get(normalizeWord(left.topic.word)) ?? { good: 0, bad: 0 };
      const rightRating = ratingScores.get(normalizeWord(right.topic.word)) ?? { good: 0, bad: 0 };
      const leftScore = leftRating.good - leftRating.bad;
      const rightScore = rightRating.good - rightRating.bad;
      return rightScore - leftScore ||
        rightRating.good - leftRating.good ||
        leftRating.bad - rightRating.bad ||
        left.useCount - right.useCount ||
        left.lastUsedAt - right.lastUsedAt;
    });
  const record = candidates[0];
  if (!record) return null;
  return {
    ...record.topic,
    generation: record.topic.generation
      ? { ...record.topic.generation, latencyMs: 0, reusedFromCatalog: true }
      : undefined,
  } satisfies TahoiyaTopic;
}

export async function loadExperiencedTahoiyaWords(playerIds: string[]) {
  if (playerIds.length === 0) return [];
  const values = await redisCommand<string[]>(["HVALS", catalogKey]);
  return (Array.isArray(values) ? values : [])
    .map(parseRecord)
    .filter((record): record is TahoiyaTopicCatalogRecord => Boolean(
      record && playerIds.some((playerId) => record.experiencedPlayerIds.includes(playerId)),
    ))
    .map((record) => normalizeWord(record.topic.word));
}

export async function rememberTahoiyaTopicExperience(
  topic: TahoiyaTopic,
  difficulty: TahoiyaDifficulty,
  playerIds: string[],
) {
  if (!topic.word || playerIds.length === 0) return;
  const now = Date.now();
  const seed: TahoiyaTopicCatalogRecord = {
    topic,
    difficulty,
    experiencedPlayerIds: [],
    createdAt: now,
    lastUsedAt: 0,
    useCount: 0,
  };
  await redisCommand<number>([
    "EVAL",
    "local raw=redis.call('HGET',KEYS[1],ARGV[1]); local item; if raw then item=cjson.decode(raw) else item=cjson.decode(ARGV[2]) end; item.experiencedPlayerIds=item.experiencedPlayerIds or {}; local seen={}; for _,id in ipairs(item.experiencedPlayerIds) do seen[id]=true end; for i=4,#ARGV do if ARGV[i]~='' and not seen[ARGV[i]] then table.insert(item.experiencedPlayerIds,ARGV[i]); seen[ARGV[i]]=true end end; item.lastUsedAt=tonumber(ARGV[3]); item.useCount=tonumber(item.useCount or 0)+1; redis.call('HSET',KEYS[1],ARGV[1],cjson.encode(item)); return 1",
    "1",
    catalogKey,
    normalizeWord(topic.word),
    JSON.stringify(seed),
    String(now),
    ...playerIds,
  ]);
}

export async function rememberTahoiyaTopicCandidate(topic: TahoiyaTopic, difficulty: TahoiyaDifficulty) {
  if (!topic.word) return;
  const now = Date.now();
  const seed: TahoiyaTopicCatalogRecord = {
    topic,
    difficulty,
    experiencedPlayerIds: [],
    createdAt: now,
    lastUsedAt: 0,
    useCount: 0,
  };
  await redisCommand<number>([
    "HSETNX",
    catalogKey,
    normalizeWord(topic.word),
    JSON.stringify(seed),
  ]);
}

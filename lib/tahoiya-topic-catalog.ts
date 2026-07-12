import type { TahoiyaDifficulty, TahoiyaTopic } from "@/lib/tahoiya-types";
import { normalizeGameGenerationMeta } from "@/lib/game-ai-types";
import { retrieveGameFeedback } from "@/lib/game-feedback-store";
import { redisCommand } from "@/lib/redis-store";
import { tahoiyaSeedTopics, type TahoiyaCatalogDifficulty } from "@/lib/tahoiya-seed-topics";

const catalogKey = "tahoiya:topic:catalog:v1";

type TahoiyaTopicCatalogRecord = {
  topic: TahoiyaTopic;
  difficulty: TahoiyaCatalogDifficulty;
  experiencedPlayerIds: string[];
  createdAt: number;
  lastUsedAt: number;
  useCount: number;
  genre?: string;
  sourceLibrary?: string;
  sourceUrl?: string;
  difficultyReason?: string;
  difficultyJudgedBy?: string;
  difficultyEvaluation?: "absolute";
  difficultyRubricVersion?: string;
  feedbackAnchorTags?: string[];
  difficultyFeedbackIds?: string[];
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
      difficulty: parsed.difficulty === "easy" || parsed.difficulty === "extreme" ? parsed.difficulty : "standard",
      experiencedPlayerIds: Array.isArray(parsed.experiencedPlayerIds)
        ? parsed.experiencedPlayerIds.filter((id): id is string => typeof id === "string" && Boolean(id))
        : [],
      createdAt: typeof parsed.createdAt === "number" ? parsed.createdAt : Date.now(),
      lastUsedAt: typeof parsed.lastUsedAt === "number" ? parsed.lastUsedAt : 0,
      useCount: typeof parsed.useCount === "number" ? Math.max(0, Math.floor(parsed.useCount)) : 0,
      genre: typeof parsed.genre === "string" ? parsed.genre : undefined,
      sourceLibrary: typeof parsed.sourceLibrary === "string" ? parsed.sourceLibrary : undefined,
      sourceUrl: typeof parsed.sourceUrl === "string" ? parsed.sourceUrl : undefined,
      difficultyReason: typeof parsed.difficultyReason === "string" ? parsed.difficultyReason : undefined,
      difficultyJudgedBy: typeof parsed.difficultyJudgedBy === "string" ? parsed.difficultyJudgedBy : undefined,
      difficultyEvaluation: parsed.difficultyEvaluation === "absolute" ? "absolute" : undefined,
      difficultyRubricVersion: typeof parsed.difficultyRubricVersion === "string" ? parsed.difficultyRubricVersion : undefined,
      feedbackAnchorTags: Array.isArray(parsed.feedbackAnchorTags)
        ? parsed.feedbackAnchorTags.filter((tag): tag is string => typeof tag === "string")
        : undefined,
      difficultyFeedbackIds: Array.isArray(parsed.difficultyFeedbackIds)
        ? parsed.difficultyFeedbackIds.filter((id): id is string => typeof id === "string").slice(0, 20)
        : undefined,
    };
  } catch {
    return null;
  }
}

export async function ensureTahoiyaSeedCandidates(difficultyFeedbackIds: string[] = []) {
  const now = Date.now();
  const args = tahoiyaSeedTopics.flatMap((seed) => {
    const record: TahoiyaTopicCatalogRecord = {
      topic: seed.topic,
      difficulty: seed.difficulty,
      experiencedPlayerIds: [],
      createdAt: now,
      lastUsedAt: 0,
      useCount: 0,
      genre: seed.genre,
      sourceLibrary: seed.sourceLibrary,
      sourceUrl: seed.sourceUrl,
      difficultyReason: seed.difficultyReason,
      difficultyJudgedBy: seed.difficultyJudgedBy,
      difficultyEvaluation: seed.difficultyEvaluation,
      difficultyRubricVersion: seed.difficultyRubricVersion,
      feedbackAnchorTags: seed.feedbackAnchorTags,
      difficultyFeedbackIds: difficultyFeedbackIds.slice(0, 20),
    };
    return [normalizeWord(seed.topic.word), JSON.stringify(record)];
  });
  await redisCommand<number>([
    "EVAL",
    "local changed=0; for i=1,#ARGV,2 do local raw=redis.call('HGET',KEYS[1],ARGV[i]); local incoming=cjson.decode(ARGV[i+1]); if not raw then redis.call('HSET',KEYS[1],ARGV[i],ARGV[i+1]); changed=changed+1; else local current=cjson.decode(raw); if current.difficultyJudgedBy and string.find(current.difficultyJudgedBy,'llm%-curation') then incoming.experiencedPlayerIds=current.experiencedPlayerIds or {}; incoming.createdAt=current.createdAt or incoming.createdAt; incoming.lastUsedAt=current.lastUsedAt or 0; incoming.useCount=current.useCount or 0; redis.call('HSET',KEYS[1],ARGV[i],cjson.encode(incoming)); changed=changed+1; end end end; return changed",
    "1",
    catalogKey,
    ...args,
  ]);
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

export async function loadTahoiyaCatalogWords() {
  const words = await redisCommand<string[]>(["HKEYS", catalogKey]);
  return Array.isArray(words) ? words.map(normalizeWord).filter(Boolean) : [];
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

import type { TahoiyaDifficulty, TahoiyaTopic } from "@/lib/tahoiya-types";
import gitCandidateData from "@/data/tahoiya-candidates.json";
import { normalizeGameGenerationMeta } from "@/lib/game-ai-types";
import { retrieveGameFeedback } from "@/lib/game-feedback-store";
import { redisCommand } from "@/lib/redis-store";
import { emitObservabilityEvent } from "@/lib/observability";
import {
  hasVeryCommonSpokenHomophone,
  loadTahoiyaSourceRegistry,
  loadTahoiyaSourceShelf,
  refreshTahoiyaSourceShelf,
  type TahoiyaSourceEntry,
} from "@/lib/tahoiya-source-library";
import { submitDevelopmentVocabularyDraft } from "@/lib/vocabulary-draft-bridge";

const catalogKey = "tahoiya:topic:catalog:v1";
const reviewedSourceKey = "tahoiya:source-library:reviewed:v1";
const gitCatalogVersionKey = "tahoiya:topic:git-catalog-version:v1";

export type TahoiyaCatalogDifficulty = "easy" | "standard" | "extreme";

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

type GitCandidate = {
  word: string;
  reading: string;
  realDefinition: string;
  note: string;
  difficulty: TahoiyaCatalogDifficulty;
  difficultyReason: string;
  feedbackAnchorTags: string[];
  genre: string;
  sourceLibrary: string;
  sourceUrl: string;
  sourceEntryId: string;
  generatedAt: string;
  generation: unknown;
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
      difficulty: hasVeryCommonSpokenHomophone(parsed.topic.reading)
        ? "easy"
        : parsed.difficulty === "easy" || parsed.difficulty === "extreme" ? parsed.difficulty : "standard",
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

export async function ensureTahoiyaGitCandidates() {
  const data = gitCandidateData as { updatedAt?: string; candidates?: GitCandidate[] };
  const version = data.updatedAt?.trim() || "";
  const candidates = Array.isArray(data.candidates) ? data.candidates : [];
  if (!version || candidates.length === 0) return 0;
  const currentVersion = await redisCommand<string | null>(["GET", gitCatalogVersionKey]);
  if (currentVersion === version) return 0;

  let added = 0;
  for (let offset = 0; offset < candidates.length; offset += 100) {
    const args = candidates.slice(offset, offset + 100).flatMap((candidate) => {
      const generation = normalizeGameGenerationMeta(candidate.generation);
      const topic: TahoiyaTopic = {
        word: candidate.word,
        reading: candidate.reading,
        realDefinition: candidate.realDefinition,
        note: candidate.note,
        sourceDetail: `${candidate.sourceLibrary}からGitHub生成プログラムで収集・審査。`,
        source: "llm",
        generation,
      };
      const record: TahoiyaTopicCatalogRecord = {
        topic,
        difficulty: hasVeryCommonSpokenHomophone(candidate.reading) ? "easy" : candidate.difficulty,
        experiencedPlayerIds: [],
        createdAt: Date.parse(candidate.generatedAt) || Date.now(),
        lastUsedAt: 0,
        useCount: 0,
        genre: candidate.genre,
        sourceLibrary: candidate.sourceLibrary,
        sourceUrl: candidate.sourceUrl,
        difficultyReason: candidate.difficultyReason,
        difficultyJudgedBy: "github-action-llm",
        difficultyEvaluation: "absolute",
        difficultyRubricVersion: "tahoiya-rag-absolute-v1",
        feedbackAnchorTags: candidate.feedbackAnchorTags,
        difficultyFeedbackIds: [],
      };
      return [normalizeWord(candidate.word), JSON.stringify(record)];
    });
    if (args.length === 0) continue;
    added += await redisCommand<number>([
      "EVAL",
      "local n=0; for i=1,#ARGV,2 do if redis.call('HSETNX',KEYS[1],ARGV[i],ARGV[i+1])==1 then n=n+1 end end; return n",
      "1", catalogKey, ...args,
    ]);
  }
  await redisCommand<string>(["SET", gitCatalogVersionKey, version]);
  emitObservabilityEvent("info", "catalog.sync", {
    game: "tahoiya",
    operation: "git-catalog-sync",
    affectedCount: added,
    sourceCount: candidates.length,
    outcome: "success",
  });
  return added;
}

export async function loadUnreviewedTahoiyaSources(limit = 10): Promise<TahoiyaSourceEntry[]> {
  const [catalogWords, reviewedIds, registry] = await Promise.all([
    loadTahoiyaCatalogWords(),
    redisCommand<string[]>(["SMEMBERS", reviewedSourceKey]).catch(() => []),
    loadTahoiyaSourceRegistry(),
  ]);
  const blockedWords = new Set(catalogWords);
  const reviewed = new Set(Array.isArray(reviewedIds) ? reviewedIds : []);
  const shuffledSourceIds = registry
    .map((source) => ({ id: source.id, sort: Math.random() }))
    .sort((left, right) => left.sort - right.sort)
    .map(({ id }) => id);

  const availableForSource = (shelf: TahoiyaSourceEntry[], sourceId: string) => shelf.filter((entry) =>
    entry.sourceRegistryId === sourceId &&
    !reviewed.has(entry.id) &&
    !blockedWords.has(normalizeWord(entry.word))
  );
  const selectOnePerSource = (shelf: TahoiyaSourceEntry[]) => shuffledSourceIds.flatMap((sourceId) => {
    const candidates = availableForSource(shelf, sourceId);
    return candidates.length > 0 ? [candidates[Math.floor(Math.random() * candidates.length)]] : [];
  }).slice(0, Math.max(1, limit));

  let shelf = await loadTahoiyaSourceShelf();
  let selected = selectOnePerSource(shelf);
  if (selected.length < limit) {
    const missingSourceIds = shuffledSourceIds.filter((sourceId) => availableForSource(shelf, sourceId).length === 0);
    await refreshTahoiyaSourceShelf(missingSourceIds);
    shelf = await loadTahoiyaSourceShelf();
    selected = selectOnePerSource(shelf);
  }
  return selected;
}

export type TahoiyaReviewedCandidate = {
  source: TahoiyaSourceEntry;
  topic: TahoiyaTopic;
  difficulty: TahoiyaCatalogDifficulty;
  difficultyReason: string;
  feedbackAnchorTags: string[];
};

export async function rememberTahoiyaReviewedBatch(
  reviewedSourceIds: string[],
  candidates: TahoiyaReviewedCandidate[],
  difficultyFeedbackIds: string[],
) {
  const now = Date.now();
  const catalogArgs = candidates.flatMap((candidate) => {
    const record: TahoiyaTopicCatalogRecord = {
      topic: candidate.topic,
      difficulty: candidate.difficulty,
      experiencedPlayerIds: [],
      createdAt: now,
      lastUsedAt: 0,
      useCount: 0,
      genre: candidate.source.genre,
      sourceLibrary: candidate.source.sourceLibrary,
      sourceUrl: candidate.source.sourceUrl,
      difficultyReason: candidate.difficultyReason,
      difficultyJudgedBy: "llm-rag-batch",
      difficultyEvaluation: "absolute",
      difficultyRubricVersion: "tahoiya-rag-absolute-v1",
      feedbackAnchorTags: candidate.feedbackAnchorTags,
      difficultyFeedbackIds: difficultyFeedbackIds.slice(0, 20),
    };
    return [normalizeWord(candidate.topic.word), JSON.stringify(record)];
  });
  await redisCommand<number>([
    "EVAL",
    "local added=0; for i=1,#ARGV,2 do if redis.call('HSETNX',KEYS[1],ARGV[i],ARGV[i+1])==1 then added=added+1 end end; return added",
    "1",
    catalogKey,
    ...catalogArgs,
  ]);
  if (reviewedSourceIds.length > 0) {
    await redisCommand<number>(["SADD", reviewedSourceKey, ...reviewedSourceIds]);
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
      record.topic.source === "llm" &&
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
  await submitDevelopmentVocabularyDraft({
    kind: "definition",
    payload: {
      gameId: "tahoiya",
      word: topic.word,
      reading: topic.reading,
      shortDefinition: topic.realDefinition,
      note: topic.note,
      sourceDetail: topic.sourceDetail,
      difficulty,
    },
    generation: topic.generation,
    sourceReference: normalizeWord(topic.word),
  });
}

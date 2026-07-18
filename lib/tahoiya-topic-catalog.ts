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
import { PostgresVocabularyCatalogRepository } from "@/lib/vocabulary-catalog-repository";
import {
  listActiveTahoiyaCatalogWords,
  listActiveTahoiyaTopics,
  recordTahoiyaTopicUsageByWord,
  type StoredTahoiyaTopic,
} from "@/lib/tahoiya-topic-repository";
import {
  filterUnexperiencedTahoiyaWords,
  rememberTahoiyaTopicHistory,
} from "@/lib/tahoiya-topic-history-store";
import {
  legacyTahoiyaCatalogKey,
  parseLegacyTahoiyaCatalogRecord,
  type LegacyTahoiyaTopicCatalogRecord,
} from "@/lib/tahoiya-legacy-catalog";

const reviewedSourceKey = "tahoiya:source-library:reviewed:v1";
const gitCatalogVersionKey = "tahoiya:topic:git-catalog-version:v1";
const sharedVocabularyRepository = new PostgresVocabularyCatalogRepository();

export type TahoiyaCatalogDifficulty = "easy" | "standard" | "extreme";

export type TahoiyaWordCandidate = {
  id: string;
  word: string;
  reading?: string;
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

export async function ensureTahoiyaGitCandidates() {
  const data = gitCandidateData as { updatedAt?: string; candidates?: GitCandidate[] };
  const version = data.updatedAt?.trim() || "";
  const candidates = Array.isArray(data.candidates) ? data.candidates : [];
  if (!version || candidates.length === 0) return 0;
  const [currentVersion, currentCount] = await Promise.all([
    redisCommand<string | null>(["GET", gitCatalogVersionKey]),
    redisCommand<number>(["HLEN", legacyTahoiyaCatalogKey]),
  ]);
  // The version marker can survive a catalog reset. Re-seed when the hash is
  // unexpectedly empty or incomplete even if the marker itself is current.
  if (currentVersion === version && Number(currentCount) >= candidates.length) return 0;

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
      const record: LegacyTahoiyaTopicCatalogRecord = {
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
      "1", legacyTahoiyaCatalogKey, ...args,
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
  const [catalogWords, reviewedIds, registry, sharedWords] = await Promise.all([
    loadTahoiyaCatalogWords(),
    redisCommand<string[]>(["SMEMBERS", reviewedSourceKey]).catch(() => []),
    loadTahoiyaSourceRegistry(),
    sharedVocabularyRepository.findWords({ gameId: "tahoiya", limit: 100 }).catch(() => []),
  ]);
  const blockedWords = new Set(catalogWords);
  const reviewed = new Set(Array.isArray(reviewedIds) ? reviewedIds : []);
  const sharedSources = sharedWords
    .filter((word) => word.zipf === 0)
    .map((word): TahoiyaSourceEntry => ({
      id: `word-master:${word.id}`,
      sourceRegistryId: `word-master:${word.id}`,
      word: word.surface,
      reading: word.reading ?? undefined,
      hint: `共通単語DBで選定された実効Zipf ${word.zipf?.toFixed(2)}`,
      genre: "共通単語DB",
      sourceLibrary: "GAME FIELDS 共通単語DB",
      sourceUrl: "https://github.com/koromo2010/app-games",
    }))
    .filter((entry) => !reviewed.has(entry.id) && !blockedWords.has(normalizeWord(entry.word)))
    .slice(0, Math.min(3, Math.max(1, limit)));
  const externalLimit = Math.max(0, limit - sharedSources.length);
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
  }).slice(0, externalLimit);

  let shelf = await loadTahoiyaSourceShelf();
  let selected = selectOnePerSource(shelf);
  if (selected.length < externalLimit) {
    const missingSourceIds = shuffledSourceIds.filter((sourceId) => availableForSource(shelf, sourceId).length === 0);
    await refreshTahoiyaSourceShelf(missingSourceIds);
    shelf = await loadTahoiyaSourceShelf();
    selected = selectOnePerSource(shelf);
  }
  return [...sharedSources, ...selected].slice(0, Math.max(1, limit));
}

export async function findUnexperiencedTahoiyaWordCandidates(
  playerIds: string[],
  blockedWords: string[],
  limit = 20,
): Promise<TahoiyaWordCandidate[]> {
  if (playerIds.length === 0) return [];
  const blocked = new Set(blockedWords.map(normalizeWord));
  const words = await sharedVocabularyRepository.findWords({ gameId: "tahoiya", limit: 500 });
  const candidates = words
    .filter((word) => word.zipf === 0 && !blocked.has(word.normalizedSurface))
    .map((word) => ({
      id: word.id,
      word: word.surface,
      reading: word.reading ?? undefined,
    }));
  const unexperienced = await filterUnexperiencedTahoiyaWords(candidates, playerIds);
  return unexperienced
    .map((candidate) => ({ candidate, order: Math.random() }))
    .sort((left, right) => left.order - right.order)
    .slice(0, Math.max(1, Math.min(50, Math.floor(limit))))
    .map(({ candidate }) => candidate);
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
  await Promise.all(candidates.map((candidate) => submitDevelopmentVocabularyDraft({
    kind: "definition",
    payload: {
      gameId: "tahoiya",
      word: candidate.topic.word,
      reading: candidate.topic.reading,
      realDefinition: candidate.topic.realDefinition,
      note: candidate.topic.note,
      sourceDetail: candidate.topic.sourceDetail,
      source: candidate.topic.source,
      difficulty: candidate.difficulty,
      genre: candidate.source.genre,
      sourceLibrary: candidate.source.sourceLibrary,
      sourceUrl: candidate.source.sourceUrl,
      difficultyReason: candidate.difficultyReason,
      difficultyJudgedBy: "llm-rag-batch",
      difficultyRubricVersion: "tahoiya-rag-absolute-v1",
      feedbackAnchorTags: candidate.feedbackAnchorTags,
      difficultyFeedbackIds: difficultyFeedbackIds.slice(0, 20),
      generation: candidate.topic.generation,
    },
    generation: candidate.topic.generation,
    sourceReference: normalizeWord(candidate.topic.word),
  })));
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
  const [storedTopics, legacyValues, ratingScores] = await Promise.all([
    listActiveTahoiyaTopics(difficulty, 200).catch(() => []),
    redisCommand<string[]>(["HVALS", legacyTahoiyaCatalogKey]).catch(() => []),
    loadTopicRatingScores().catch(() => new Map<string, { good: number; bad: number }>()),
  ]);
  const legacyRecords = (Array.isArray(legacyValues) ? legacyValues : [])
    .map(parseLegacyTahoiyaCatalogRecord)
    .filter((record): record is LegacyTahoiyaTopicCatalogRecord => Boolean(record));
  const legacyByWord = new Map(legacyRecords.map((record) => [normalizeWord(record.topic.word), record]));
  const sharedCandidates = storedTopics.filter((record) => {
    const word = normalizeWord(record.topic.word);
    const legacy = legacyByWord.get(word);
    return record.topic.source === "llm" &&
      !blocked.has(word) &&
      !legacy?.experiencedPlayerIds.some((playerId) => playerIds.includes(playerId));
  });
  const unexperiencedShared = await filterUnexperiencedTahoiyaWords(
    sharedCandidates.map((record) => ({ ...record, word: record.topic.word })),
    playerIds,
  );
  const candidates: Array<StoredTahoiyaTopic | LegacyTahoiyaTopicCatalogRecord> = unexperiencedShared.length > 0
    ? unexperiencedShared
    : await filterUnexperiencedTahoiyaWords(
      legacyRecords
        .filter((record) => record.topic.source === "llm" && record.difficulty === difficulty)
        .filter((record) => !blocked.has(normalizeWord(record.topic.word)))
        .filter((record) => playerIds.every((playerId) => !record.experiencedPlayerIds.includes(playerId)))
        .map((record) => ({ ...record, word: record.topic.word })),
      playerIds,
    );
  candidates
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
  const values = await redisCommand<string[]>(["HVALS", legacyTahoiyaCatalogKey]);
  return (Array.isArray(values) ? values : [])
    .map(parseLegacyTahoiyaCatalogRecord)
    .filter((record): record is LegacyTahoiyaTopicCatalogRecord => Boolean(
      record && playerIds.some((playerId) => record.experiencedPlayerIds.includes(playerId)),
    ))
    .map((record) => normalizeWord(record.topic.word));
}

export async function loadTahoiyaCatalogWords() {
  const [sharedWords, legacyWords] = await Promise.all([
    listActiveTahoiyaCatalogWords().catch(() => []),
    redisCommand<string[]>(["HKEYS", legacyTahoiyaCatalogKey]).catch(() => []),
  ]);
  return [...new Set([...sharedWords, ...(Array.isArray(legacyWords) ? legacyWords : [])]
    .map(normalizeWord).filter(Boolean))];
}

export async function rememberTahoiyaTopicExperience(
  topic: TahoiyaTopic,
  difficulty: TahoiyaDifficulty,
  playerIds: string[],
) {
  if (!topic.word || playerIds.length === 0) return;
  const now = Date.now();
  await rememberTahoiyaTopicHistory(topic.word, playerIds);
  await recordTahoiyaTopicUsageByWord(normalizeWord(topic.word)).catch(() => false);
  await redisCommand<number>([
    "EVAL",
    "local raw=redis.call('HGET',KEYS[1],ARGV[1]); if not raw then return 0 end; local item=cjson.decode(raw); item.lastUsedAt=tonumber(ARGV[2]); item.useCount=tonumber(item.useCount or 0)+1; redis.call('HSET',KEYS[1],ARGV[1],cjson.encode(item)); return 1",
    "1",
    legacyTahoiyaCatalogKey,
    normalizeWord(topic.word),
    String(now),
  ]).catch(() => 0);
}

export async function rememberTahoiyaTopicCandidate(topic: TahoiyaTopic, difficulty: TahoiyaDifficulty) {
  if (!topic.word || topic.generation?.reusedFromCatalog) return;
  await submitDevelopmentVocabularyDraft({
    kind: "definition",
    payload: {
      gameId: "tahoiya",
      word: topic.word,
      reading: topic.reading,
      realDefinition: topic.realDefinition,
      note: topic.note,
      sourceDetail: topic.sourceDetail,
      source: topic.source,
      difficulty,
      generation: topic.generation,
    },
    generation: topic.generation,
    sourceReference: normalizeWord(topic.word),
  });
}

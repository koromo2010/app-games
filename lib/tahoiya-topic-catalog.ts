import type { TahoiyaDifficulty, TahoiyaTopic } from "@/lib/tahoiya-types";
import gitCandidateData from "@/data/tahoiya-candidates.json";
import { normalizeGameGenerationMeta } from "@/lib/game-ai-types";
import { retrieveGameFeedback } from "@/lib/game-feedback-store";
import { redisCommand } from "@/lib/redis-store";
import { emitObservabilityEvent } from "@/lib/observability";
import { hasVeryCommonSpokenHomophone } from "@/lib/tahoiya-difficulty";
import {
  listActiveTahoiyaTopics,
  recordTahoiyaTopicUsageByWord,
  type StoredTahoiyaTopic,
} from "@/lib/tahoiya-topic-repository";
import {
  listScreenedTahoiyaWordCandidates,
  listUnscreenedTahoiyaWordCandidates,
} from "@/lib/tahoiya-screening-repository";
import {
  filterUnexperiencedTahoiyaWords,
  rememberTahoiyaTopicHistory,
} from "@/lib/tahoiya-topic-history-store";
import { pickRotatingTahoiyaTopic } from "@/lib/tahoiya-topic-selection";
import {
  legacyTahoiyaCatalogKey,
  parseLegacyTahoiyaCatalogRecord,
  type LegacyTahoiyaTopicCatalogRecord,
} from "@/lib/tahoiya-legacy-catalog";

const gitCatalogVersionKey = "tahoiya:topic:git-catalog-version:v1";

type TahoiyaCatalogDifficulty = "easy" | "standard" | "extreme";

export type TahoiyaWordCandidate = {
  id: string;
  word: string;
  reading?: string;
  effectiveZipf: number;
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
  generatedAt: string;
  generation: unknown;
};

function normalizeWord(value: string) {
  return value.normalize("NFKC").trim().toLocaleLowerCase("ja");
}

async function filterWithDeviceHistoryFallback<T extends { word: string }>(candidates: T[], playerIds: string[]) {
  const withoutAccountOrDeviceHistory = await filterUnexperiencedTahoiyaWords(candidates, playerIds, true);
  return withoutAccountOrDeviceHistory.length > 0
    ? withoutAccountOrDeviceHistory
    : filterUnexperiencedTahoiyaWords(candidates, playerIds);
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

export async function findUnexperiencedScreenedTahoiyaWordCandidates(
  difficulty: TahoiyaDifficulty,
  playerIds: string[],
  blockedWords: string[],
  limit = 20,
): Promise<TahoiyaWordCandidate[]> {
  if (playerIds.length === 0) return [];
  const blocked = new Set(blockedWords.map(normalizeWord));
  const screened = await listScreenedTahoiyaWordCandidates(difficulty, 500);
  const candidates = screened
    .filter((word) => !blocked.has(normalizeWord(word.word)))
    .map((word) => ({
      id: word.id,
      word: word.word,
      reading: word.reading,
      effectiveZipf: word.effectiveZipf,
    }));
  const unexperienced = await filterWithDeviceHistoryFallback(candidates, playerIds);
  return unexperienced
    .map((candidate) => ({ candidate, order: Math.random() }))
    .sort((left, right) => left.order - right.order)
    .slice(0, Math.max(1, Math.min(50, Math.floor(limit))))
    .map(({ candidate }) => candidate);
}

export async function findUnscreenedUnexperiencedTahoiyaWordCandidates(
  playerIds: string[],
  blockedWords: string[],
  limit = 10,
): Promise<TahoiyaWordCandidate[]> {
  if (playerIds.length === 0) return [];
  const blocked = new Set(blockedWords.map(normalizeWord));
  const words = await listUnscreenedTahoiyaWordCandidates(500);
  const candidates = words.filter((word) => !blocked.has(normalizeWord(word.word)));
  const unexperienced = await filterWithDeviceHistoryFallback(candidates, playerIds);
  return unexperienced
    .map((candidate) => ({ candidate, order: Math.random() }))
    .sort((left, right) => left.order - right.order)
    .slice(0, Math.max(1, Math.min(10, Math.floor(limit))))
    .map(({ candidate }) => candidate);
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
  const unexperiencedShared = await filterWithDeviceHistoryFallback(
    sharedCandidates.map((record) => ({ ...record, word: record.topic.word })),
    playerIds,
  );
  const candidates: Array<StoredTahoiyaTopic | LegacyTahoiyaTopicCatalogRecord> = unexperiencedShared.length > 0
    ? unexperiencedShared
    : await filterWithDeviceHistoryFallback(
      legacyRecords
        .filter((record) => record.topic.source === "llm" && record.difficulty === difficulty)
        .filter((record) => !blocked.has(normalizeWord(record.topic.word)))
        .filter((record) => playerIds.every((playerId) => !record.experiencedPlayerIds.includes(playerId)))
        .map((record) => ({ ...record, word: record.topic.word })),
      playerIds,
    );
  const record = pickRotatingTahoiyaTopic(candidates, (candidate) => {
    const rating = ratingScores.get(normalizeWord(candidate.topic.word)) ?? { good: 0, bad: 0 };
    return rating.good - rating.bad;
  });
  if (!record) return null;
  return {
    ...record.topic,
    generation: record.topic.generation
      ? { ...record.topic.generation, latencyMs: 0, reusedFromCatalog: true }
      : undefined,
  } satisfies TahoiyaTopic;
}

export async function rememberTahoiyaTopicExperience(
  topic: TahoiyaTopic,
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

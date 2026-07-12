import { normalizeGameGenerationMeta } from "@/lib/game-ai-types";
import {
  getTopicKey,
  getTopicWords,
  normalizeTopicWord,
  type TopicDictionarySource,
  type TopicPairDistance,
  type WordWolfTopic,
} from "@/lib/wordwolf";
import { redisCommand } from "@/lib/redis-store";

const catalogKey = "wordwolf:topic:catalog:v1";
const wordExperienceKey = "wordwolf:topic:word-experience:v1";

type WordWolfTopicCatalogRecord = {
  topic: WordWolfTopic;
  createdAt: number;
  lastUsedAt: number;
  useCount: number;
};

function parsePlayerIds(value: string | undefined) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((id): id is string => typeof id === "string" && Boolean(id))
      : [];
  } catch {
    return [];
  }
}

function parseRecord(value: string): WordWolfTopicCatalogRecord | null {
  try {
    const parsed = JSON.parse(value) as Partial<WordWolfTopicCatalogRecord>;
    if (!parsed.topic?.villageWord || !parsed.topic.wolfWord) return null;
    return {
      topic: { ...parsed.topic, generation: normalizeGameGenerationMeta(parsed.topic.generation) },
      createdAt: typeof parsed.createdAt === "number" ? parsed.createdAt : Date.now(),
      lastUsedAt: typeof parsed.lastUsedAt === "number" ? parsed.lastUsedAt : 0,
      useCount: typeof parsed.useCount === "number" ? Math.max(0, Math.floor(parsed.useCount)) : 0,
    };
  } catch {
    return null;
  }
}

export async function loadExperiencedWordWolfWords(playerIds: string[]) {
  if (playerIds.length === 0) return [];
  const raw = await redisCommand<string[]>(["HGETALL", wordExperienceKey]);
  const experiencedWords: string[] = [];
  for (let index = 0; index < (Array.isArray(raw) ? raw.length : 0); index += 2) {
    const word = raw[index];
    const experiencedPlayerIds = parsePlayerIds(raw[index + 1]);
    // 参加者の誰か一人でも使用済みなら、この部屋では候補から除外する。
    if (word && playerIds.some((playerId) => experiencedPlayerIds.includes(playerId))) {
      experiencedWords.push(word);
    }
  }
  return experiencedWords;
}

export async function findReusableWordWolfTopic(input: {
  dictionarySource: TopicDictionarySource;
  pairDistance: TopicPairDistance;
  topicHint: string;
  playerIds: string[];
  blockedWords: string[];
}) {
  if (input.playerIds.length === 0) return null;
  const experiencedWords = await loadExperiencedWordWolfWords(input.playerIds);
  const blocked = new Set([...input.blockedWords, ...experiencedWords].map(normalizeTopicWord));
  const normalizedHint = normalizeTopicWord(input.topicHint);
  const values = await redisCommand<string[]>(["HVALS", catalogKey]);
  const candidates = (Array.isArray(values) ? values : [])
    .map(parseRecord)
    .filter((record): record is WordWolfTopicCatalogRecord => Boolean(
      record &&
      record.topic.dictionarySource === input.dictionarySource &&
      record.topic.pairDistance === input.pairDistance &&
      getTopicWords(record.topic).every((word) => !blocked.has(word)) &&
      (!normalizedHint || normalizeTopicWord(
        `${record.topic.villageWord} ${record.topic.wolfWord} ${record.topic.reason}`,
      ).includes(normalizedHint)),
    ))
    .sort((left, right) => left.useCount - right.useCount || left.lastUsedAt - right.lastUsedAt);
  const record = candidates[0];
  if (!record) return null;
  return {
    ...record.topic,
    generation: record.topic.generation
      ? { ...record.topic.generation, latencyMs: 0, reusedFromCatalog: true }
      : undefined,
  } satisfies WordWolfTopic;
}

export async function rememberWordWolfTopicExperience(topic: WordWolfTopic, playerIds: string[]) {
  const words = getTopicWords(topic);
  if (playerIds.length === 0 || words.length !== 2) return;
  const now = Date.now();
  const seed: WordWolfTopicCatalogRecord = {
    topic,
    createdAt: now,
    lastUsedAt: 0,
    useCount: 0,
  };
  await redisCommand<number>([
    "EVAL",
    "local raw=redis.call('HGET',KEYS[1],ARGV[1]); local item=raw and cjson.decode(raw) or cjson.decode(ARGV[2]); item.lastUsedAt=tonumber(ARGV[3]); item.useCount=tonumber(item.useCount or 0)+1; redis.call('HSET',KEYS[1],ARGV[1],cjson.encode(item)); for w=4,5 do local idsRaw=redis.call('HGET',KEYS[2],ARGV[w]); local ids=idsRaw and cjson.decode(idsRaw) or {}; local seen={}; for _,id in ipairs(ids) do seen[id]=true end; for i=6,#ARGV do if ARGV[i]~='' and not seen[ARGV[i]] then table.insert(ids,ARGV[i]); seen[ARGV[i]]=true end end; redis.call('HSET',KEYS[2],ARGV[w],cjson.encode(ids)); end; return 1",
    "2",
    catalogKey,
    wordExperienceKey,
    getTopicKey(topic),
    JSON.stringify(seed),
    String(now),
    words[0],
    words[1],
    ...playerIds,
  ]);
}

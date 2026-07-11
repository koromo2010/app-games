import {
  normalizeTopicDictionarySource,
  getTopicKey,
  getTopicWords,
  normalizeTopicPairDistance,
  normalizeTopicWord,
  isValidWordWolfTopic,
  pickFallbackTopic,
  type TopicDictionarySource,
  type TopicPairDistance,
  type WordWolfTopic,
} from "@/lib/wordwolf";
import { redisCommand } from "@/lib/redis-store";

const baseTopicPrompt =
  "ワードウルフ用のお題ペアを1組作ってください。3-6人で3周ほど話す前提です。日本語で、共通点を話せるが同じ言葉の言い換えではない組み合わせにしてください。JSONのみで返してください: {\"villageWord\":\"...\",\"wolfWord\":\"...\",\"reason\":\"...\"}";

const usedPairKey = "wordwolf:topic:pairs";
const dailyWordKeyPrefix = "wordwolf:topic:daily-words:";

function isLlmEnabled(dictionarySource: TopicDictionarySource) {
  return (
    (dictionarySource === "llm" || dictionarySource === "proper-noun") &&
    process.env.WORDWOLF_USE_LLM === "true" &&
    Boolean(process.env.OPENAI_API_KEY)
  );
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function getJstDateKey() {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function getDailyWordKey(dateKey = getJstDateKey()) {
  return `${dailyWordKeyPrefix}${dateKey}`;
}

function normalizeList(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function isTopicAllowed(topic: WordWolfTopic, excludeKeys: string[], excludeWords: string[]) {
  const excludedKeys = new Set(excludeKeys);
  const excludedWords = new Set(excludeWords.map(normalizeTopicWord).filter(Boolean));

  return !excludedKeys.has(getTopicKey(topic)) && getTopicWords(topic).every((word) => !excludedWords.has(word));
}

async function loadStoredTopicUsage() {
  try {
    const [usedPairs, dailyWords] = await Promise.all([
      redisCommand<string[]>(["SMEMBERS", usedPairKey]),
      redisCommand<string[]>(["SMEMBERS", getDailyWordKey()]),
    ]);

    return {
      usedPairs: Array.isArray(usedPairs) ? usedPairs : [],
      dailyWords: Array.isArray(dailyWords) ? dailyWords : [],
    };
  } catch {
    return { usedPairs: [], dailyWords: [] };
  }
}

async function rememberStoredTopicUsage(topic: WordWolfTopic) {
  try {
    const dailyWordKey = getDailyWordKey();
    await Promise.all([
      redisCommand<number>(["SADD", usedPairKey, getTopicKey(topic)]),
      redisCommand<number>(["SADD", dailyWordKey, ...getTopicWords(topic)]),
      redisCommand<number>(["EXPIRE", dailyWordKey, 60 * 60 * 24 * 3]),
    ]);
  } catch {
    // Topic history is best-effort; generation still works when Redis is unavailable.
  }
}

function parseTopic(
  text: string,
  pairDistance: TopicPairDistance,
  dictionarySource: Extract<TopicDictionarySource, "llm" | "proper-noun">,
): WordWolfTopic | null {
  try {
    const parsed = JSON.parse(text) as Partial<WordWolfTopic>;
    if (!parsed.villageWord || !parsed.wolfWord) return null;

    const topic = {
      villageWord: String(parsed.villageWord).trim(),
      wolfWord: String(parsed.wolfWord).trim(),
      reason: String(parsed.reason || "近いカテゴリだが体験や用途が違うペアです。"),
      source: "llm",
      dictionarySource,
      pairDistance,
      sourceMode: dictionarySource === "proper-noun" ? "proper-noun" : "llm",
    } satisfies WordWolfTopic;

    return isValidWordWolfTopic(topic) ? topic : null;
  } catch {
    return null;
  }
}

function getTopicRequestOptions(request: Request) {
  const url = new URL(request.url);
  const legacyMode = url.searchParams.get("mode");

  return {
    excludeKeys: normalizeList(url.searchParams.get("exclude")?.split(",") ?? []).slice(0, 500),
    excludeWords: normalizeList(url.searchParams.get("excludeWords")?.split(",") ?? []).slice(0, 500),
    dictionarySource: normalizeTopicDictionarySource(url.searchParams.get("source") ?? legacyMode),
    pairDistance: normalizeTopicPairDistance(url.searchParams.get("distance") ?? legacyMode),
  };
}

async function generateLlmTopic(
  excludeKeys: string[],
  excludeWords: string[],
  pairDistance: TopicPairDistance,
  dictionarySource: Extract<TopicDictionarySource, "llm" | "proper-noun">,
) {
  const { default: OpenAI } = await import("openai");
  const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    maxRetries: 0,
    timeout: 4000,
  });

  const distancePrompt =
    pairDistance === "near"
      ? "ペアの距離は近めにしてください。同じ細分類に入るが、話すと違いが出る組み合わせにしてください。完全な同義語やほぼ言い換えは避けてください。"
      : pairDistance === "wide"
        ? "ペアの距離は少し広めにしてください。共通文脈はあるが、分類や体験が明確に違う組み合わせにしてください。"
        : "ペアの距離は標準にしてください。同じカテゴリ内で、近すぎず離れすぎない組み合わせにしてください。";

  const prompt =
    excludeKeys.length > 0
      ? `${baseTopicPrompt}\n${distancePrompt}\n最近出たので避けるペア: ${excludeKeys.join(", ")}`
      : `${baseTopicPrompt}\n${distancePrompt}`;

  const topicKindPrompt =
    dictionarySource === "proper-noun"
      ? [
          "Proper noun mode: use only reasonably famous proper nouns that ordinary Japanese players are likely to know.",
          "Allowed types include people, fictional characters, works, brands/products, organizations, facilities, regions, landmarks, and events.",
          "Pair the same semantic type and layer: person with person, character with character, work with work, brand/product with brand/product, place/landmark with place/landmark, organization with organization.",
          "Avoid obscure names, private/internal names, and pairs that require specialist knowledge.",
        ].join(" ")
      : [
          "General word mode: use common Japanese nouns, not proper nouns.",
          "Pair the same semantic type and layer: object with object, place with place, activity/concept with activity/concept, person/living thing with the same kind.",
        ].join(" ");

  const avoidLines = [
    topicKindPrompt,
    "Do not pair an object with a place, a person with a work, or an abstract concept with a concrete object.",
    excludeWords.length > 0 ? `exclude words used today: ${excludeWords.join(", ")}` : "",
  ].filter(Boolean);
  const promptWithExclusions = `${prompt}${avoidLines.length > 0 ? `\n${avoidLines.join("\n")}` : ""}`;

  const response = await withTimeout(
    client.responses.create({
      model: "gpt-4.1-mini",
      input: promptWithExclusions,
    }),
    4500,
  );

  return parseTopic(response.output_text, pairDistance, dictionarySource);
}

export async function GET(request: Request) {
  const { excludeKeys, excludeWords, dictionarySource, pairDistance } = getTopicRequestOptions(request);
  const storedUsage = await loadStoredTopicUsage();
  const allExcludeKeys = normalizeList([...excludeKeys, ...storedUsage.usedPairs]);
  const allExcludeWords = normalizeList([...excludeWords, ...storedUsage.dailyWords]);

  const fallbackTopic = () => pickFallbackTopic(allExcludeKeys, dictionarySource, pairDistance, allExcludeWords);

  if (!isLlmEnabled(dictionarySource)) {
    const topic = fallbackTopic();
    await rememberStoredTopicUsage(topic);
    return Response.json(topic);
  }

  try {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const topic = await generateLlmTopic(
        allExcludeKeys,
        allExcludeWords,
        pairDistance,
        dictionarySource === "proper-noun" ? "proper-noun" : "llm",
      );
      if (topic && isTopicAllowed(topic, allExcludeKeys, allExcludeWords)) {
        await rememberStoredTopicUsage(topic);
        return Response.json(topic);
      }
    }

    const topic = fallbackTopic();
    await rememberStoredTopicUsage(topic);
    return Response.json(topic);
  } catch (error) {
    console.error("[wordwolf/topic] falling back to local topic", error);
    const topic = fallbackTopic();
    await rememberStoredTopicUsage(topic);
    return Response.json(topic);
  }
}

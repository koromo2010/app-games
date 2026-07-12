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
import { hasPaidLlmAccess, paidLlmModel } from "@/lib/llm-access";
import { redisCommand } from "@/lib/redis-store";

const baseTopicPrompt =
  "ワードウルフ用のお題ペアを1組作ってください。3-6人で3周ほど話す前提です。日本語で、共通点を話せるが同じ言葉の言い換えではない組み合わせにしてください。JSONのみで返してください: {\"villageWord\":\"...\",\"wolfWord\":\"...\",\"reason\":\"...\"}";

const usedPairKey = "wordwolf:topic:pairs";
const dailyWordKeyPrefix = "wordwolf:topic:daily-words:";

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

function normalizeTopicHint(value: string | null) {
  return (value ?? "").trim().replace(/\s+/g, " ").slice(0, 80);
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
      fallbackExhausted: false,
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
    topicHint: normalizeTopicHint(url.searchParams.get("hint")),
  };
}

async function generateLlmTopic(
  excludeKeys: string[],
  excludeWords: string[],
  pairDistance: TopicPairDistance,
  dictionarySource: Extract<TopicDictionarySource, "llm" | "proper-noun">,
  topicHint: string,
) {
  const { default: OpenAI } = await import("openai");
  const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    maxRetries: 0,
    timeout: 4000,
  });

  const distancePrompt =
    pairDistance === "near"
      ? "ペアの距離は近い設定です。誰でも共通点をすぐ理解できる類語・兄弟語・同じ用途の組み合わせにしてください。ただし完全な同義語や単なる言い換えは避け、話すと違いが出る余地を残してください。"
      : pairDistance === "wide"
        ? "ペアの距離は遠い設定です。Aから共通語を一つ挟んでBにつながるくらいまで離してよいです。例: A -> 共通語 -> B の二段連想で同じ広い文脈に戻れる組み合わせにしてください。物は物、場所は場所、人物は人物、作品は作品など意味のレイヤーは必ず揃えてください。同じ語群の一番有名なものと二番目に有名なものを並べるのは避けてください。"
        : "ペアの距離は普通設定です。以前の広めに近い塩梅で、大きな共通文脈はあるが、分類・体験・使う場面がはっきり違う組み合わせにしてください。近すぎる隣同士は避け、ただし一言では共通点を説明できる距離にしてください。";

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
          "Prefer categories where several other famous alternatives also exist, so early clues do not uniquely identify the answer. Good examples: convenience-store chains, coffee chains, universities, train lines, theme parks, video platforms, sports teams, long-running TV shows, manga magazines, game consoles, smartphone brands, and city landmarks.",
          "Do not use bare abstract concepts or opposing ideology words as proper nouns. For school topics, use named people, named works, named events, named treaties, named laws, named places, named institutions, or person-named laws/theories.",
          "Do not pair the most famous item and the second most famous item in the same narrow group. Prefer a third/fourth option, a different subfield, or a two-hop association that still shares a broad context.",
          "Avoid uniquely iconic one-of-one names where a generic clue immediately reveals the answer, such as a single nationally symbolic mountain, a once-in-a-generation athlete, or an overwhelmingly famous mascot with no plausible alternatives.",
          "Do not choose pairs whose main shared clue is just 'very famous'. They must share a broad category with at least 3 plausible wrong guesses players might imagine.",
          "Avoid obscure names, private/internal names, and pairs that require specialist knowledge.",
        ].join(" ")
      : [
          "General word mode: use common Japanese nouns, not proper nouns.",
          "Pair the same semantic type and layer: object with object, place with place, activity/concept with activity/concept, person/living thing with the same kind.",
        ].join(" ");
  const studyScopePrompt =
    dictionarySource === "proper-noun"
      ? "Also include school-study friendly named topics when useful: historical events, eras, wars, reforms, treaties, laws, classical works, named theorems, named theories, people, places, and institutions. Keep the pair on the same learning layer. Avoid bare subject terms such as capitalism/socialism, supply/demand, inflation/deflation, function/equation, or photosynthesis/respiration unless they are part of a recognized proper name."
      : "";

  const avoidLines = [
    topicKindPrompt,
    studyScopePrompt,
    topicHint
      ? `Theme hint is a hard requirement: the pair must be directly related to "${topicHint}". If the hint is a game, subject, genre, person, place, historical field, or hobby, choose words from that field. Do not ignore the hint. Do not use the hint itself unless it is a natural topic word.`
      : "",
    "Do not pair an object with a place, a person with a work, or an abstract concept with a concrete object.",
    excludeWords.length > 0 ? `exclude words used today: ${excludeWords.join(", ")}` : "",
  ].filter(Boolean);
  const promptWithExclusions = `${prompt}${avoidLines.length > 0 ? `\n${avoidLines.join("\n")}` : ""}`;

  const response = await withTimeout(
    client.responses.create({
      model: paidLlmModel,
      input: promptWithExclusions,
    }),
    4500,
  );

  return parseTopic(response.output_text, pairDistance, dictionarySource);
}

export async function GET(request: Request) {
  const { excludeKeys, excludeWords, dictionarySource, pairDistance, topicHint } = getTopicRequestOptions(request);
  const storedUsage = await loadStoredTopicUsage();
  const allExcludeKeys = normalizeList([...excludeKeys, ...storedUsage.usedPairs]);
  const allExcludeWords = normalizeList([...excludeWords, ...storedUsage.dailyWords]);
  const requiresLlm = dictionarySource === "llm" || dictionarySource === "proper-noun";
  const canUsePaidLlm = requiresLlm ? await hasPaidLlmAccess() : false;

  const fallbackTopic = () => pickFallbackTopic(allExcludeKeys, dictionarySource, pairDistance, allExcludeWords, topicHint);

  if (!requiresLlm || !canUsePaidLlm) {
    const topic = fallbackTopic();
    await rememberStoredTopicUsage(topic);
    return Response.json(topic);
  }

  const deadline = Date.now() + 28000;
  let lastError: unknown = null;

  while (Date.now() < deadline) {
    try {
      const topic = await generateLlmTopic(
        allExcludeKeys,
        allExcludeWords,
        pairDistance,
        dictionarySource === "proper-noun" ? "proper-noun" : "llm",
        topicHint,
      );
      if (topic && isTopicAllowed(topic, allExcludeKeys, allExcludeWords)) {
        await rememberStoredTopicUsage(topic);
        return Response.json(topic);
      }
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError) {
    console.error("[wordwolf/topic] LLM topic generation did not complete", lastError);
  }
  return Response.json({ error: "LLM topic generation did not complete." }, { status: 503 });
}

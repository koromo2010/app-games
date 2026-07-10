import {
  normalizeTopicDictionarySource,
  normalizeTopicPairDistance,
  isValidWordWolfTopic,
  pickFallbackTopic,
  type TopicDictionarySource,
  type TopicPairDistance,
  type WordWolfTopic,
} from "@/lib/wordwolf";

const baseTopicPrompt =
  "ワードウルフ用のお題ペアを1組作ってください。3-6人で3周ほど話す前提です。一般的な日本語名詞で、共通点を話せるが同じ言葉の言い換えではない組み合わせにしてください。JSONのみで返してください: {\"villageWord\":\"...\",\"wolfWord\":\"...\",\"reason\":\"...\"}";

function isLlmEnabled(dictionarySource: TopicDictionarySource) {
  return dictionarySource === "llm" && process.env.WORDWOLF_USE_LLM === "true" && Boolean(process.env.OPENAI_API_KEY);
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

function parseTopic(text: string, pairDistance: TopicPairDistance): WordWolfTopic | null {
  try {
    const parsed = JSON.parse(text) as Partial<WordWolfTopic>;
    if (!parsed.villageWord || !parsed.wolfWord) return null;

    const topic = {
      villageWord: String(parsed.villageWord).trim(),
      wolfWord: String(parsed.wolfWord).trim(),
      reason: String(parsed.reason || "近いカテゴリだが体験や用途が違うペアです。"),
      source: "llm",
      dictionarySource: "llm",
      pairDistance,
      sourceMode: "llm",
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
    excludeKeys:
      url.searchParams
        .get("exclude")
        ?.split(",")
        .map((key) => key.trim())
        .filter(Boolean)
        .slice(0, 30) ?? [],
    dictionarySource: normalizeTopicDictionarySource(url.searchParams.get("source") ?? legacyMode),
    pairDistance: normalizeTopicPairDistance(url.searchParams.get("distance") ?? legacyMode),
  };
}

async function generateLlmTopic(excludeKeys: string[], pairDistance: TopicPairDistance) {
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

  const response = await withTimeout(
    client.responses.create({
      model: "gpt-4.1-mini",
      input: prompt,
    }),
    4500,
  );

  return parseTopic(response.output_text, pairDistance);
}

export async function GET(request: Request) {
  const { excludeKeys, dictionarySource, pairDistance } = getTopicRequestOptions(request);

  if (!isLlmEnabled(dictionarySource)) {
    return Response.json(pickFallbackTopic(excludeKeys, dictionarySource, pairDistance));
  }

  try {
    const topic = await generateLlmTopic(excludeKeys, pairDistance);
    return Response.json(topic ?? pickFallbackTopic(excludeKeys, dictionarySource, pairDistance));
  } catch (error) {
    console.error("[wordwolf/topic] falling back to local topic", error);
    return Response.json(pickFallbackTopic(excludeKeys, dictionarySource, pairDistance));
  }
}

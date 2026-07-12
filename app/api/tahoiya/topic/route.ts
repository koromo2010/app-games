import {
  gameLlmFallbackNotice,
  generateGameLlmText,
  resolveGameLlmMode,
  type GameLlmMode,
} from "@/lib/game-llm";
import type { GameGenerationMeta } from "@/lib/game-ai-types";
import { formatGameFeedbackContext, retrieveGameFeedback } from "@/lib/game-feedback-store";
import { redisCommand } from "@/lib/redis-store";
import type { TahoiyaTopic } from "@/lib/tahoiya-types";

const tahoiyaTopicPromptVersion = "tahoiya-topic-v4";
const usedTopicWordsKey = "tahoiya:topic:used-words";

function localGenerationMeta(retrievedFeedbackIds: string[]): GameGenerationMeta {
  return {
    provider: "local",
    model: "local-topic-data",
    mode: "local",
    promptVersion: tahoiyaTopicPromptVersion,
    latencyMs: 0,
    retrievedFeedbackIds,
  };
}

const fallbackTopics: TahoiyaTopic[] = [
  {
    word: "虎落笛",
    reading: "もがりぶえ",
    realDefinition: "冬の強い風が竹垣などに当たって鳴る音。",
    note: "意味を知る人が少なく偽説明を作りやすい季語。",
    sourceDetail: "ローカル収録候補。国語辞典や季語辞典で扱われる語義をゲーム用に簡潔化。",
    source: "fallback",
  },
  {
    word: "筌",
    reading: "うけ",
    realDefinition: "水中に仕掛けて魚などを捕らえる道具。",
    note: "一般には知られにくい古い漁具の名称。",
    sourceDetail: "ローカル収録候補。国語辞典にある漁具としての語義をゲーム用に簡潔化。",
    source: "fallback",
  },
  {
    word: "襤褸",
    reading: "らんる",
    realDefinition: "使い古してぼろぼろになった衣服。",
    note: "日常語ではないが偽の意味を想像しやすい語。",
    sourceDetail: "ローカル収録候補。国語辞典にある衣服の語義をゲーム用に簡潔化。",
    source: "fallback",
  },
  {
    word: "鰾",
    reading: "うきぶくろ",
    realDefinition: "魚が水中で浮力を調節するための器官。",
    note: "実在する意味を知らなくても説明を捏造しやすい語。",
    sourceDetail: "ローカル収録候補。国語辞典や生物学辞典の語義をゲーム用に簡潔化。",
    source: "fallback",
  },
];

function normalizeTopicWord(value: string) {
  return value.normalize("NFKC").trim().toLocaleLowerCase("ja");
}

async function loadUsedTopicWords() {
  try {
    const words = await redisCommand<string[]>(["SMEMBERS", usedTopicWordsKey]);
    return Array.isArray(words) ? words : [];
  } catch {
    return [];
  }
}

async function rememberUsedTopicWord(word: string) {
  try {
    await redisCommand<number>(["SADD", usedTopicWordsKey, normalizeTopicWord(word)]);
  } catch {
    // Topic history is best-effort; generation still works when Redis is unavailable.
  }
}

function pickFallbackTopic(usedWords: string[]) {
  const used = new Set(usedWords.map(normalizeTopicWord));
  const candidates = fallbackTopics.filter((topic) => !used.has(normalizeTopicWord(topic.word)));
  return candidates.length > 0 ? candidates[Math.floor(Math.random() * candidates.length)] : null;
}

function simplifyDefinition(value: unknown) {
  const text = String(value ?? "")
    .replace(/[（(][^）)]*[）)]/g, "")
    .replace(/^[^、。]{1,20}と読み、/, "")
    .replace(/\s+/g, " ")
    .trim();
  const firstSentence = text.split("。").map((part) => part.trim()).find(Boolean);
  return firstSentence ? `${firstSentence}。` : "";
}

function parseTopic(text: string): TahoiyaTopic | null {
  try {
    const parsed = JSON.parse(text) as Partial<TahoiyaTopic>;
    const realDefinition = simplifyDefinition(parsed.realDefinition);
    if (!parsed.word || !realDefinition || Array.from(realDefinition).length > 46) return null;

    return {
      word: String(parsed.word).trim(),
      reading: parsed.reading ? String(parsed.reading).trim() : undefined,
      realDefinition,
      note: String(parsed.note || "LLMが選んだ辞書風のお題です。"),
      sourceDetail: String(parsed.sourceDetail || "LLMによる生成後、別の校閲プロンプトで読みと意味を再確認。"),
      source: "llm",
    };
  } catch {
    return null;
  }
}

function parseVerifiedTopic(text: string): TahoiyaTopic | null {
  try {
    const parsed = JSON.parse(text) as Partial<TahoiyaTopic> & { valid?: boolean };
    if (parsed.valid !== true) return null;
    return parseTopic(JSON.stringify(parsed));
  } catch {
    return null;
  }
}

async function generateTopic(
  mode: Exclude<GameLlmMode, "local">,
  feedbackContext: string,
  retrievedFeedbackIds: string[],
  usedWords: string[],
) {
  const instructions = [
    "国語辞典を使ったパーティーゲーム『たほい屋』用のお題を1つ作ってください。",
    "日本語として実在し、一般的な日本人の大人がまず意味を知らない難語を選んでください。",
    "よく知られた物を難しい漢字で書いただけの語ではなく、言葉や意味そのものが広く知られていないものを優先してください。",
    "参加者がもっともらしい偽説明を複数考えられる語を選んでください。造語や実在が確認できない語は禁止です。",
    "専門的すぎる固有名詞、差別語、性的または残虐な語、現代人物名は避けてください。",
    "realDefinitionには意味だけを書き、読み方、語源、用例、別名、漢字の説明を含めないでください。",
    "realDefinitionは括弧を使わず、45文字以内の簡潔な一文にしてください。複数の意味を並べないでください。",
    "readingは専用フィールドにだけ入れてください。noteは選定理由を短く書いてください。",
    "sourceDetailには、その語と語義を確認できる辞書名・辞典の種類・典拠など、確実な確認情報を短く書いてください。不確かな辞書名を創作しないでください。",
    usedWords.length > 0 ? `過去に出題済みなので絶対に使わない見出し語: ${usedWords.slice(0, 500).join("、")}` : "",
    "JSONのみで返してください: {\"word\":\"...\",\"reading\":\"...\",\"realDefinition\":\"...\",\"note\":\"...\",\"sourceDetail\":\"...\"}",
  ].filter(Boolean).join("\n");
  const prompt = [instructions, feedbackContext].filter(Boolean).join("\n\n");

  const generated = await generateGameLlmText(prompt, mode);
  const topic = parseTopic(generated.text);
  if (!topic) return null;

  const verificationPrompt = [
    "あなたは日本語辞書の校閲者です。次のたほい屋用候補を厳格に検証してください。",
    "見出し語が実在する日本語の語であり、readingがその見出し語の正しい読みであり、realDefinitionがその意味に正確に対応する場合だけvalidをtrueにしてください。",
    "単なる当て字、読みと意味の取り違え、存在が不確かな語、一般人が意味を知っている語、説明が不正確な候補はvalidをfalseにしてください。",
    "少しでも確信がなければvalidをfalseにしてください。推測で修正や補完をしないでください。",
    "validがtrueの場合も、realDefinitionは意味だけの45文字以内の一文にし、読み方、語源、用例、別名、漢字の説明、括弧を含めないでください。",
    "sourceDetailの辞書名や確認情報が不確か、または創作の可能性がある場合もvalidをfalseにしてください。",
    "JSONのみで返してください: {\"valid\":trueまたはfalse,\"word\":\"...\",\"reading\":\"...\",\"realDefinition\":\"...\",\"note\":\"...\",\"sourceDetail\":\"...\"}",
    `検証候補: ${JSON.stringify(topic)}`,
  ].join("\n");
  const verified = await generateGameLlmText(verificationPrompt, mode);
  const verifiedTopic = parseVerifiedTopic(verified.text);
  return verifiedTopic
    ? {
        ...verifiedTopic,
        generation: {
          provider: verified.provider,
          model: verified.model,
          mode: verified.mode,
          promptVersion: tahoiyaTopicPromptVersion,
          latencyMs: generated.latencyMs + verified.latencyMs,
          retrievedFeedbackIds,
        },
      }
    : null;
}

export async function GET() {
  const usedWords = await loadUsedTopicWords();
  const usedWordSet = new Set(usedWords.map(normalizeTopicWord));
  const mode = await resolveGameLlmMode();
  const feedbackRecords = await retrieveGameFeedback({
    game: "tahoiya",
    task: "tahoiya.topic",
    queryTags: ["very-hard", "simple-definition", "no-parentheses"],
  }).catch(() => []);
  const feedbackContext = formatGameFeedbackContext(feedbackRecords);
  const retrievedFeedbackIds = feedbackRecords.map((record) => record.id);
  const fallbackResponse = async () => {
    const topic = pickFallbackTopic(usedWords);
    if (!topic) {
      return Response.json({ error: "候補枯渇", notice: "未出題のローカル候補がありません。" }, { status: 503 });
    }
    await rememberUsedTopicWord(topic.word);
    return Response.json({
      ...topic,
      notice: gameLlmFallbackNotice,
      generation: localGenerationMeta(retrievedFeedbackIds),
    });
  };

  if (mode === "local") {
    return fallbackResponse();
  }

  try {
    const topic = await generateTopic(mode, feedbackContext, retrievedFeedbackIds, usedWords);
    if (topic && !usedWordSet.has(normalizeTopicWord(topic.word))) {
      await rememberUsedTopicWord(topic.word);
      return Response.json(topic);
    }
    return fallbackResponse();
  } catch (error) {
    console.error("[tahoiya/topic] falling back to local topic", error);
    return fallbackResponse();
  }
}

import {
  gameLlmFallbackNotice,
  generateGameLlmText,
  resolveGameLlmMode,
  type GameLlmMode,
} from "@/lib/game-llm";
import type { TahoiyaTopic } from "@/lib/tahoiya-types";

const fallbackTopics: TahoiyaTopic[] = [
  {
    word: "たほい屋",
    reading: "たほいや",
    realDefinition: "静岡県などで、イノシシを追うために山中に設けた番小屋。やらい小屋。",
    note: "例題として使いやすい方言系の語。",
    source: "fallback",
  },
  {
    word: "海月",
    reading: "くらげ",
    realDefinition: "刺胞動物のうち、寒天質の体で水中を漂うものの総称。",
    note: "表記から意味を誤誘導しやすい語。",
    source: "fallback",
  },
  {
    word: "独活",
    reading: "うど",
    realDefinition: "ウコギ科の多年草。若芽や茎を食用にする。",
    note: "漢字から正体を推測しづらい植物名。",
    source: "fallback",
  },
  {
    word: "木菟",
    reading: "みみずく",
    realDefinition: "フクロウ類のうち、耳のように見える羽角をもつものの俗称。",
    note: "字面と読みの距離があり、偽語釈を作りやすい語。",
    source: "fallback",
  },
];

function pickFallbackTopic() {
  return fallbackTopics[Math.floor(Math.random() * fallbackTopics.length)];
}

function parseTopic(text: string): TahoiyaTopic | null {
  try {
    const parsed = JSON.parse(text) as Partial<TahoiyaTopic>;
    if (!parsed.word || !parsed.realDefinition) return null;

    return {
      word: String(parsed.word).trim(),
      reading: parsed.reading ? String(parsed.reading).trim() : undefined,
      realDefinition: String(parsed.realDefinition).trim(),
      note: String(parsed.note || "LLMが選んだ辞書風のお題です。"),
      source: "llm",
    };
  } catch {
    return null;
  }
}

async function generateTopic(mode: Exclude<GameLlmMode, "local">) {
  const prompt = [
    "国語辞典を使ったパーティーゲーム『たほい屋』用のお題を1つ作ってください。",
    "日本語の実在語で、一般参加者が意味を知らなさそうだが、偽の語釈を作りやすい語を選んでください。",
    "専門的すぎる固有名詞、差別語、性的/残虐な語、現代人物名は避けてください。",
    "本物の辞書語釈として使える短い説明を付けてください。",
    "JSONのみで返してください: {\"word\":\"...\",\"reading\":\"...\",\"realDefinition\":\"...\",\"note\":\"...\"}",
  ].join("\n");

  const { text } = await generateGameLlmText(prompt, mode);
  return parseTopic(text);
}

export async function GET() {
  const mode = await resolveGameLlmMode();
  if (mode === "local") {
    return Response.json({ ...pickFallbackTopic(), notice: gameLlmFallbackNotice });
  }

  try {
    const topic = await generateTopic(mode);
    return Response.json(topic ?? pickFallbackTopic());
  } catch (error) {
    console.error("[tahoiya/topic] falling back to local topic", error);
    return Response.json({
      ...pickFallbackTopic(),
      notice: gameLlmFallbackNotice,
    });
  }
}

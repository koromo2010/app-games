import { parseLlmJson } from "./llm-json.ts";
import {
  tahoiyaDifficultyLabel,
  tahoiyaEffectiveZipfDescription,
} from "./tahoiya-difficulty.ts";
import type { TahoiyaDifficulty, TahoiyaTopic } from "./tahoiya-types.ts";

export type TahoiyaCatalogWordForGeneration = {
  word: string;
  reading?: string;
};

export type TahoiyaCatalogTopicGenerationResult =
  | { status: "accepted"; topic: TahoiyaTopic }
  | { status: "unsafe" }
  | { status: "invalid" };

function simplifyDefinition(value: unknown) {
  const text = String(value ?? "")
    .replace(/[（(][^）)]*[）)]/g, "")
    .replace(/^[^、。]{1,20}と読み、/, "")
    .replace(/\s+/g, " ")
    .trim();
  const firstSentence = text.split("。").map((part) => part.trim()).find(Boolean);
  return firstSentence ? `${firstSentence}。` : "";
}

export function parseTahoiyaCatalogTopicGeneration(
  text: string,
  candidate: TahoiyaCatalogWordForGeneration,
  difficulty: TahoiyaDifficulty,
): TahoiyaCatalogTopicGenerationResult {
  const parsed = parseLlmJson<{
    sensitive?: unknown;
    reading?: unknown;
    realDefinition?: unknown;
  }>(text);
  if (!parsed || typeof parsed.sensitive !== "boolean") return { status: "invalid" };
  if (parsed.sensitive) return { status: "unsafe" };

  const reading = String(candidate.reading || parsed.reading || "").trim();
  const realDefinition = simplifyDefinition(parsed.realDefinition);
  const definitionLength = Array.from(realDefinition.replace(/。$/, "")).length;
  if (!reading || definitionLength < 4 || definitionLength > 60) return { status: "invalid" };

  return {
    status: "accepted",
    topic: {
      word: candidate.word,
      reading,
      realDefinition,
      note: `${tahoiyaDifficultyLabel(difficulty)}の実質Zipf条件で共通単語DBから抽出。`,
      sourceDetail: `GAME FIELDS 共通単語DB（${tahoiyaEffectiveZipfDescription(difficulty)}）の見出し語にLLMで正解文を付与。`,
      source: "llm",
    },
  };
}

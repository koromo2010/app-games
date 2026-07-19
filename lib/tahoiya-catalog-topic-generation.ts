import { parseLlmJson } from "./llm-json.ts";
import {
  tahoiyaDifficultyCriterionDescription,
  tahoiyaDifficultyLabel,
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

const nondictionaryDefinitionPatterns = [
  /(?:です|ます|でした|ました|ません)。$/,
  /(?:広く|一般に|しばしば)(?:用いられ|使われ|知られ)/,
  /(?:歴史的な?|古い)?文献(?:にも?)?(?:登場|記載|記録)/,
  /(?:文献|記録)(?:にも?)?登場/,
];

export function isTahoiyaDictionaryStyleDefinition(value: string) {
  const definition = simplifyDefinition(value);
  return Boolean(definition) && !nondictionaryDefinitionPatterns.some((pattern) => pattern.test(definition));
}

export function parseTahoiyaCatalogTopicGeneration(
  text: string,
  candidate: TahoiyaCatalogWordForGeneration,
  difficulty: TahoiyaDifficulty,
  maximumLength = 60,
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
  if (
    !reading
    || definitionLength < 4
    || definitionLength > Math.max(4, Math.min(60, maximumLength))
    || !isTahoiyaDictionaryStyleDefinition(realDefinition)
  ) return { status: "invalid" };

  return {
    status: "accepted",
    topic: {
      word: candidate.word,
      reading,
      realDefinition,
      note: `${tahoiyaDifficultyLabel(difficulty)}の認知率先行審査を通過した共通単語DB候補。`,
      sourceDetail: `GAME FIELDS 共通単語DBの0以上3未満の実質Zipf候補を一括審査し、${tahoiyaDifficultyCriterionDescription(difficulty)}と判定された見出し語にLLMで正解文を付与。`,
      source: "llm",
    },
  };
}

export type TahoiyaDefinitionStyle =
  | "brief"
  | "standard"
  | "detailed"
  | "long"
  | "extended"
  | "maximum";

export type TahoiyaDefinitionMedianLength = 10 | 20 | 30 | 40 | 50;

export const tahoiyaDefinitionMedianLengthChoices: readonly TahoiyaDefinitionMedianLength[] = [10, 20, 30, 40, 50];

export function normalizeTahoiyaDefinitionMedianLength(value: unknown): TahoiyaDefinitionMedianLength {
  return tahoiyaDefinitionMedianLengthChoices.includes(value as TahoiyaDefinitionMedianLength)
    ? value as TahoiyaDefinitionMedianLength
    : 30;
}

export const tahoiyaDefinitionStyleRules: Record<
  TahoiyaDefinitionStyle,
  { min: number; max: number; instruction: string; contentInstruction: string }
> = {
  brief: {
    min: 6,
    max: 14,
    instruction: "6〜14文字の短く端的な説明",
    contentInstruction: "上位概念または核心的な性質を一つ含める",
  },
  standard: {
    min: 14,
    max: 25,
    instruction: "14〜25文字の標準的な説明",
    contentInstruction: "上位概念と、その語を区別する特徴を含める",
  },
  detailed: {
    min: 24,
    max: 38,
    instruction: "24〜38文字の詳しい辞書語釈",
    contentInstruction: "上位概念、識別特徴、対象・用途・成立条件のうち語義に必要な要素を含める",
  },
  long: {
    min: 32,
    max: 46,
    instruction: "32〜46文字の長めの辞書語釈",
    contentInstruction: "対象・性質・用途・成立条件から、正確に確認できる複数の識別要素を含める",
  },
  extended: {
    min: 40,
    max: 55,
    instruction: "40〜55文字の詳しい辞書語釈",
    contentInstruction: "上位概念に加え、似た概念と区別できる複数の性質や対象・用途・成立条件を含める",
  },
  maximum: {
    min: 48,
    max: 60,
    instruction: "48〜60文字の詳しい辞書語釈",
    contentInstruction: "語義を正確に限定する複数の性質・対象・用途・成立条件を、辞書語釈として自然につなぐ",
  },
};

export type TahoiyaDefinitionStyleWeight = Readonly<{
  style: TahoiyaDefinitionStyle;
  weight: number;
}>;

export const tahoiyaDefinitionStyleWeightsByMedian: Record<
  TahoiyaDefinitionMedianLength,
  ReadonlyArray<TahoiyaDefinitionStyleWeight>
> = {
  10: [
    { style: "brief", weight: 55 },
    { style: "standard", weight: 22 },
    { style: "detailed", weight: 12 },
    { style: "long", weight: 6 },
    { style: "extended", weight: 3 },
    { style: "maximum", weight: 2 },
  ],
  20: [
    { style: "brief", weight: 20 },
    { style: "standard", weight: 40 },
    { style: "detailed", weight: 20 },
    { style: "long", weight: 11 },
    { style: "extended", weight: 6 },
    { style: "maximum", weight: 3 },
  ],
  30: [
    { style: "brief", weight: 15 },
    { style: "standard", weight: 25 },
    { style: "detailed", weight: 30 },
    { style: "long", weight: 17 },
    { style: "extended", weight: 9 },
    { style: "maximum", weight: 4 },
  ],
  40: [
    { style: "brief", weight: 7 },
    { style: "standard", weight: 13 },
    { style: "detailed", weight: 25 },
    { style: "long", weight: 35 },
    { style: "extended", weight: 14 },
    { style: "maximum", weight: 6 },
  ],
  50: [
    { style: "brief", weight: 4 },
    { style: "standard", weight: 8 },
    { style: "detailed", weight: 16 },
    { style: "long", weight: 21 },
    { style: "extended", weight: 36 },
    { style: "maximum", weight: 15 },
  ],
};

export function tahoiyaDefinitionMedianLength() {
  return normalizeTahoiyaDefinitionMedianLength(
    runtimeHyperparameterNumber("tahoiya-definition-median", 30),
  );
}

export function pickTahoiyaDefinitionStyle(
  random = Math.random,
  medianLength = tahoiyaDefinitionMedianLength(),
): TahoiyaDefinitionStyle {
  const weights = tahoiyaDefinitionStyleWeightsByMedian[medianLength];
  const totalWeight = weights.reduce((sum, choice) => sum + choice.weight, 0);
  const normalizedRandom = Math.min(Math.max(random(), 0), 1 - Number.EPSILON);
  let roll = normalizedRandom * totalWeight;

  for (const choice of weights) {
    roll -= choice.weight;
    if (roll < 0) return choice.style;
  }

  return weights.at(-1)?.style ?? "detailed";
}
import { runtimeHyperparameterNumber } from "./runtime-hyperparameters-core.ts";

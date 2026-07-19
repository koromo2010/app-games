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
  { max: number; instruction: string }
> = {
  brief: { max: 14, instruction: "10文字程度の短く端的な説明" },
  standard: { max: 25, instruction: "20文字程度の標準的な説明" },
  detailed: { max: 38, instruction: "30文字程度を目安に、上位概念と固有の性質を含めた辞書語釈" },
  long: { max: 46, instruction: "40文字程度を上限の目安に、対象・性質・用途など語義に必要な要素だけで書く辞書語釈" },
  extended: { max: 55, instruction: "50文字程度を上限の目安に、語義を区別するために必要な要素だけで書く辞書語釈" },
  maximum: { max: 60, instruction: "60文字を上限に、語義に必要な情報だけで書く詳しい辞書語釈" },
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

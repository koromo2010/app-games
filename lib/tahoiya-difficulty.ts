import type { TahoiyaDifficulty } from "./tahoiya-types.ts";

const commonSpokenWords = new Set([
  "あめ", "いし", "かき", "かめ", "かみ", "かわ", "かえる", "きく", "くも", "さけ",
  "しろ", "つる", "はし", "はな", "ふく", "まつ", "みみ", "もち", "もも", "ゆき",
]);

export function hasVeryCommonSpokenHomophone(reading?: string) {
  if (!reading) return false;
  const normalized = reading.normalize("NFKC").trim().toLocaleLowerCase("ja");
  return commonSpokenWords.has(normalized);
}

export function tahoiyaDifficultyLabel(difficulty: TahoiyaDifficulty) {
  return difficulty === "extreme" ? "魔境" : "秘境";
}

export function tahoiyaDifficultyCriterionDescription(difficulty: TahoiyaDifficulty) {
  return difficulty === "extreme" ? "推定認知率 0〜1%" : "推定認知率 1%超〜14%";
}

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

export function tahoiyaEffectiveZipfDescription(difficulty: TahoiyaDifficulty) {
  return difficulty === "extreme" ? "実質Zipf = 0" : "0 < 実質Zipf < 3";
}

export function matchesTahoiyaEffectiveZipf(zipf: number | null, difficulty: TahoiyaDifficulty) {
  if (zipf === null || !Number.isFinite(zipf)) return false;
  return difficulty === "extreme" ? zipf === 0 : zipf > 0 && zipf < 3;
}

export function tahoiyaEffectiveZipfQuery(difficulty: TahoiyaDifficulty) {
  return difficulty === "extreme"
    ? { effectiveZipfEquals: 0 }
    : { effectiveZipfMinExclusive: 0, effectiveZipfMaxExclusive: 3 };
}

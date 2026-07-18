import { parseLlmJson } from "./llm-json.ts";
import type { TahoiyaDifficulty } from "./tahoiya-types.ts";

export type TahoiyaDifficultyVerdict = "known" | "borderline" | "ordinary-unknown" | "almost-nobody-knows";
export type TahoiyaDifficultyExclusionFlag = "sensitive" | "university" | "company" | "place";

export type TahoiyaDifficultyScreeningSource = {
  id: string;
  wordId: string;
  word: string;
};

export type TahoiyaDifficultyScreeningItem = {
  sourceId: string;
  wordId: string;
  word: string;
  verdict: TahoiyaDifficultyVerdict;
  exclusionFlags: TahoiyaDifficultyExclusionFlag[];
  estimatedRecognitionPercent: number;
  confidence: number;
  reason: string;
  accepted: boolean;
};

const verdicts = new Set<TahoiyaDifficultyVerdict>([
  "known",
  "borderline",
  "ordinary-unknown",
  "almost-nobody-knows",
]);
const exclusionFlags = new Set<TahoiyaDifficultyExclusionFlag>(["sensitive", "university", "company", "place"]);

export function tahoiyaDifficultyVerdictAccepted(
  verdict: TahoiyaDifficultyVerdict,
  flags: TahoiyaDifficultyExclusionFlag[],
  estimatedRecognitionPercent: number,
  difficulty: TahoiyaDifficulty,
) {
  if (flags.length > 0) return false;
  if (difficulty === "extreme") return verdict === "almost-nobody-knows" && estimatedRecognitionPercent <= 1;
  return verdict === "ordinary-unknown" && estimatedRecognitionPercent > 1 && estimatedRecognitionPercent < 15;
}

function recognitionMatchesVerdict(verdict: TahoiyaDifficultyVerdict, percent: number) {
  if (verdict === "known") return percent >= 30;
  if (verdict === "borderline") return percent >= 15 && percent < 30;
  if (verdict === "ordinary-unknown") return percent > 1 && percent < 15;
  return percent <= 1;
}

export function parseTahoiyaDifficultyScreening(
  value: unknown,
  sources: TahoiyaDifficultyScreeningSource[],
  difficulty: TahoiyaDifficulty,
): TahoiyaDifficultyScreeningItem[] {
  const parsed = parseLlmJson<{ items?: unknown[] }>(value);
  if (!parsed || !Array.isArray(parsed.items) || parsed.items.length !== sources.length) return [];
  const sourceById = new Map(sources.map((source) => [source.id, source]));
  const items = new Map<string, TahoiyaDifficultyScreeningItem>();
  for (const raw of parsed.items) {
    if (!raw || typeof raw !== "object") return [];
    const input = raw as Record<string, unknown>;
    const sourceId = typeof input.sourceId === "string" ? input.sourceId : "";
    const source = sourceById.get(sourceId);
    const verdict = typeof input.verdict === "string" && verdicts.has(input.verdict as TahoiyaDifficultyVerdict)
      ? input.verdict as TahoiyaDifficultyVerdict
      : null;
    const rawExclusionFlags = Array.isArray(input.exclusionFlags) ? input.exclusionFlags : null;
    const itemExclusionFlags = rawExclusionFlags?.every((flag) => typeof flag === "string" && exclusionFlags.has(flag as TahoiyaDifficultyExclusionFlag))
      ? [...new Set(rawExclusionFlags as TahoiyaDifficultyExclusionFlag[])]
      : null;
    const estimatedRecognitionPercent = typeof input.estimatedRecognitionPercent === "number" && Number.isFinite(input.estimatedRecognitionPercent)
      ? Math.round(input.estimatedRecognitionPercent * 10) / 10
      : -1;
    const confidence = typeof input.confidence === "number" && Number.isFinite(input.confidence)
      ? Math.round(input.confidence)
      : -1;
    const reason = typeof input.reason === "string" ? input.reason.replace(/\s+/g, " ").trim().slice(0, 180) : "";
    if (!source || !verdict || !itemExclusionFlags || items.has(sourceId) || estimatedRecognitionPercent < 0 || estimatedRecognitionPercent > 100 || !recognitionMatchesVerdict(verdict, estimatedRecognitionPercent) || confidence < 0 || confidence > 100 || !reason) return [];
    items.set(sourceId, {
      sourceId,
      wordId: source.wordId,
      word: source.word,
      verdict,
      exclusionFlags: itemExclusionFlags,
      estimatedRecognitionPercent,
      confidence,
      reason,
      accepted: tahoiyaDifficultyVerdictAccepted(verdict, itemExclusionFlags, estimatedRecognitionPercent, difficulty),
    });
  }
  return sources.map((source) => items.get(source.id)).filter((item): item is TahoiyaDifficultyScreeningItem => Boolean(item));
}

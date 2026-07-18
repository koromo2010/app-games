import { parseLlmJson } from "./llm-json.ts";
import type { TahoiyaDifficulty } from "./tahoiya-types.ts";

export type TahoiyaDifficultyVerdict = "known" | "borderline" | "ordinary-unknown" | "almost-nobody-knows";

export type TahoiyaDifficultyScreeningSource = {
  id: string;
  word: string;
};

export type TahoiyaDifficultyScreeningItem = {
  sourceId: string;
  word: string;
  verdict: TahoiyaDifficultyVerdict;
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

export function tahoiyaDifficultyVerdictAccepted(verdict: TahoiyaDifficultyVerdict, difficulty: TahoiyaDifficulty) {
  return difficulty === "extreme" ? verdict === "almost-nobody-knows" : verdict === "ordinary-unknown";
}

function recognitionMatchesVerdict(verdict: TahoiyaDifficultyVerdict, percent: number) {
  if (verdict === "known") return percent >= 30;
  if (verdict === "borderline") return percent >= 15 && percent < 30;
  if (verdict === "ordinary-unknown") return percent >= 3 && percent < 15;
  return percent < 3;
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
    const estimatedRecognitionPercent = typeof input.estimatedRecognitionPercent === "number" && Number.isFinite(input.estimatedRecognitionPercent)
      ? Math.round(input.estimatedRecognitionPercent)
      : -1;
    const confidence = typeof input.confidence === "number" && Number.isFinite(input.confidence)
      ? Math.round(input.confidence)
      : -1;
    const reason = typeof input.reason === "string" ? input.reason.replace(/\s+/g, " ").trim().slice(0, 180) : "";
    if (!source || !verdict || items.has(sourceId) || estimatedRecognitionPercent < 0 || estimatedRecognitionPercent > 100 || !recognitionMatchesVerdict(verdict, estimatedRecognitionPercent) || confidence < 0 || confidence > 100 || !reason) return [];
    items.set(sourceId, {
      sourceId,
      word: source.word,
      verdict,
      estimatedRecognitionPercent,
      confidence,
      reason,
      accepted: tahoiyaDifficultyVerdictAccepted(verdict, difficulty),
    });
  }
  return sources.map((source) => items.get(source.id)).filter((item): item is TahoiyaDifficultyScreeningItem => Boolean(item));
}

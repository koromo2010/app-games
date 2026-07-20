import { parseLlmJson, stripLlmCodeFence } from "./llm-json.ts";
import type { TahoiyaDifficulty } from "./tahoiya-types.ts";

export type TahoiyaDifficultyVerdict = "known" | "borderline" | "ordinary-unknown" | "almost-nobody-knows";
export type TahoiyaDifficultyExclusionFlag = "sensitive" | "university" | "company" | "place";
export type TahoiyaDifficultyScreeningClassification = TahoiyaDifficulty | "rejected";

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
  difficulty: TahoiyaDifficultyScreeningClassification;
  accepted: boolean;
};

const exclusionFlags = new Set<TahoiyaDifficultyExclusionFlag>(["sensitive", "university", "company", "place"]);
const exclusionFlagAliases = new Map<string, TahoiyaDifficultyExclusionFlag>([
  ["sensitive", "sensitive"],
  ["センシティブ", "sensitive"],
  ["不適切", "sensitive"],
  ["university", "university"],
  ["大学", "university"],
  ["大学名", "university"],
  ["company", "company"],
  ["企業", "company"],
  ["企業名", "company"],
  ["法人", "company"],
  ["place", "place"],
  ["地名", "place"],
  ["地域", "place"],
]);

function parseScreeningEnvelope(value: unknown): unknown[] | null {
  let parsed = parseLlmJson<unknown>(value);
  if (!parsed && typeof value === "string") {
    const text = stripLlmCodeFence(value);
    const objectStart = text.indexOf("{");
    const objectEnd = text.lastIndexOf("}");
    const arrayStart = text.indexOf("[");
    const arrayEnd = text.lastIndexOf("]");
    const candidates = [
      objectStart >= 0 && objectEnd > objectStart ? text.slice(objectStart, objectEnd + 1) : "",
      arrayStart >= 0 && arrayEnd > arrayStart ? text.slice(arrayStart, arrayEnd + 1) : "",
    ].filter(Boolean);
    for (const candidate of candidates) {
      parsed = parseLlmJson<unknown>(candidate);
      if (parsed) break;
    }
  }
  if (Array.isArray(parsed)) return parsed;
  if (!parsed || typeof parsed !== "object") return null;
  const envelope = parsed as Record<string, unknown>;
  const items = envelope.items ?? envelope.results ?? envelope.screening;
  return Array.isArray(items) ? items : null;
}

function firstDefined(input: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    if (input[key] !== undefined) return input[key];
  }
  return undefined;
}

function parsePercent(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const normalized = value.normalize("NFKC").trim().replace(/%$/, "").trim();
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseConfidence(value: unknown) {
  const parsed = parsePercent(value);
  if (parsed === null) return 50;
  const normalized = parsed > 0 && parsed < 1 ? parsed * 100 : parsed;
  return Math.round(normalized);
}

function parseExclusionFlags(value: unknown): TahoiyaDifficultyExclusionFlag[] | null {
  if (value === null) return [];
  const rawFlags = Array.isArray(value) ? value : typeof value === "string" ? [value] : null;
  if (!rawFlags) return null;
  const result: TahoiyaDifficultyExclusionFlag[] = [];
  for (const rawFlag of rawFlags) {
    if (typeof rawFlag !== "string") return null;
    const normalized = rawFlag.normalize("NFKC").trim().toLowerCase();
    if (!normalized || normalized === "none" || normalized === "なし" || normalized === "該当なし") continue;
    const flag = exclusionFlags.has(normalized as TahoiyaDifficultyExclusionFlag)
      ? normalized as TahoiyaDifficultyExclusionFlag
      : exclusionFlagAliases.get(normalized);
    if (!flag) return null;
    result.push(flag);
  }
  return [...new Set(result)];
}

export function classifyTahoiyaDifficultyScreening(
  flags: TahoiyaDifficultyExclusionFlag[],
  estimatedRecognitionPercent: number,
): TahoiyaDifficultyScreeningClassification {
  if (flags.length > 0 || estimatedRecognitionPercent >= 15) return "rejected";
  return estimatedRecognitionPercent <= 1 ? "extreme" : "standard";
}

export function tahoiyaDifficultyVerdictAccepted(
  verdict: TahoiyaDifficultyVerdict,
  flags: TahoiyaDifficultyExclusionFlag[],
  estimatedRecognitionPercent: number,
  difficulty: TahoiyaDifficulty,
) {
  const classification = classifyTahoiyaDifficultyScreening(flags, estimatedRecognitionPercent);
  if (classification !== difficulty) return false;
  return difficulty === "extreme" ? verdict === "almost-nobody-knows" : verdict === "ordinary-unknown";
}

function verdictForRecognition(percent: number): TahoiyaDifficultyVerdict {
  if (percent >= 30) return "known";
  if (percent >= 15) return "borderline";
  if (percent > 1) return "ordinary-unknown";
  return "almost-nobody-knows";
}

export function parseTahoiyaDifficultyScreening(
  value: unknown,
  sources: TahoiyaDifficultyScreeningSource[],
  difficulty: TahoiyaDifficulty,
): TahoiyaDifficultyScreeningItem[] {
  const rawItems = parseScreeningEnvelope(value);
  if (!rawItems || rawItems.length !== sources.length) return [];
  const sourceById = new Map(sources.map((source) => [source.id, source]));
  const items = new Map<string, TahoiyaDifficultyScreeningItem>();
  const claimedSourceIds = new Set<string>();
  const resolvedSources = rawItems.map((raw, index) => {
    if (!raw || typeof raw !== "object") return null;
    const input = raw as Record<string, unknown>;
    const rawSourceId = firstDefined(input, ["sourceId", "source_id", "id"]);
    const sourceId = typeof rawSourceId === "string" ? rawSourceId.normalize("NFKC").trim() : "";
    const exactSource = sourceById.get(sourceId);
    if (exactSource) {
      if (claimedSourceIds.has(exactSource.id)) return null;
      claimedSourceIds.add(exactSource.id);
      return exactSource;
    }
    return { unresolvedIndex: index } as const;
  });
  if (resolvedSources.some((source) => source === null)) return [];
  for (let index = 0; index < resolvedSources.length; index += 1) {
    const resolved = resolvedSources[index];
    if (resolved && "unresolvedIndex" in resolved) {
      const positionalSource = sources[resolved.unresolvedIndex];
      if (!positionalSource || claimedSourceIds.has(positionalSource.id)) return [];
      claimedSourceIds.add(positionalSource.id);
      resolvedSources[index] = positionalSource;
    }
  }
  if (claimedSourceIds.size !== sources.length) return [];

  for (let index = 0; index < rawItems.length; index += 1) {
    const raw = rawItems[index];
    if (!raw || typeof raw !== "object") return [];
    const input = raw as Record<string, unknown>;
    const source = resolvedSources[index];
    if (!source || "unresolvedIndex" in source) return [];
    const itemExclusionFlags = parseExclusionFlags(firstDefined(input, ["exclusionFlags", "exclusion_flags", "flags"]));
    const rawRecognitionPercent = parsePercent(firstDefined(input, [
      "estimatedRecognitionPercent",
      "estimated_recognition_percent",
      "recognitionPercent",
      "recognition_percent",
    ]));
    const estimatedRecognitionPercent = rawRecognitionPercent === null ? -1 : Math.round(rawRecognitionPercent * 10) / 10;
    const confidence = parseConfidence(firstDefined(input, ["confidence", "confidencePercent", "confidence_percent"]));
    const rawReason = firstDefined(input, ["reason", "rationale", "note"]);
    const reason = typeof rawReason === "string" && rawReason.trim()
      ? rawReason.replace(/\s+/g, " ").trim().slice(0, 180)
      : "一般成人の推定認知率に基づくAI判定。";
    if (!itemExclusionFlags || items.has(source.id) || estimatedRecognitionPercent < 0 || estimatedRecognitionPercent > 100 || confidence < 0 || confidence > 100) return [];
    const normalizedVerdict = verdictForRecognition(estimatedRecognitionPercent);
    items.set(source.id, {
      sourceId: source.id,
      wordId: source.wordId,
      word: source.word,
      verdict: normalizedVerdict,
      exclusionFlags: itemExclusionFlags,
      estimatedRecognitionPercent,
      confidence,
      reason,
      difficulty: classifyTahoiyaDifficultyScreening(itemExclusionFlags, estimatedRecognitionPercent),
      accepted: tahoiyaDifficultyVerdictAccepted(normalizedVerdict, itemExclusionFlags, estimatedRecognitionPercent, difficulty),
    });
  }
  return sources.map((source) => items.get(source.id)).filter((item): item is TahoiyaDifficultyScreeningItem => Boolean(item));
}

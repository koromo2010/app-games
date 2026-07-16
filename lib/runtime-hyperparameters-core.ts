export type RuntimeHyperparameterDefinition = {
  id: string;
  defaultValue: number;
  minimum: number;
  maximum: number;
  step: number;
  unit: string;
  applyMode: "immediate" | "next-game";
  environmentName?: string;
};

export const runtimeHyperparameterDefinitions = [
  { id: "common-timeout-grace", defaultValue: 5000, minimum: 0, maximum: 10000, step: 100, unit: "ms", applyMode: "immediate", environmentName: "GAME_TIMEOUT_GRACE_MS" },
  { id: "common-replay-retention", defaultValue: 30, minimum: 1, maximum: 3650, step: 1, unit: "日", applyMode: "immediate", environmentName: "GAME_REPLAY_RETENTION_DAYS" },
  { id: "common-replay-favorites", defaultValue: 10, minimum: 1, maximum: 100, step: 1, unit: "件", applyMode: "immediate", environmentName: "GAME_REPLAY_FAVORITE_LIMIT" },
  { id: "common-storage-alert", defaultValue: 80, minimum: 1, maximum: 100, step: 1, unit: "%", applyMode: "immediate", environmentName: "STORAGE_ALERT_THRESHOLD_PERCENT" },
  { id: "wordwolf-pair-cooldown", defaultValue: 30, minimum: 1, maximum: 3650, step: 1, unit: "日", applyMode: "immediate", environmentName: "WORDWOLF_PAIR_COOLDOWN_DAYS" },
  { id: "tahoiya-correct-points", defaultValue: 1, minimum: 0, maximum: 10, step: 1, unit: "点/票", applyMode: "next-game" },
  { id: "tahoiya-fooled-points", defaultValue: 1, minimum: 0, maximum: 10, step: 1, unit: "点/票", applyMode: "next-game" },
  { id: "northern-hand", defaultValue: 7, minimum: 3, maximum: 12, step: 1, unit: "枚", applyMode: "next-game" },
  { id: "northern-victory", defaultValue: 10, minimum: 5, maximum: 30, step: 1, unit: "点", applyMode: "next-game" },
  { id: "northern-market", defaultValue: 5, minimum: 3, maximum: 10, step: 1, unit: "枚", applyMode: "next-game" },
  { id: "scale-score-perfect", defaultValue: 3, minimum: 0, maximum: 10, step: 1, unit: "点", applyMode: "next-game" },
  { id: "scale-score-one", defaultValue: 2, minimum: 0, maximum: 10, step: 1, unit: "点", applyMode: "next-game" },
  { id: "scale-score-few", defaultValue: 1, minimum: 0, maximum: 10, step: 1, unit: "点", applyMode: "next-game" },
  { id: "scale-score-few-max", defaultValue: 3, minimum: 2, maximum: 20, step: 1, unit: "組", applyMode: "next-game" },
  { id: "code-points", defaultValue: 5, minimum: 1, maximum: 30, step: 1, unit: "点", applyMode: "next-game" },
  { id: "code-miss", defaultValue: 1, minimum: 0, maximum: 10, step: 1, unit: "点", applyMode: "next-game" },
  { id: "code-intercept", defaultValue: 2, minimum: 0, maximum: 10, step: 1, unit: "点", applyMode: "next-game" },
  { id: "code-start", defaultValue: 2, minimum: 1, maximum: 10, step: 1, unit: "ラウンド", applyMode: "next-game" },
] as const satisfies readonly RuntimeHyperparameterDefinition[];

export type RuntimeHyperparameterId = (typeof runtimeHyperparameterDefinitions)[number]["id"];
export type RuntimeHyperparameterOverrides = Partial<Record<RuntimeHyperparameterId, number>>;

const definitionById = new Map<string, RuntimeHyperparameterDefinition>(runtimeHyperparameterDefinitions.map((definition) => [definition.id, definition]));
let installedOverrides: RuntimeHyperparameterOverrides = {};

export function runtimeHyperparameterDefinition(id: string) {
  return definitionById.get(id) ?? null;
}

function boundedInteger(value: unknown, definition: RuntimeHyperparameterDefinition) {
  if (typeof value !== "number" || !Number.isFinite(value) || !Number.isInteger(value)) return null;
  if (value < definition.minimum || value > definition.maximum) return null;
  if ((value - definition.minimum) % definition.step !== 0) return null;
  return value;
}

export function normalizeRuntimeHyperparameterOverrides(value: unknown): RuntimeHyperparameterOverrides {
  if (!value || typeof value !== "object") return {};
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).flatMap(([id, candidate]) => {
    const definition = runtimeHyperparameterDefinition(id);
    const normalized = definition ? boundedInteger(candidate, definition) : null;
    return normalized === null ? [] : [[id, normalized]];
  })) as RuntimeHyperparameterOverrides;
}

export function validateRuntimeHyperparameterPatch(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { ok: false as const, error: "INVALID_HYPERPARAMETER_VALUES" };
  const changes: Partial<Record<RuntimeHyperparameterId, number | null>> = {};
  for (const [id, candidate] of Object.entries(value as Record<string, unknown>)) {
    const definition = runtimeHyperparameterDefinition(id);
    if (!definition) return { ok: false as const, error: "UNKNOWN_HYPERPARAMETER" };
    if (candidate === null) { changes[id as RuntimeHyperparameterId] = null; continue; }
    const normalized = boundedInteger(candidate, definition);
    if (normalized === null) return { ok: false as const, error: "INVALID_HYPERPARAMETER_VALUE" };
    changes[id as RuntimeHyperparameterId] = normalized;
  }
  return Object.keys(changes).length ? { ok: true as const, changes } : { ok: false as const, error: "NO_HYPERPARAMETER_CHANGES" };
}

export function installRuntimeHyperparameterOverrides(value: unknown) {
  installedOverrides = normalizeRuntimeHyperparameterOverrides(value);
  return { ...installedOverrides };
}

export function runtimeHyperparameterOverride(id: string) {
  return installedOverrides[id as RuntimeHyperparameterId] ?? null;
}

export function runtimeHyperparameterNumber(id: RuntimeHyperparameterId, fallback?: number) {
  const definition = runtimeHyperparameterDefinition(id)!;
  return runtimeHyperparameterOverride(id) ?? fallback ?? definition.defaultValue;
}

export function runtimeHyperparameterBaseValue(definition: RuntimeHyperparameterDefinition, environment: Record<string, string | undefined> = process.env) {
  const configured = definition.environmentName ? Number(environment[definition.environmentName]) : Number.NaN;
  return Number.isInteger(configured) && configured >= definition.minimum && configured <= definition.maximum ? configured : definition.defaultValue;
}

export function runtimeHyperparameterEffectiveValue(id: RuntimeHyperparameterId, environment: Record<string, string | undefined> = process.env) {
  const definition = runtimeHyperparameterDefinition(id)!;
  return runtimeHyperparameterOverride(id) ?? runtimeHyperparameterBaseValue(definition, environment);
}

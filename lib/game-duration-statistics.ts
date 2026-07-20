export const gameDurationGameIds = [
  "wordwolf",
  "tahoiya",
  "northern-branch",
  "hodoai",
  "kotoba-senpuku",
  "nigoichi",
  "code-intercept",
  "daifugo",
] as const;

export type GameDurationGameId = typeof gameDurationGameIds[number];

export type GameDurationEstimate = {
  sampleCount: number;
  medianSeconds: number;
  lowerSeconds: number;
  upperSeconds: number;
  label: string;
};

export const gameDurationStatisticsPolicy = {
  minimumSamples: 5,
  rangeSamples: 20,
  recentSampleLimit: 300,
  minimumDurationSeconds: 30,
  maximumDurationSeconds: 4 * 60 * 60,
} as const;

export function isGameDurationGameId(value: unknown): value is GameDurationGameId {
  return typeof value === "string" && gameDurationGameIds.includes(value as GameDurationGameId);
}

export function isValidGameDurationSeconds(value: unknown): value is number {
  return typeof value === "number"
    && Number.isFinite(value)
    && value >= gameDurationStatisticsPolicy.minimumDurationSeconds
    && value <= gameDurationStatisticsPolicy.maximumDurationSeconds;
}

function percentile(sorted: number[], ratio: number) {
  if (sorted.length === 1) return sorted[0];
  const position = (sorted.length - 1) * ratio;
  const lowerIndex = Math.floor(position);
  const upperIndex = Math.ceil(position);
  const weight = position - lowerIndex;
  return sorted[lowerIndex] + (sorted[upperIndex] - sorted[lowerIndex]) * weight;
}

function roundedMinutes(seconds: number, direction: "nearest" | "down" | "up") {
  const minutes = seconds / 60;
  const step = minutes < 10 ? 1 : 5;
  const operation = direction === "down" ? Math.floor : direction === "up" ? Math.ceil : Math.round;
  return Math.max(1, operation(minutes / step) * step);
}

export function estimateGameDuration(durations: number[]): GameDurationEstimate | null {
  const sorted = durations
    .slice(-gameDurationStatisticsPolicy.recentSampleLimit)
    .filter(isValidGameDurationSeconds)
    .sort((left, right) => left - right);
  if (sorted.length < gameDurationStatisticsPolicy.minimumSamples) return null;

  const medianSeconds = percentile(sorted, 0.5);
  const lowerSeconds = percentile(sorted, 0.25);
  const upperSeconds = percentile(sorted, 0.75);
  const medianMinutes = roundedMinutes(medianSeconds, "nearest");
  const lowerMinutes = roundedMinutes(lowerSeconds, "down");
  const upperMinutes = roundedMinutes(upperSeconds, "up");
  const showRange = sorted.length >= gameDurationStatisticsPolicy.rangeSamples && lowerMinutes < upperMinutes;

  return {
    sampleCount: sorted.length,
    medianSeconds,
    lowerSeconds,
    upperSeconds,
    label: showRange ? `${lowerMinutes}〜${upperMinutes}分` : `約${medianMinutes}分`,
  };
}

export function gameDurationVariantKey(values: Record<string, string | number | boolean | null | undefined>) {
  return Object.entries(values)
    .filter((entry): entry is [string, string | number | boolean | null] => entry[1] !== undefined)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value === null ? "none" : String(value)}`)
    .join(";")
    .slice(0, 300);
}

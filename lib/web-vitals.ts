export const webVitalNames = ["LCP", "INP", "CLS"] as const;
export const webVitalsSessionSampleRate = 0.5;
export type WebVitalName = typeof webVitalNames[number];
export type WebVitalRating = "good" | "needs-improvement" | "poor";
export type WebVitalDevice = "mobile" | "desktop";

export type WebVitalSample = {
  id: string;
  name: WebVitalName;
  value: number;
  rating: WebVitalRating;
  path: string;
  device: WebVitalDevice;
  occurredAt: number;
};

export type WebVitalSummary = {
  name: WebVitalName;
  count: number;
  p75: number | null;
  ratings: Record<WebVitalRating, number>;
  devices: Record<WebVitalDevice, number>;
};

export const webVitalThresholds: Record<WebVitalName, { good: number; poor: number; unit: "ms" | "score" }> = {
  LCP: { good: 2_500, poor: 4_000, unit: "ms" },
  INP: { good: 200, poor: 500, unit: "ms" },
  CLS: { good: 0.1, poor: 0.25, unit: "score" },
};

export function selectWebVitalsSession(randomValue: number) {
  return Number.isFinite(randomValue) && randomValue >= 0 && randomValue < webVitalsSessionSampleRate;
}

export function normalizeWebVitalInput(value: unknown): Omit<WebVitalSample, "id" | "occurredAt"> | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  if (!webVitalNames.includes(input.name as WebVitalName)) return null;
  if (typeof input.value !== "number" || !Number.isFinite(input.value) || input.value < 0 || input.value > 1_000_000) return null;
  if (input.rating !== "good" && input.rating !== "needs-improvement" && input.rating !== "poor") return null;
  const path = typeof input.path === "string" && /^\/[a-zA-Z0-9/_-]*$/.test(input.path) ? input.path.slice(0, 160) : "/";
  const device = input.device === "mobile" ? "mobile" : "desktop";
  return { name: input.name as WebVitalName, value: input.value, rating: input.rating, path, device };
}

export function summarizeWebVitals(samples: WebVitalSample[]): WebVitalSummary[] {
  return webVitalNames.map((name) => {
    const matching = samples.filter((sample) => sample.name === name).sort((left, right) => left.value - right.value);
    const p75Index = matching.length ? Math.max(0, Math.ceil(matching.length * 0.75) - 1) : -1;
    return {
      name,
      count: matching.length,
      p75: p75Index >= 0 ? matching[p75Index]!.value : null,
      ratings: {
        good: matching.filter((sample) => sample.rating === "good").length,
        "needs-improvement": matching.filter((sample) => sample.rating === "needs-improvement").length,
        poor: matching.filter((sample) => sample.rating === "poor").length,
      },
      devices: {
        mobile: matching.filter((sample) => sample.device === "mobile").length,
        desktop: matching.filter((sample) => sample.device === "desktop").length,
      },
    };
  });
}

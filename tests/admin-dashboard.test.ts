import assert from "node:assert/strict";
import test from "node:test";
import { normalizeWebVitalInput, summarizeWebVitals, type WebVitalSample } from "../lib/web-vitals.ts";

test("web vital input accepts only the supported anonymous fields", () => {
  assert.deepEqual(normalizeWebVitalInput({ name: "LCP", value: 1200, rating: "good", path: "/games", device: "mobile", playerId: "secret" }), {
    name: "LCP", value: 1200, rating: "good", path: "/games", device: "mobile",
  });
  assert.equal(normalizeWebVitalInput({ name: "FID", value: 12, rating: "good" }), null);
  assert.equal(normalizeWebVitalInput({ name: "CLS", value: -1, rating: "poor" }), null);
  assert.equal(normalizeWebVitalInput({ name: "INP", value: 10, rating: "unknown" }), null);
});

test("web vital summaries calculate the p75 and rating totals", () => {
  const samples: WebVitalSample[] = [100, 200, 300, 900].map((value, index) => ({
    id: String(index), name: "INP", value, rating: value <= 200 ? "good" : value <= 500 ? "needs-improvement" : "poor", path: "/games", device: index % 2 ? "desktop" : "mobile", occurredAt: index,
  }));
  const inp = summarizeWebVitals(samples).find((summary) => summary.name === "INP");
  assert.equal(inp?.p75, 300);
  assert.deepEqual(inp?.ratings, { good: 2, "needs-improvement": 1, poor: 1 });
  assert.deepEqual(inp?.devices, { mobile: 2, desktop: 2 });
});

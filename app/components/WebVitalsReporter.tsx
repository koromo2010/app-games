"use client";

import { useReportWebVitals } from "next/web-vitals";
import { selectWebVitalsSession, webVitalNames } from "@/lib/web-vitals";

const sampleStorageKey = "game-fields:web-vitals-sample:v1";
let sampledSession: boolean | undefined;

function shouldReportThisSession() {
  if (sampledSession !== undefined) return sampledSession;
  try {
    const stored = window.sessionStorage.getItem(sampleStorageKey);
    if (stored === "1" || stored === "0") sampledSession = stored === "1";
    else {
      sampledSession = selectWebVitalsSession(Math.random());
      window.sessionStorage.setItem(sampleStorageKey, sampledSession ? "1" : "0");
    }
  } catch {
    sampledSession = selectWebVitalsSession(Math.random());
  }
  return sampledSession;
}

export function WebVitalsReporter() {
  useReportWebVitals((metric) => {
    if (!shouldReportThisSession()) return;
    if (!webVitalNames.includes(metric.name as typeof webVitalNames[number])) return;
    const payload = JSON.stringify({
      name: metric.name,
      value: metric.value,
      rating: metric.rating,
      path: window.location.pathname,
      device: window.matchMedia("(max-width: 767px)").matches ? "mobile" : "desktop",
    });
    if (navigator.sendBeacon && navigator.sendBeacon("/api/web-vitals", new Blob([payload], { type: "application/json" }))) return;
    void fetch("/api/web-vitals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
      keepalive: true,
    }).catch(() => undefined);
  });
  return null;
}

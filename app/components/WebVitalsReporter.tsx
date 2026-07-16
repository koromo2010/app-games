"use client";

import { useReportWebVitals } from "next/web-vitals";
import { webVitalNames } from "@/lib/web-vitals";

export function WebVitalsReporter() {
  useReportWebVitals((metric) => {
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

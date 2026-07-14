"use client";

import { useEffect, useState } from "react";
import type { Phase } from "@/lib/wordwolf-game-types";

export function getWordWolfPhaseLimitSeconds(phase: Phase, configuredSeconds: number) {
  if (configuredSeconds <= 0) return 0;
  if (phase === "clue") return configuredSeconds;
  if (phase === "vote" || phase === "wolfGuess") return configuredSeconds * 2;
  return 0;
}

export function useWordWolfPhaseClock(input: { phase?: Phase; configuredSeconds: number; startedAt?: number | null; limitSecondsOverride?: number }) {
  const [now, setNow] = useState(() => Date.now());
  const limitSeconds = input.limitSecondsOverride ?? (input.phase ? getWordWolfPhaseLimitSeconds(input.phase, input.configuredSeconds) : 0);
  useEffect(() => {
    if (!input.startedAt || limitSeconds <= 0) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [input.startedAt, limitSeconds]);
  const secondsLeft = input.startedAt && limitSeconds > 0
    ? Math.max(0, limitSeconds - Math.floor((now - input.startedAt) / 1000))
    : null;
  return { secondsLeft };
}

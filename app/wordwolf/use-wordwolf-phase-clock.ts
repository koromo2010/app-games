"use client";

import { useGameplayActionWindow } from "@/app/hooks/use-gameplay-action-window";
import { wordWolfTimeoutGraceMs } from "@/lib/wordwolf-command-domain";
import type { Phase } from "@/lib/wordwolf-game-types";

export function getWordWolfPhaseLimitSeconds(phase: Phase, configuredSeconds: number) {
  if (configuredSeconds <= 0) return 0;
  if (phase === "clue") return configuredSeconds;
  if (phase === "vote" || phase === "wolfGuess") return configuredSeconds * 2;
  return 0;
}

export function useWordWolfPhaseClock(input: {
  roomCode?: string;
  generation?: string | number;
  phase?: Phase;
  configuredSeconds: number;
  startedAt?: number | null;
  limitSecondsOverride?: number;
}) {
  const limitSeconds = input.limitSecondsOverride ?? (input.phase ? getWordWolfPhaseLimitSeconds(input.phase, input.configuredSeconds) : 0);
  const deadlineAt = input.startedAt && limitSeconds > 0
    ? input.startedAt + limitSeconds * 1_000
    : null;
  const actionWindow = useGameplayActionWindow({
    plan: input.roomCode && input.phase && input.generation !== undefined
      ? {
          scope: {
            roomCode: input.roomCode,
            generation: input.generation,
            phase: input.phase,
          },
          countdownDeadlineAt: deadlineAt,
          serverDeadlineAt: deadlineAt === null ? null : deadlineAt + wordWolfTimeoutGraceMs(),
        }
      : null,
  });
  return { secondsLeft: actionWindow.remainingSeconds, actionWindow };
}

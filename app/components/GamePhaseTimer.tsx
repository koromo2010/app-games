"use client";

import { useGameplayActionWindow } from "@/app/hooks/use-gameplay-action-window";
import type { GameplayActionWindowScope } from "@/lib/gameplay-action-window";
import { useAppLocale } from "./AppLocaleProvider";

type GamePhaseTimerProps = {
  durationSeconds: number;
  startedAt: number;
  label: string;
  scope: GameplayActionWindowScope;
  serverDeadlineAt?: number;
};

export function GamePhaseTimer({ durationSeconds, startedAt, label, scope, serverDeadlineAt }: GamePhaseTimerProps) {
  const { t } = useAppLocale();
  const deadlineAt = durationSeconds > 0 ? startedAt + durationSeconds * 1_000 : null;
  const actionWindow = useGameplayActionWindow({
    plan: {
      scope,
      countdownDeadlineAt: deadlineAt,
      serverDeadlineAt: serverDeadlineAt ?? deadlineAt,
    },
  });

  if (durationSeconds === 0) return null;
  const remaining = actionWindow.remainingSeconds;
  const syncing = actionWindow.state === "UNCERTAIN";

  return (
    <div className={`rounded-lg border px-3 py-2 text-sm font-black ${remaining === 0 && !syncing ? "border-rose-300/50 bg-rose-300/15 text-rose-100" : "border-cyan-300/30 bg-cyan-300/10 text-cyan-100"}`} role="timer" aria-live="polite" data-action-window-state={actionWindow.state}>
      {syncing || remaining === null
        ? t("game.timeSyncing", { label })
        : remaining === 0
          ? t("game.timeExpired", { label })
          : t("game.timeRemaining", { label, seconds: remaining })}
    </div>
  );
}

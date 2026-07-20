"use client";

import { useEffect, useState } from "react";
import { synchronizedNow } from "@/lib/server-clock";
import { useAppLocale } from "./AppLocaleProvider";

type GamePhaseTimerProps = {
  durationSeconds: number;
  startedAt: number;
  label: string;
};

function remainingSeconds(durationSeconds: number, startedAt: number) {
  const elapsed = Math.floor((synchronizedNow() - startedAt) / 1000);
  return Math.max(0, durationSeconds - elapsed);
}

export function GamePhaseTimer({ durationSeconds, startedAt, label }: GamePhaseTimerProps) {
  const { t } = useAppLocale();
  const [remaining, setRemaining] = useState(() => remainingSeconds(durationSeconds, startedAt));

  useEffect(() => {
    if (durationSeconds === 0 || remaining === 0) return;
    const timer = window.setInterval(() => {
      setRemaining(remainingSeconds(durationSeconds, startedAt));
    }, 250);
    return () => window.clearInterval(timer);
  }, [durationSeconds, remaining, startedAt]);

  if (durationSeconds === 0) return null;

  return (
    <div className={`rounded-lg border px-3 py-2 text-sm font-black ${remaining === 0 ? "border-rose-300/50 bg-rose-300/15 text-rose-100" : "border-cyan-300/30 bg-cyan-300/10 text-cyan-100"}`} role="timer" aria-live="polite">
      {remaining === 0 ? t("game.timeExpired", { label }) : t("game.timeRemaining", { label, seconds: remaining })}
    </div>
  );
}

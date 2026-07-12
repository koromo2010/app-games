"use client";

import { useEffect, useState } from "react";

type GamePhaseTimerProps = {
  durationSeconds: number;
  startedAt: number;
  label: string;
};

function remainingSeconds(durationSeconds: number, startedAt: number) {
  const elapsed = Math.floor((Date.now() - startedAt) / 1000);
  return Math.max(0, durationSeconds - elapsed);
}

export function GamePhaseTimer({ durationSeconds, startedAt, label }: GamePhaseTimerProps) {
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
      {remaining === 0 ? `${label}：時間切れ` : `${label}：残り ${remaining}秒`}
    </div>
  );
}

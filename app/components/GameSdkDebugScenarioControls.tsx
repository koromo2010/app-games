"use client";

import { useMemo, useState } from "react";
import type { DebugScenarioProgress } from "@/app/hooks/use-game-sdk-debug-scenario";

export type GameSdkDebugScenarioControlsProps = {
  canRun: boolean;
  progress: DebugScenarioProgress;
  onRun(target: "step" | "phase" | "result" | "steps", count?: number): void | Promise<void>;
  onCancel(): void;
};

function formatElapsed(milliseconds: number) {
  return `${(Math.max(0, milliseconds) / 1_000).toFixed(1)}秒`;
}

export function GameSdkDebugScenarioControls({
  canRun,
  progress,
  onRun,
  onCancel,
}: GameSdkDebugScenarioControlsProps) {
  const [stepCount, setStepCount] = useState(10);
  const normalizedStepCount = useMemo(
    () => Math.min(160, Math.max(1, Math.trunc(stepCount) || 1)),
    [stepCount],
  );
  const disabled = !canRun || progress.running;

  return (
    <div className="space-y-2">
      {progress.running && (
        <div
          role="status"
          className="rounded-md border border-cyan-300 bg-cyan-50 px-3 py-2 text-xs font-bold text-cyan-950"
        >
          <div>DEBUG自動進行中 · {progress.completedSteps}手 · {formatElapsed(progress.elapsedMs)}</div>
          {progress.latestStep && (
            <div className="mt-1 font-mono text-[11px] font-medium text-cyan-800">
              rev {progress.latestStep.previousRevision} → {progress.latestStep.nextRevision}
              {progress.latestStep.appPhase ? ` · ${progress.latestStep.appPhase}` : ""}
            </div>
          )}
        </div>
      )}

      <button
        type="button"
        disabled={disabled}
        onClick={() => void onRun("step")}
        className="w-full rounded-md border border-cyan-300 bg-white px-3 py-2 text-left text-xs font-bold text-cyan-950 disabled:opacity-40"
      >
        1手だけ自動進行
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={() => void onRun("phase")}
        className="w-full rounded-md border border-cyan-300 bg-white px-3 py-2 text-left text-xs font-bold text-cyan-950 disabled:opacity-40"
      >
        次の主要状態まで進める
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={() => void onRun("result")}
        className="w-full rounded-md border border-cyan-300 bg-white px-3 py-2 text-left text-xs font-bold text-cyan-950 disabled:opacity-40"
      >
        結果まで自動進行
      </button>

      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
        <label className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-[11px] font-bold text-slate-700">
          固定手数
          <input
            type="number"
            min={1}
            max={160}
            value={stepCount}
            disabled={progress.running}
            onChange={(event) => setStepCount(Number(event.target.value))}
            className="mt-1 w-full rounded border border-slate-300 px-2 py-1 font-mono"
          />
        </label>
        <button
          type="button"
          disabled={disabled}
          onClick={() => void onRun("steps", normalizedStepCount)}
          className="self-end rounded-md border border-cyan-300 bg-white px-3 py-2 text-xs font-bold text-cyan-950 disabled:opacity-40"
        >
          {normalizedStepCount}手進める
        </button>
      </div>

      {progress.running && (
        <button
          type="button"
          onClick={onCancel}
          className="w-full rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-xs font-black text-rose-800"
        >
          自動進行を中止
        </button>
      )}
    </div>
  );
}

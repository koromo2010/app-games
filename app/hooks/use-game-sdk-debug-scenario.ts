"use client";

import {
  runDebugScenario,
  type DebugScenarioResult,
  type DebugScenarioRoom,
  type DebugScenarioStep,
  type DebugScenarioTarget,
} from "@/lib/game-sdk-debug-scenario-runner";
import { useCallback, useEffect, useRef, useState } from "react";

export type DebugScenarioProgress = {
  running: boolean;
  target: DebugScenarioTarget | null;
  completedSteps: number;
  elapsedMs: number;
  latestStep: DebugScenarioStep | null;
};

type Options<TRoom extends DebugScenarioRoom> = {
  getRoom(): TRoom | null;
  sendStep(room: TRoom): Promise<TRoom>;
  onRoom(room: TRoom): void;
  onComplete?(result: DebugScenarioResult<TRoom>): void;
  onError?(error: unknown): void;
  now?: () => number;
};

const initialProgress: DebugScenarioProgress = {
  running: false,
  target: null,
  completedSteps: 0,
  elapsedMs: 0,
  latestStep: null,
};

export function useGameSdkDebugScenario<TRoom extends DebugScenarioRoom>({
  getRoom,
  sendStep,
  onRoom,
  onComplete,
  onError,
  now = Date.now,
}: Options<TRoom>) {
  const controllerRef = useRef<AbortController | null>(null);
  const generationRef = useRef(0);
  const [progress, setProgress] = useState<DebugScenarioProgress>(initialProgress);

  const cancel = useCallback(() => {
    controllerRef.current?.abort();
  }, []);

  const run = useCallback(async (
    target: DebugScenarioTarget,
    options?: { maximumSteps?: number; deadlineMs?: number },
  ) => {
    if (controllerRef.current) return null;
    const initialRoom = getRoom();
    if (!initialRoom) throw new Error("ROOM_REQUIRED");

    const controller = new AbortController();
    controllerRef.current = controller;
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    const startedAt = now();
    setProgress({
      running: true,
      target,
      completedSteps: 0,
      elapsedMs: 0,
      latestStep: null,
    });

    try {
      const result = await runDebugScenario({
        initialRoom,
        target,
        sendStep,
        maximumSteps: options?.maximumSteps,
        deadlineMs: options?.deadlineMs,
        signal: controller.signal,
        now,
        onStep(step, room) {
          if (generationRef.current !== generation) return;
          onRoom(room);
          setProgress({
            running: true,
            target,
            completedSteps: step.step,
            elapsedMs: Math.max(0, now() - startedAt),
            latestStep: step,
          });
        },
      });
      if (generationRef.current !== generation) return null;
      onRoom(result.room);
      onComplete?.(result);
      return result;
    } catch (error) {
      if (generationRef.current === generation) onError?.(error);
      return null;
    } finally {
      if (generationRef.current === generation) {
        controllerRef.current = null;
        setProgress((current) => ({
          ...current,
          running: false,
          elapsedMs: Math.max(current.elapsedMs, now() - startedAt),
        }));
      }
    }
  }, [getRoom, now, onComplete, onError, onRoom, sendStep]);

  useEffect(() => () => {
    generationRef.current += 1;
    controllerRef.current?.abort();
    controllerRef.current = null;
  }, []);

  return {
    cancel,
    progress,
    run,
  };
}

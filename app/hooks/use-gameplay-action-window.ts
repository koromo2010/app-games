"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  createGameplayActionWindowSnapshot,
  GameplayActionDispatchGate,
  type GameplayActionDispatchResult,
  type GameplayActionErrorDisposition,
  type GameplayActionWindowPlan,
} from "@/lib/gameplay-action-window";
import {
  defaultServerClockFreshnessMs,
  getServerClockSnapshot,
  subscribeServerClock,
} from "@/lib/server-clock";

type Options = {
  plan: GameplayActionWindowPlan | null;
  freshnessMs?: number;
  onLifecycleRefresh?: () => void;
};

export function useGameplayActionWindow({
  plan,
  freshnessMs = defaultServerClockFreshnessMs,
  onLifecycleRefresh,
}: Options) {
  const [, setRevision] = useState(0);
  const [authoritativeClosedScopeKey, setAuthoritativeClosedScopeKey] = useState("");
  const dispatchGateRef = useRef(new GameplayActionDispatchGate());
  const refreshCallbackRef = useRef(onLifecycleRefresh);

  const clock = getServerClockSnapshot({ freshnessMs });
  const snapshot = createGameplayActionWindowSnapshot({
    plan,
    clock,
    authoritativeClosedScopeKey,
  });
  const snapshotRef = useRef(snapshot);

  useEffect(() => {
    refreshCallbackRef.current = onLifecycleRefresh;
  }, [onLifecycleRefresh]);

  useEffect(() => {
    snapshotRef.current = snapshot;
  }, [snapshot]);

  useEffect(() => {
    const dispatchGate = dispatchGateRef.current;
    const refresh = () => setRevision((value) => value + 1);
    const refreshFromLifecycle = () => {
      refresh();
      refreshCallbackRef.current?.();
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") refreshFromLifecycle();
    };
    const interval = window.setInterval(refresh, 250);
    const unsubscribeClock = subscribeServerClock(refresh);
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("focus", refreshFromLifecycle);
    window.addEventListener("pageshow", refreshFromLifecycle);
    return () => {
      window.clearInterval(interval);
      unsubscribeClock();
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("focus", refreshFromLifecycle);
      window.removeEventListener("pageshow", refreshFromLifecycle);
      dispatchGate.dispose();
    };
  }, []);

  const closeAuthoritatively = useCallback((expectedScopeKey?: string) => {
    const currentScopeKey = snapshotRef.current.scopeKey;
    const scopeKey = expectedScopeKey ?? currentScopeKey;
    if (!scopeKey || scopeKey !== currentScopeKey) return;
    setAuthoritativeClosedScopeKey(scopeKey);
  }, []);

  const dispatchManual = useCallback(<T,>(input: {
    actionKey: string;
    execute: () => Promise<T>;
    classifyError: (error: unknown) => GameplayActionErrorDisposition;
  }): Promise<GameplayActionDispatchResult<T>> => {
    const current = snapshotRef.current;
    return dispatchGateRef.current.dispatch({
      scopeKey: current.scopeKey,
      state: current.state,
      actionKey: input.actionKey,
      execute: input.execute,
      classifyError: input.classifyError,
    }).then((result) => {
      if (result.kind === "authoritative-expired") closeAuthoritatively(current.scopeKey);
      return result;
    });
  }, [closeAuthoritatively]);

  return {
    ...snapshot,
    closeAuthoritatively,
    dispatchManual,
  };
}

export type GameplayActionWindowController = ReturnType<typeof useGameplayActionWindow>;

"use client";

import { useEffect, useRef } from "react";
import {
  AuthoritativeTimeoutFinalizer,
  type AuthoritativeTimeoutFinalizationPlan,
  type AuthoritativeTimeoutReconciliation,
} from "@/lib/game-timer/client-finalizer";
import type { AuthoritativeTimerErrorDirective } from "@/lib/game-timer/retry";
import {
  subscribeServerClock,
  synchronizedNow,
} from "@/lib/server-clock";

type Options = {
  plan: AuthoritativeTimeoutFinalizationPlan | null;
  attempt: (attemptKey: string) => Promise<void>;
  reconcile: (
    attemptKey: string,
  ) => Promise<AuthoritativeTimeoutReconciliation>;
  classifyError: (error: unknown) => AuthoritativeTimerErrorDirective;
  onFailure?: (error: unknown) => void;
};

export function useAuthoritativeTimeoutFinalizer(options: Options) {
  const callbacksRef = useRef(options);
  const finalizerRef = useRef<AuthoritativeTimeoutFinalizer | null>(null);

  useEffect(() => {
    callbacksRef.current = options;
  }, [options]);

  useEffect(() => {
    const finalizer = new AuthoritativeTimeoutFinalizer({
      now: synchronizedNow,
      scheduler: {
        set: (callback, delayMs) => window.setTimeout(callback, delayMs),
        clear: (handle) => window.clearTimeout(handle as number),
      },
      attempt: (attemptKey) => callbacksRef.current.attempt(attemptKey),
      reconcile: (attemptKey) => callbacksRef.current.reconcile(attemptKey),
      classifyError: (error) => callbacksRef.current.classifyError(error),
      onFailure: (error) => callbacksRef.current.onFailure?.(error),
    });
    finalizerRef.current = finalizer;
    const refresh = () => finalizer.refresh();
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") refresh();
    };
    const unsubscribeClock = subscribeServerClock(refresh);
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("focus", refresh);
    window.addEventListener("pageshow", refresh);
    return () => {
      unsubscribeClock();
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("pageshow", refresh);
      finalizer.dispose();
      finalizerRef.current = null;
    };
  }, []);

  useEffect(() => {
    finalizerRef.current?.update(options.plan);
  }, [options.plan]);
}

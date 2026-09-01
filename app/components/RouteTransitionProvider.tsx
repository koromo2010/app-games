"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { PageLoadingOverlay } from "@/app/components/PageLoadingOverlay";
import { useAppLocale } from "@/app/components/AppLocaleProvider";
import { abortAllOnlineRoomDiscoveries } from "@/lib/online-room-discovery";

type RouteTransitionContextValue = {
  beginRouteTransition: () => void;
};

const RouteTransitionContext = createContext<RouteTransitionContextValue | null>(null);

export function RouteTransitionProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { locale } = useAppLocale();
  const sourcePathRef = useRef(pathname);
  const showTimerRef = useRef<number | null>(null);
  const [pending, setPending] = useState(false);
  const [visible, setVisible] = useState(false);

  const clearShowTimer = useCallback(() => {
    if (showTimerRef.current === null) return;
    window.clearTimeout(showTimerRef.current);
    showTimerRef.current = null;
  }, []);

  const beginRouteTransition = useCallback(() => {
    sourcePathRef.current = pathname;
    setPending(true);
    clearShowTimer();
    showTimerRef.current = window.setTimeout(() => {
      showTimerRef.current = null;
      setVisible(true);
    }, 120);
  }, [clearShowTimer, pathname]);

  useEffect(() => {
    if (!pending || pathname === sourcePathRef.current) return;
    clearShowTimer();
    const timer = window.setTimeout(() => {
      setVisible(false);
      setPending(false);
    }, visible ? 160 : 0);
    return () => window.clearTimeout(timer);
  }, [clearShowTimer, pathname, pending, visible]);

  useEffect(() => {
    if (!pending) return;
    const timer = window.setTimeout(() => {
      clearShowTimer();
      setVisible(false);
      setPending(false);
    }, 10_000);
    return () => window.clearTimeout(timer);
  }, [clearShowTimer, pending]);

  useEffect(() => () => clearShowTimer(), [clearShowTimer]);

  useEffect(() => () => {
    abortAllOnlineRoomDiscoveries("Navigation, locale change, or unmount");
  }, [locale, pathname]);

  const value = useMemo(() => ({ beginRouteTransition }), [beginRouteTransition]);
  return (
    <RouteTransitionContext.Provider value={value}>
      {children}
      {visible && <PageLoadingOverlay overlay />}
    </RouteTransitionContext.Provider>
  );
}

export function useRouteTransition() {
  const context = useContext(RouteTransitionContext);
  if (!context) throw new Error("useRouteTransition must be used inside RouteTransitionProvider");
  return context;
}

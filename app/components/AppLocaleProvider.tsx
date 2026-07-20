"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { defaultAppLocale, normalizeAppLocale, type AppLocale } from "@/lib/app-locale";
import { translateApp, type AppMessageKey, type AppMessageValues } from "@/lib/app-i18n";
import { readPlayerSession } from "@/lib/player-session";

type AppLocaleContextValue = {
  locale: AppLocale;
  setLocale: (locale: AppLocale) => void;
  t: (key: AppMessageKey, values?: AppMessageValues) => string;
};

const AppLocaleContext = createContext<AppLocaleContextValue | null>(null);

export function AppLocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<AppLocale>(defaultAppLocale);
  const setLocale = useCallback((nextLocale: AppLocale) => setLocaleState(normalizeAppLocale(nextLocale)), []);

  useEffect(() => {
    const sync = () => setLocaleState(normalizeAppLocale(readPlayerSession()?.locale));
    const onSessionSaved = (event: Event) => {
      const detail = (event as CustomEvent<{ locale?: unknown }>).detail;
      setLocaleState(normalizeAppLocale(detail?.locale));
    };
    sync();
    window.addEventListener("storage", sync);
    window.addEventListener("game-fields:player-session-saved", onSessionSaved);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("game-fields:player-session-saved", onSessionSaved);
    };
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const value = useMemo<AppLocaleContextValue>(() => ({
    locale,
    setLocale,
    t: (key, values) => translateApp(locale, key, values),
  }), [locale, setLocale]);

  return <AppLocaleContext.Provider value={value}>{children}</AppLocaleContext.Provider>;
}

export function useAppLocale() {
  const value = useContext(AppLocaleContext);
  if (!value) throw new Error("useAppLocale must be used inside AppLocaleProvider");
  return value;
}

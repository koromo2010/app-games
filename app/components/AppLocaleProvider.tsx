"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { defaultAppLocale, isAppLocale, normalizeAppLocale, type AppLocale } from "@/lib/app-locale";
import { translateApp, type AppMessageKey, type AppMessageValues } from "@/lib/app-i18n";

const APP_LOCALE_COOKIE = "game_fields_locale";

type AppLocaleContextValue = {
  locale: AppLocale;
  setLocale: (locale: AppLocale) => void;
  t: (key: AppMessageKey, values?: AppMessageValues) => string;
};

const AppLocaleContext = createContext<AppLocaleContextValue | null>(null);

function localePathname(pathname: string, locale: AppLocale) {
  const segments = pathname.split("/");
  if (isAppLocale(segments[1])) segments[1] = locale;
  else segments.splice(1, 0, locale);
  return segments.join("/") || `/${locale}`;
}

export function AppLocaleProvider({
  children,
  initialLocale = defaultAppLocale,
}: {
  children: ReactNode;
  initialLocale?: AppLocale;
}) {
  const [locale, setLocaleState] = useState<AppLocale>(normalizeAppLocale(initialLocale));

  const setLocale = useCallback((nextLocale: AppLocale) => {
    const normalizedLocale = normalizeAppLocale(nextLocale);
    setLocaleState(normalizedLocale);
    document.cookie = `${APP_LOCALE_COOKIE}=${normalizedLocale}; Path=/; Max-Age=31536000; SameSite=Lax`;

    const nextPathname = localePathname(window.location.pathname, normalizedLocale);
    if (nextPathname !== window.location.pathname) {
      window.location.assign(`${nextPathname}${window.location.search}${window.location.hash}`);
    }
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

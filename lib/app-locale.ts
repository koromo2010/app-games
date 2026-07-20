export const appLocales = [
  { id: "ja", label: "日本語", htmlLang: "ja", intlLocale: "ja-JP" },
  { id: "en", label: "English", htmlLang: "en", intlLocale: "en-US" },
] as const;

export type AppLocale = (typeof appLocales)[number]["id"];

export const defaultAppLocale: AppLocale = "ja";

export function isAppLocale(value: unknown): value is AppLocale {
  return typeof value === "string" && appLocales.some((locale) => locale.id === value);
}

/** Legacy accounts, sessions and rooms were Japanese and intentionally stay Japanese. */
export function normalizeAppLocale(value: unknown): AppLocale {
  return isAppLocale(value) ? value : defaultAppLocale;
}

export function appLocaleDefinition(locale: AppLocale) {
  return appLocales.find((entry) => entry.id === locale) ?? appLocales[0];
}

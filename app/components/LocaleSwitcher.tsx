"use client";

import { useAppLocale } from "@/app/components/AppLocaleProvider";
import type { AppLocale } from "@/lib/app-locale";

export function LocaleSwitcher({ className = "" }: { className?: string }) {
  const { locale, setLocale, t } = useAppLocale();
  const options: AppLocale[] = ["ja", "en"];

  return (
    <div
      className={`inline-flex items-center gap-1 rounded-xl border border-white/15 bg-slate-950/85 p-1 shadow-lg backdrop-blur ${className}`}
      aria-label={t("locale.switchLabel")}
      data-locale-switcher
    >
      {options.map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => setLocale(option)}
          aria-pressed={locale === option}
          className={`rounded-lg px-3 py-1.5 text-xs font-black transition ${
            locale === option
              ? "bg-cyan-300 text-slate-950"
              : "text-slate-200 hover:bg-white/10 hover:text-white"
          }`}
        >
          {t(`locale.${option}`)}
        </button>
      ))}
    </div>
  );
}

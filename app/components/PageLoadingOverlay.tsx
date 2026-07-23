"use client";

import { useAppLocale } from "@/app/components/AppLocaleProvider";

export function PageLoadingOverlay({ overlay = false, label }: { overlay?: boolean; label?: string }) {
  const { t } = useAppLocale();
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className={overlay
        ? "fixed inset-0 z-[200] grid place-items-center bg-slate-950/65 px-4 text-white backdrop-blur-sm"
        : "grid min-h-[70vh] place-items-center bg-slate-950 px-4 text-white"}
    >
      <div className="rounded-2xl border border-white/15 bg-slate-900/95 px-8 py-6 text-center shadow-2xl">
        <span className="mx-auto block h-9 w-9 animate-spin rounded-full border-4 border-cyan-200/30 border-r-cyan-300" aria-hidden="true" />
        <p className="mt-4 text-sm font-black tracking-wide text-slate-100">{label ?? t("site.loading")}</p>
      </div>
    </div>
  );
}

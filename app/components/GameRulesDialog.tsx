"use client";
import type { ReactNode } from "react";
import { useAppLocale } from "./AppLocaleProvider";

export function GameRulesDialog({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: ReactNode }) {
  const { t } = useAppLocale();
  if (!open) return null;
  return <div className="fixed inset-0 z-[90] grid place-items-center bg-slate-950/75 p-4" role="presentation" onMouseDown={onClose}>
    <section role="dialog" aria-modal="true" aria-label={title} className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-white/15 bg-slate-900 p-6 text-slate-100 shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
      <div className="flex items-start justify-between gap-4"><h2 className="text-2xl font-black">{title}</h2><button type="button" onClick={onClose} className="rounded-lg border border-white/15 px-3 py-2 text-sm font-bold hover:bg-white/10">{t("site.close")}</button></div>
      <div className="mt-5 text-sm leading-7 text-slate-300">{children}</div>
    </section>
  </div>;
}

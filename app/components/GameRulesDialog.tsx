"use client";
import { useRef, type ReactNode } from "react";
import { useAppLocale } from "./AppLocaleProvider";
import { useKeyboardLayer } from "./keyboard-focus-contract";
import { GameRuleSections } from "./GameRulePresentation";
import { getBuiltInGameRules, type BoundGameRules } from "@/lib/game-rules";

export function GameRulesDialog({ open, title, onClose, children, gameId, ruleSet }: { open: boolean; title: string; onClose: () => void; children?: ReactNode; gameId?: string; ruleSet?: BoundGameRules | null }) {
  const { t } = useAppLocale();
  const dialogRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const normalizedRuleSet = ruleSet ?? (gameId ? getBuiltInGameRules(gameId) : null);
  useKeyboardLayer({ open, containerRef: dialogRef, initialFocusRef: closeButtonRef, onDismiss: onClose });
  if (!open) return null;
  return <div className="fixed inset-0 z-[90] grid place-items-center bg-slate-950/75 p-4" role="presentation" onMouseDown={onClose}>
    <section ref={dialogRef} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-white/15 bg-slate-900 p-6 text-slate-100 shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
      <div className="flex items-start justify-between gap-4"><h2 className="text-2xl font-black">{title}</h2><button ref={closeButtonRef} type="button" onClick={onClose} className="rounded-lg border border-white/15 px-3 py-2 text-sm font-bold hover:bg-white/10">{t("site.close")}</button></div>
      <div className="mt-5 text-sm leading-7 text-slate-300">{normalizedRuleSet ? <GameRuleSections ruleSet={normalizedRuleSet} /> : children}</div>
    </section>
  </div>;
}

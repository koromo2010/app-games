"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useAppLocale } from "./AppLocaleProvider";
import type { BoundGameRules } from "@/lib/game-rules";

const seenKey = (ruleSet: BoundGameRules) => `game-fields:rules:${ruleSet.gameId}:${ruleSet.revision}`;

function hasSeen(ruleSet: BoundGameRules) {
  try { return window.localStorage.getItem(seenKey(ruleSet)) === "seen"; } catch { return false; }
}

function markSeen(ruleSet: BoundGameRules) {
  try { window.localStorage.setItem(seenKey(ruleSet), "seen"); } catch { /* Presentation remains usable without storage. */ }
}

function subscribeToFirstVisit() {
  return () => {};
}

function useFirstRulesVisit(ruleSet: BoundGameRules) {
  const firstVisit = useSyncExternalStore(
    subscribeToFirstVisit,
    () => !hasSeen(ruleSet),
    () => false,
  );
  useEffect(() => {
    if (firstVisit) markSeen(ruleSet);
  }, [firstVisit, ruleSet]);
  return firstVisit;
}

export function GameRuleSections({ ruleSet }: { ruleSet: BoundGameRules }) {
  const { sections } = ruleSet;
  const { locale } = useAppLocale();
  const languageLabel = ruleSet.language === "ja"
    ? (locale === "en" ? "Rule text: Japanese" : "ルール本文：日本語")
    : (locale === "en" ? "Rule text: English" : "ルール本文：英語");
  return <div data-game-rule-revision={ruleSet.revision} className="space-y-5">
    <p className="text-xs font-bold text-cyan-100">{languageLabel}</p>
    <section><h3 className="font-black text-white">概要</h3><p className="mt-1">{sections.summary}</p></section>
    <section><h3 className="font-black text-white">プレイヤーの行動</h3><p className="mt-1">{sections.playerActions}</p></section>
    <section><h3 className="font-black text-white">勝利条件</h3><p className="mt-1">{sections.winCondition}</p></section>
    <section><h3 className="font-black text-white">詳細ルール</h3><p className="mt-1">{sections.detailedRules}</p></section>
    <section className="rounded-xl border border-cyan-300/20 bg-cyan-300/10 p-3 text-cyan-50"><h3 className="font-black">プレイ例</h3><p className="mt-1">{sections.playExample}</p></section>
  </div>;
}

/** A non-blocking full rule view for a game entry or Room lobby. */
export function GameRulesDisclosure({ ruleSet, surface }: { ruleSet: BoundGameRules | null; surface: "creation" | "lobby" }) {
  if (!ruleSet) return <p role="status" className="rounded-lg border border-amber-300/40 bg-amber-300/10 p-3 text-sm font-bold text-amber-100">このRoom revisionのルールを確認できません。</p>;
  return <RuleDisclosureForRevision key={`${ruleSet.gameId}:${ruleSet.revision}`} ruleSet={ruleSet} surface={surface} />;
}

function RuleDisclosureForRevision({ ruleSet, surface }: { ruleSet: BoundGameRules; surface: "creation" | "lobby" }) {
  const firstVisit = useFirstRulesVisit(ruleSet);
  const [manualOpen, setManualOpen] = useState(false);
  const [dismissedFirstVisit, setDismissedFirstVisit] = useState(false);
  const open = (firstVisit && !dismissedFirstVisit) || manualOpen;
  return <section data-game-rules-surface={surface} data-game-rule-revision={ruleSet.revision} className="rounded-xl border border-white/15 bg-slate-950/50 p-4 text-slate-100">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-black">ゲームルール</h2><p className="mt-1 text-sm text-slate-300">{ruleSet.sections.summary}</p></div><button type="button" aria-expanded={open} onClick={() => {
      if (open) {
        setDismissedFirstVisit(true);
        setManualOpen(false);
      } else {
        setManualOpen(true);
      }
    }} className="rounded-lg border border-white/20 px-3 py-2 text-sm font-bold hover:bg-white/10">{open ? "詳細を閉じる" : "詳細ルールを開く"}</button></div>
    <p className="mt-3 text-sm font-bold text-cyan-100">勝利条件：{ruleSet.sections.winCondition}</p>
    {open && <div className="mt-4 border-t border-white/10 pt-4"><GameRuleSections ruleSet={ruleSet} /></div>}
  </section>;
}

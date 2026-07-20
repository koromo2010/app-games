"use client";

import { PlayingCard, type PlayingCardSize } from "@/app/components/PlayingCard";
import { useAppLocale } from "./AppLocaleProvider";

type PlayingCardBackStackProps = {
  count: number;
  size?: PlayingCardSize;
  label?: string;
  maximumVisibleCards?: number;
};

const stackOverlapClasses: Record<PlayingCardSize, string> = {
  xs: "-ml-5",
  sm: "-ml-7 sm:-ml-5",
  md: "-ml-10 sm:-ml-7",
  lg: "-ml-14 sm:-ml-10",
};

export function PlayingCardBackStack({ count, size = "sm", label, maximumVisibleCards = 7 }: PlayingCardBackStackProps) {
  const { t } = useAppLocale();
  const safeCount = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
  const visibleLimit = Number.isFinite(maximumVisibleCards) ? Math.max(1, Math.floor(maximumVisibleCards)) : 7;
  const visibleCount = Math.min(safeCount, visibleLimit);
  return <div className="flex items-end" role="img" aria-label={label ?? t("card.hiddenCount", { count: safeCount })}>
    {Array.from({ length: visibleCount }, (_, index) => <span key={index} aria-hidden="true" className={`relative shrink-0 ${index === 0 ? "" : stackOverlapClasses[size]}`}><PlayingCard faceDown size={size} /></span>)}
    <span className="relative z-20 -ml-3 rounded-full bg-amber-300 px-2 py-1 text-xs font-black text-slate-950 shadow">{t("card.count", { count: safeCount })}</span>
  </div>;
}

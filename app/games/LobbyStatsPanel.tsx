"use client";

import { useAppLocale } from "@/app/components/AppLocaleProvider";
import { appIntlLocale } from "@/lib/app-i18n";
import type { PlayerStatsGameFilter, PlayerStatsResponse } from "@/lib/player-stats-store";

type Option = { value: PlayerStatsGameFilter; label: string };
type Props = { stats: PlayerStatsResponse | null; options: readonly Option[]; selectedGame: PlayerStatsGameFilter; isLoading: boolean; onGameChange: (game: PlayerStatsGameFilter) => void; onRefresh: () => void };

export function LobbyStatsPanel({ stats, options, selectedGame, isLoading, onGameChange, onRefresh }: Props) {
  const { locale, t } = useAppLocale();
  const summaries = [[t("stats.today"), stats?.today], [t("stats.month"), stats?.month], [t("stats.total"), stats?.total]] as const;
  const playedRatingOptions = options.filter((option) => option.value !== "all" && typeof stats?.ratings[option.value as Exclude<PlayerStatsGameFilter, "all">] === "number");
  const selectedRating = selectedGame === "all" ? undefined : stats?.ratings[selectedGame];
  const rating = selectedGame === "all"
    ? playedRatingOptions.length > 0 ? playedRatingOptions.map((option) => `${option.label} ${stats?.ratings[option.value as Exclude<PlayerStatsGameFilter, "all">]}`).join(" / ") : null
    : typeof selectedRating === "number" ? String(selectedRating) : null;
  const formatDate = (timestamp: number) => new Intl.DateTimeFormat(appIntlLocale(locale), { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(timestamp));
  return <div className="rounded-lg border border-white/10 bg-white/[0.96] p-4 shadow-[0_18px_50px_rgba(15,23,42,0.18)]">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-semibold uppercase text-cyan-700">Stats</p><h2 className="text-lg font-bold text-slate-950">{t("stats.title")}</h2></div><label className="sr-only" htmlFor="stats-game-filter">{t("stats.title")}</label><select id="stats-game-filter" value={selectedGame} onChange={(event) => onGameChange(event.target.value as PlayerStatsGameFilter)} className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700 outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20">{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select><button type="button" onClick={onRefresh} className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-600 transition hover:bg-slate-50">{t("stats.refresh")}</button></div>
    {rating && <p className="mt-3 text-xs text-slate-500">{t("stats.rating", { rating })}</p>}
    <div className="mt-4 grid grid-cols-3 gap-2">{summaries.map(([label, summary]) => <div key={label} className="rounded-lg bg-slate-100 px-3 py-2"><p className="text-xs font-semibold text-slate-500">{label}</p><p className="mt-1 text-lg font-black text-slate-950">{summary?.winRate ?? 0}%</p><p className="text-[11px] text-slate-500">{t("stats.record", { wins: summary?.wins ?? 0, played: summary?.played ?? 0 })}</p></div>)}</div>
    <div className="mt-4"><p className="text-xs font-semibold uppercase text-slate-500">Recent</p>{isLoading ? <p className="mt-2 text-sm text-slate-500">{t("stats.loading")}</p> : stats?.recent.length ? <div className="mt-2 space-y-2">{stats.recent.slice(0, 5).map((result) => <div key={result.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm"><div><p className="font-semibold text-slate-800">{result.resultLabel}</p><p className="text-xs text-slate-500">{formatDate(result.finishedAt)} / {options.find((option) => option.value === result.gameType)?.label ?? result.gameType}</p></div><span className={`rounded-md px-2 py-1 text-xs font-bold ${result.draw ? "bg-amber-100 text-amber-700" : result.won ? "bg-cyan-100 text-cyan-700" : "bg-rose-100 text-rose-700"}`}>{result.draw ? "DRAW" : result.won ? "WIN" : "LOSE"}</span></div>)}</div> : <p className="mt-2 text-sm text-slate-500">{t("stats.empty")}</p>}</div>
  </div>;
}

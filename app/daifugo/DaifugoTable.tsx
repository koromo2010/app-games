"use client";

import { useAppLocale } from "@/app/components/AppLocaleProvider";
import { PlayingCard } from "@/app/components/PlayingCard";
import { PlayingCardBackStack } from "@/app/components/PlayingCardBackStack";
import type { DaifugoGameState } from "@/lib/daifugo";
import { daifugoText, formatDaifugoText } from "./daifugo-i18n";

const playerColors = ["border-cyan-300/40", "border-fuchsia-300/40", "border-amber-300/40", "border-lime-300/40"];

export function DaifugoTable({ state, viewerId = "you", handCounts }: { state: DaifugoGameState; viewerId?: string; handCounts?: Record<string, number> }) {
  const { locale } = useAppLocale();
  const d = daifugoText(locale);
  const rankNames = [d.rank1, d.rank2, d.rank3, d.rank4];
  const rankName = (position: number) => rankNames[position] ?? `#${position + 1}`;
  const currentName = state.players.find((player) => player.id === state.currentPlayerId)?.name ?? "";
  return <section className="rounded-3xl border border-white/10 bg-slate-950/55 p-4 shadow-2xl backdrop-blur sm:p-6" aria-label={d.tableLabel}>
    <div className="grid gap-3 sm:grid-cols-3">
      {state.players.filter((player) => player.id !== viewerId).map((player, index) => {
        const finishIndex = state.finishOrder.indexOf(player.id);
        const isCurrent = state.currentPlayerId === player.id;
        const passed = state.passedPlayerIds.includes(player.id);
        const handCount = handCounts?.[player.id] ?? state.hands[player.id]?.length ?? 0;
        return <article key={player.id} className={`rounded-2xl border bg-slate-900/80 p-3 ${playerColors[(index + 1) % playerColors.length]} ${isCurrent ? "ring-2 ring-cyan-300" : ""}`}>
          <div className="flex items-center justify-between gap-2"><h2 className="font-black text-white">{player.name}</h2><span className={`rounded-full px-2 py-1 text-[11px] font-black ${finishIndex >= 0 ? "bg-amber-300 text-slate-950" : passed ? "bg-slate-700 text-slate-300" : isCurrent ? "bg-cyan-300 text-slate-950" : "bg-white/10 text-slate-300"}`}>{finishIndex >= 0 ? rankName(finishIndex) : passed ? d.pass : isCurrent ? d.turn : `${handCount}${d.cards}`}</span></div>
          <div className="mt-3 min-h-16"><PlayingCardBackStack count={handCount} size="xs" maximumVisibleCards={6} /></div>
        </article>;
      })}
    </div>
    <div className="my-5 flex min-h-44 flex-col items-center justify-center rounded-3xl border border-dashed border-emerald-300/30 bg-emerald-950/35 px-4 py-5">
      <p className="text-xs font-bold uppercase tracking-[0.22em] text-emerald-200">Table</p>
      {state.table ? <><div className="mt-3 flex justify-center gap-2">{state.table.cards.map((card) => <PlayingCard key={card.id} card={card} size="sm" />)}</div><p className="mt-3 text-sm font-bold text-white">{state.table.label}</p><p className="text-xs text-slate-300">{formatDaifugoText(d.playedBy, { name: state.players.find((player) => player.id === state.lastPlayedById)?.name ?? "" })}</p></> : <div className="mt-3 text-center"><p className="text-xl font-black text-white">{d.emptyTable}</p><p className="mt-1 text-sm text-emerald-100">{d.emptyHelp}</p></div>}
    </div>
    <p className="text-center text-sm font-bold text-cyan-100" aria-live="polite">{state.status === "finished" ? d.finished : state.firstPlay ? formatDaifugoText(d.starts, { name: currentName }) : formatDaifugoText(d.currentTurn, { name: currentName })}</p>
  </section>;
}

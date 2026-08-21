import type { TahoiyaPlayer, TahoiyaRoom } from "@/lib/tahoiya-types";
import { GameEntryOverview } from "@/app/components/GameEntryOverview";
import { panelClass } from "../wordwolf/styles";

export function TahoiyaScorePanel({ room, players }: { room: TahoiyaRoom; players: TahoiyaPlayer[] }) {
  return <div className={panelClass}><p className="text-xs font-semibold uppercase text-amber-700">Score</p><h2 className="text-lg font-bold text-slate-950">得点</h2><div className="mt-3 space-y-2">{players.map((player) => <div key={player.id} className="flex items-center justify-between rounded-lg bg-slate-100 px-3 py-2 text-sm"><span className="font-semibold text-slate-800">{player.name}</span><span className="font-black text-slate-950">{room.scores[player.id] ?? 0}</span></div>)}</div></div>;
}

export function TahoiyaEmptyState() {
  return <GameEntryOverview gameId="tahoiya" />;
}

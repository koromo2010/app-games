import type { TahoiyaPlayer, TahoiyaRoom } from "@/lib/tahoiya-types";
import { panelClass } from "../wordwolf/styles";

export function TahoiyaScorePanel({ room, players }: { room: TahoiyaRoom; players: TahoiyaPlayer[] }) {
  return <div className={panelClass}><p className="text-xs font-semibold uppercase text-amber-700">Score</p><h2 className="text-lg font-bold text-slate-950">得点</h2><div className="mt-3 space-y-2">{players.map((player) => <div key={player.id} className="flex items-center justify-between rounded-lg bg-slate-100 px-3 py-2 text-sm"><span className="font-semibold text-slate-800">{player.name}</span><span className="font-black text-slate-950">{room.scores[player.id] ?? 0}</span></div>)}</div></div>;
}

export function TahoiyaEmptyState() {
  return <div className="min-h-[520px] rounded-lg border border-white/10 bg-white/[0.96] p-6 shadow-[0_18px_50px_rgba(15,23,42,0.16)]"><div className="grid min-h-[460px] place-items-center rounded-lg border border-dashed border-amber-200 bg-[linear-gradient(135deg,#ffffff_0%,#f8fafc_55%,#fff7ed_100%)]"><div className="max-w-md text-center"><p className="text-sm font-semibold text-amber-700">Prototype ready</p><h2 className="mt-2 text-3xl font-black text-slate-950">辞書の本物を見抜く</h2><p className="mt-3 text-sm leading-6 text-slate-600">回答者1人で遊ぶルールと、全員が偽説明を書いて全員投票するルールを選べます。</p></div></div></div>;
}

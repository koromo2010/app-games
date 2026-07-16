import Link from "next/link";
import type { GameOperation } from "@/lib/game-operations";
import { gameOperationFor } from "@/lib/game-operations";
import type { GameCatalogEntry } from "./game-catalog";

type ActiveRoom = { code: string; phase: string; players: { id: string; name: string }[]; updatedAt: number };
type Props = { games: GameCatalogEntry[]; operations: GameOperation[]; activeRooms: Record<string, ActiveRoom>; isLoggedIn: boolean; onLoginRequired: () => void; onRememberWordWolf: () => void };

export function LobbyGameGrid({ games, operations, activeRooms, isLoggedIn, onLoginRequired, onRememberWordWolf }: Props) {
  return <div className={`${isLoggedIn ? "order-1" : "order-2"} min-w-0 lg:order-2 lg:col-start-2 lg:row-start-1`}>
    <div className="mb-4 rounded-lg border border-white/10 bg-white/[0.08] px-4 py-3 text-white"><p className="text-xs font-semibold uppercase text-cyan-200">Games</p><h2 className="text-xl font-black">遊ぶゲームを選ぶ</h2></div>
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(210px,230px))] sm:justify-start">{games.map((game) => <LobbyGameCard key={game.id} game={game} operation={gameOperationFor(operations, game.id)} activeRoom={activeRooms[game.id]} isLoggedIn={isLoggedIn} onLoginRequired={onLoginRequired} onRememberWordWolf={onRememberWordWolf} />)}</div>
  </div>;
}

function LobbyGameCard({ game, operation, activeRoom, isLoggedIn, onLoginRequired, onRememberWordWolf }: { game: GameCatalogEntry; operation: GameOperation; activeRoom?: ActiveRoom; isLoggedIn: boolean; onLoginRequired: () => void; onRememberWordWolf: () => void }) {
  const maintenance = operation.maintenance; const active = Boolean(activeRoom); const privateGame = operation.publication === "private";
  const card = <article className={`h-full rounded-lg border p-3 shadow-[0_14px_38px_rgba(15,23,42,0.18)] transition hover:-translate-y-0.5 hover:shadow-[0_20px_48px_rgba(15,23,42,0.28)] ${active ? "border-cyan-300 bg-gradient-to-br from-cyan-950 via-slate-900 to-fuchsia-950 ring-2 ring-cyan-300/60" : "border-white/10 bg-white/[0.96]"}`}>
    <div className={`h-14 rounded-md bg-gradient-to-br ${game.accent} ${active ? "ring-2 ring-white/50" : ""}`} />
    <div className="mt-3"><h2 className={`text-lg font-black leading-tight ${active ? "text-white" : "text-slate-950"}`}>{game.title}</h2><div className="mt-2 flex flex-wrap gap-1.5"><Badge active={active}>{active ? "プレイ中" : maintenance ? "メンテナンス中" : game.status}</Badge>{privateGame && <Badge active={active}>プライベート</Badge>}{game.tags.map((tag) => <Badge key={tag} active={active} cooperative={tag === "協力"}>{tag}</Badge>)}</div></div>
    {activeRoom && <p className="mt-2 text-xs font-bold text-cyan-100">部屋 {activeRoom.code} に参加中</p>}
    <p className={`mt-2 min-h-10 text-xs leading-5 ${active ? "text-slate-200" : "text-slate-600"}`}>{game.summary}</p>
    {maintenance && <p className="mt-2 rounded-md bg-amber-100 px-2 py-1.5 text-xs font-bold leading-5 text-amber-900">{operation.message || "現在メンテナンス中です。しばらくお待ちください。"}</p>}
    <div className={`mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t pt-2 text-xs ${active ? "border-white/15 text-slate-200" : "border-slate-200 text-slate-600"}`}><p><span className={active ? "text-cyan-200" : "text-slate-400"}>人数</span> <strong>{game.players}</strong></p><p><span className={active ? "text-cyan-200" : "text-slate-400"}>目安</span> <strong>{game.time}</strong></p></div>
    <div className="mt-3">{maintenance ? <span className="inline-flex rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-800">現在は遊べません</span> : game.href ? <span className={`inline-flex rounded-md px-3 py-1.5 text-xs font-bold shadow-sm ${active ? "bg-amber-300 text-amber-950" : isLoggedIn ? "bg-cyan-600 text-white" : "bg-slate-200 text-slate-500"}`}>{active ? "ゲームに戻る" : isLoggedIn ? "遊ぶ" : "ログインしてから遊ぶ"}</span> : <span className="inline-flex rounded-md border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-400">準備中</span>}</div>
  </article>;
  if (!game.href || maintenance) return <div className="block opacity-80">{card}</div>;
  return isLoggedIn ? <Link href={game.href} onClick={game.id === "wordwolf" && active ? onRememberWordWolf : undefined} className="block">{card}</Link> : <button type="button" onClick={onLoginRequired} className="block text-left">{card}</button>;
}

function Badge({ active, cooperative, children }: { active: boolean; cooperative?: boolean; children: React.ReactNode }) { return <span className={`inline-flex max-w-full rounded-md border px-2 py-1 text-[11px] font-black leading-tight ${active ? "border-white/20 bg-white/10 text-white" : cooperative ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700"}`}>{children}</span>; }

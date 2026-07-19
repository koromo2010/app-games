import { useMemo, useState } from "react";
import Link from "next/link";
import type { GameOperation } from "@/lib/game-operations";
import { gameOperationFor } from "@/lib/game-operations";
import { filterGamesBySearch } from "@/lib/game-catalog-search";
import type { GameCatalogEntry } from "./game-catalog";

type ActiveRoom = { code: string; phase: string; players: { id: string; name: string }[]; updatedAt: number };
type Props = { games: GameCatalogEntry[]; operations: GameOperation[]; activeRooms: Record<string, ActiveRoom>; isLoggedIn: boolean; onLoginRequired: () => void; onRememberWordWolf: () => void };

export function LobbyGameGrid({ games, operations, activeRooms, isLoggedIn, onLoginRequired, onRememberWordWolf }: Props) {
  const [searchQuery, setSearchQuery] = useState("");
  const filteredGames = useMemo(() => filterGamesBySearch(games, searchQuery), [games, searchQuery]);
  return <div className={`${isLoggedIn ? "order-1" : "order-2"} min-w-0 lg:order-2 lg:col-start-2 lg:row-start-1`}>
    <div className="mb-4 rounded-lg border border-white/10 bg-white/[0.08] px-4 py-3 text-white">
      <p className="text-xs font-semibold uppercase text-cyan-200">Games</p>
      <div className="mt-1 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <h2 className="text-xl font-black">遊ぶゲームを選ぶ</h2>
        <label className="relative block w-full sm:max-w-xs">
          <span className="sr-only">ゲームを検索</span>
          <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-400">⌕</span>
          <input type="search" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="名前・タグ・遊び方で検索" className="w-full rounded-lg border border-white/15 bg-white px-9 py-2 text-sm text-slate-950 outline-none placeholder:text-slate-400 focus:border-cyan-300 focus:ring-2 focus:ring-cyan-300/25" />
          {searchQuery && <button type="button" onClick={() => setSearchQuery("")} aria-label="検索をクリア" className="absolute inset-y-0 right-2 px-2 text-lg font-bold text-slate-400 hover:text-slate-700">×</button>}
        </label>
      </div>
      {searchQuery.trim() && <p className="mt-2 text-xs text-slate-300">{filteredGames.length}件見つかりました。表記ゆれや軽い入力ミスにも対応します。</p>}
    </div>
    {filteredGames.length > 0 ? <div className="grid grid-cols-1 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(210px,230px))] sm:justify-start">{filteredGames.map((game) => <LobbyGameCard key={game.id} game={game} operation={gameOperationFor(operations, game.id)} activeRoom={activeRooms[game.id]} isLoggedIn={isLoggedIn} onLoginRequired={onLoginRequired} onRememberWordWolf={onRememberWordWolf} />)}</div> : <div className="rounded-lg border border-dashed border-white/20 bg-white/[0.06] px-5 py-8 text-center text-white"><p className="font-bold">一致するゲームがありません</p><p className="mt-1 text-sm text-slate-400">別の名前・タグ・遊び方で検索してください。</p><button type="button" onClick={() => setSearchQuery("")} className="mt-4 rounded-lg border border-white/20 px-4 py-2 text-sm font-bold hover:bg-white/10">検索をクリア</button></div>}
  </div>;
}

function LobbyGameCard({ game, operation, activeRoom, isLoggedIn, onLoginRequired, onRememberWordWolf }: { game: GameCatalogEntry; operation: GameOperation; activeRoom?: ActiveRoom; isLoggedIn: boolean; onLoginRequired: () => void; onRememberWordWolf: () => void }) {
  const maintenance = operation.maintenance; const active = Boolean(activeRoom); const privateGame = operation.publication === "private";
  const card = <article className={`h-full rounded-lg border p-3 shadow-[0_14px_38px_rgba(15,23,42,0.18)] transition hover:-translate-y-0.5 hover:shadow-[0_20px_48px_rgba(15,23,42,0.28)] ${active ? "border-cyan-300 bg-gradient-to-br from-cyan-950 via-slate-900 to-fuchsia-950 ring-2 ring-cyan-300/60" : "border-white/10 bg-white/[0.96]"}`}>
    <div className={`h-14 rounded-md bg-gradient-to-br ${game.accent} ${active ? "ring-2 ring-white/50" : ""}`} />
    <div className="mt-3"><h2 className={`text-lg font-black leading-tight ${active ? "text-white" : "text-slate-950"}`}>{game.title}</h2><div className="mt-2 flex flex-wrap gap-1.5">{active && <Badge active>プレイ中</Badge>}{maintenance && !active && <Badge active={false} state>メンテナンス中</Badge>}{privateGame && <Badge active={active} state>プライベート</Badge>}{game.tags.map((tag) => <Badge key={tag} active={active} tag={tag}>{tag}</Badge>)}</div></div>
    {activeRoom && <p className="mt-2 text-xs font-bold text-cyan-100">部屋 {activeRoom.code} に参加中</p>}
    <p className={`mt-2 min-h-10 text-xs leading-5 ${active ? "text-slate-200" : "text-slate-600"}`}>{game.summary}</p>
    {maintenance && <p className="mt-2 rounded-md bg-amber-100 px-2 py-1.5 text-xs font-bold leading-5 text-amber-900">{operation.message || "現在メンテナンス中です。しばらくお待ちください。"}</p>}
    <div className={`mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t pt-2 text-xs ${active ? "border-white/15 text-slate-200" : "border-slate-200 text-slate-600"}`}><p><span className={active ? "text-cyan-200" : "text-slate-400"}>人数</span> <strong>{game.players}</strong></p><p><span className={active ? "text-cyan-200" : "text-slate-400"}>目安</span> <strong>{game.time}</strong></p></div>
    <div className="mt-3">{maintenance ? <span className="inline-flex rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-800">現在は遊べません</span> : game.href ? <span className={`inline-flex rounded-md px-3 py-1.5 text-xs font-bold shadow-sm ${active ? "bg-amber-300 text-amber-950" : isLoggedIn ? "bg-cyan-600 text-white" : "bg-slate-200 text-slate-500"}`}>{active ? "ゲームに戻る" : isLoggedIn ? "遊ぶ" : "ログインしてから遊ぶ"}</span> : <span className="inline-flex rounded-md border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-400">準備中</span>}</div>
  </article>;
  if (!game.href || maintenance) return <div className="block opacity-80">{card}</div>;
  return isLoggedIn ? <Link href={game.href} onClick={game.id === "wordwolf" && active ? onRememberWordWolf : undefined} className="block">{card}</Link> : <button type="button" onClick={onLoginRequired} className="block text-left">{card}</button>;
}

function Badge({ active, state = false, tag, children }: { active: boolean; state?: boolean; tag?: GameCatalogEntry["tags"][number]; children: React.ReactNode }) {
  const tone = state
    ? "border-amber-200 bg-amber-50 text-amber-800"
    : tag === "協力"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : tag === "チーム戦"
        ? "border-sky-200 bg-sky-50 text-sky-700"
        : tag === "対戦"
          ? "border-rose-200 bg-rose-50 text-rose-700"
          : "border-violet-200 bg-violet-50 text-violet-700";
  return <span className={`inline-flex max-w-full rounded-md border px-2 py-1 text-[11px] font-black leading-tight ${active ? "border-white/20 bg-white/10 text-white" : tone}`}>{children}</span>;
}

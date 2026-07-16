import Link from "next/link";
import type { ActiveWordWolfRoom } from "./use-lobby-room-data";

function formatDate(timestamp: number) {
  return new Intl.DateTimeFormat("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(timestamp));
}

function phaseLabel(phase: ActiveWordWolfRoom["phase"]) {
  if (phase === "lobby") return "待機中";
  if (phase === "clue") return "発言中";
  if (phase === "vote") return "投票中";
  if (phase === "wolfGuess") return "逆転回答";
  return "結果表示";
}

export function LobbyResumePanel({ room, isLoading, onResume }: { room: ActiveWordWolfRoom | null; isLoading: boolean; onResume: () => void }) {
  if (!room && !isLoading) return null;
  return (
    <div className="rounded-lg border border-cyan-200 bg-cyan-50 p-4 shadow-[0_18px_50px_rgba(15,23,42,0.16)]">
      <p className="text-xs font-semibold uppercase text-cyan-700">Resume</p>
      <h2 className="mt-1 text-lg font-bold text-slate-950">部屋に復帰</h2>
      {isLoading && !room ? <p className="mt-3 text-sm text-slate-600">復帰先を確認中...</p> : room ? (
        <>
          <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
            <div className="rounded-lg bg-white px-3 py-2"><p className="text-xs text-slate-500">ROOM</p><p className="font-bold text-slate-950">{room.code}</p></div>
            <div className="rounded-lg bg-white px-3 py-2"><p className="text-xs text-slate-500">状態</p><p className="font-bold text-slate-950">{phaseLabel(room.phase)}</p></div>
          </div>
          <p className="mt-2 text-xs text-slate-600">{room.players.length}人参加中 / {formatDate(room.updatedAt)}更新</p>
          <Link href="/wordwolf" onClick={onResume} className="mt-3 inline-flex w-full justify-center rounded-lg bg-cyan-600 px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-cyan-500">この部屋に復帰</Link>
        </>
      ) : null}
    </div>
  );
}

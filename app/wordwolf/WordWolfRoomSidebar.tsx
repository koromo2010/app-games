import type { ReactNode } from "react";
import { defaultAvatarImage, fallbackAvatarColor } from "@/lib/player-session";
import type { Room } from "@/lib/wordwolf-game-types";
import { dangerButtonClass, panelClass } from "./styles";

type Props = {
  room: Room;
  activePlayerId: string;
  isHost: boolean;
  onSelectPlayer: (playerId: string) => void;
  onCopyRoomCode: () => void;
  onCopyRoomInvite: () => void;
  onDissolveRoom: () => void;
  children?: ReactNode;
};

export function WordWolfRoomSidebar({ room, activePlayerId, isHost, onSelectPlayer, onCopyRoomCode, onCopyRoomInvite, onDissolveRoom, children }: Props) {
  const scoreRows = room.players
    .map((player) => ({ player, wins: room.scores[player.id] ?? 0 }))
    .sort((left, right) => right.wins - left.wins || left.player.joinedAt - right.player.joinedAt);

  return <div className={panelClass}>
    <div className="flex items-start justify-between gap-3">
      <div><p className="text-xs font-semibold uppercase text-cyan-700">Room</p><p className="font-mono text-3xl font-black tracking-normal text-slate-950">{room.code}</p></div>
      <div className="flex flex-col items-end gap-1.5">
        <span className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-900">{room.phase}</span>
        <div className="flex gap-1.5">
          <button type="button" onClick={onCopyRoomCode} title="ROOMコードをコピー" aria-label="ROOMコードをコピー" className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-slate-600 shadow-sm transition hover:border-cyan-300 hover:bg-cyan-50 hover:text-cyan-900"><span className="rounded bg-slate-100 px-1 py-0.5 text-[10px] text-slate-500">コピー</span><span>ROOM</span></button>
          <button type="button" onClick={onCopyRoomInvite} title="ROOMと合言葉をコピー" aria-label="ROOMと合言葉をコピー" className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-slate-600 shadow-sm transition hover:border-cyan-300 hover:bg-cyan-50 hover:text-cyan-900"><span className="rounded bg-slate-100 px-1 py-0.5 text-[10px] text-slate-500">コピー</span><span>ROOM+合言葉</span></button>
        </div>
      </div>
    </div>
    <div className="mt-4 space-y-2">
      {room.players.map((player) => <button key={player.id} onClick={() => onSelectPlayer(player.id)} className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm ${player.id === activePlayerId ? "border-cyan-500 bg-cyan-50 text-cyan-950" : "border-slate-200 bg-slate-50 text-slate-800 hover:bg-slate-100"}`}><span className="flex min-w-0 items-center gap-2"><span className="h-4 w-4 shrink-0 rounded-full border border-white bg-cover bg-center shadow-sm" style={{ backgroundColor: player.avatarColor || fallbackAvatarColor, backgroundImage: `url(${player.avatarImage || defaultAvatarImage})` }} aria-hidden="true" /><span className="truncate font-medium">{player.name}</span></span>{player.id === room.hostId && <span className="text-xs text-slate-500">host</span>}</button>)}
    </div>
    <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div className="flex items-center justify-between gap-3"><p className="text-sm font-bold text-slate-950">部屋内戦績</p><span className="rounded-md bg-white px-2 py-1 text-xs font-semibold text-slate-500">{room.gamesPlayed}戦</span></div>
      <div className="mt-3 space-y-2">{scoreRows.map(({ player, wins }) => <div key={player.id} className="flex items-center justify-between gap-3 text-sm"><span className="min-w-0 truncate text-slate-700">{player.name}</span><span className="shrink-0 rounded-md bg-white px-2 py-1 font-bold text-slate-950">{wins}勝</span></div>)}</div>
    </div>
    {isHost && <button onClick={onDissolveRoom} className={`mt-4 w-full ${dangerButtonClass}`}>部屋を解散</button>}
    {children}
  </div>;
}

import type { TahoiyaPlayer, TahoiyaRoom } from "@/lib/tahoiya-types";
import { panelClass } from "../wordwolf/styles";

type Props = {
  room: TahoiyaRoom; isAnswerer: boolean; remainingSeconds: number | null;
  isDebugMode: boolean; isHost: boolean; nextWriter: TahoiyaPlayer | null | undefined; nextVoter: TahoiyaPlayer | null | undefined;
  onRemoveWaitingPlayer: (targetPlayerId: string, targetPlayerName: string) => void;
};

export function TahoiyaRoundOverview(props: Props) {
  const { room } = props;
  const returnedPlayerIds = new Set(room.lobbyReturn?.returnedPlayerIds ?? []);
  const returnStatusLabel = room.lobbyReturn?.reason === "debug-abort" ? "ゲーム中断後の復帰状況" : "前の結果画面からの復帰状況";
  const debugStatus = room.phase === "writing" && props.nextWriter
    ? `次の未投稿: ${props.nextWriter.name}`
    : room.phase === "voting" && props.nextVoter
      ? `次の未投票: ${props.nextVoter.name}`
      : "操作プレイヤーを切り替えながら一人で流れを確認できます。";
  return <>
    <div className={panelClass}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div><p className="text-xs font-semibold uppercase text-amber-700">Round {room.round}</p><h2 className="mt-1 text-3xl font-black text-slate-950">{room.phase === "lobby" ? "開始待ち" : room.phase === "writing" && props.isAnswerer ? "お題は準備中" : room.word}</h2></div>
        <div className="flex items-center gap-2">{props.remainingSeconds !== null && (room.phase === "writing" || room.phase === "voting") && <span className={`rounded-lg px-3 py-2 text-sm font-black ${props.remainingSeconds <= 10 ? "bg-rose-100 text-rose-800" : "bg-amber-100 text-amber-900"}`}>残り {props.remainingSeconds}秒</span>}<span className="rounded-lg bg-slate-100 px-3 py-2 text-sm font-bold text-slate-700">{room.phase}</span></div>
      </div>
      {props.isDebugMode && <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
        <p className="font-bold">デバッグモード中</p><p className="mt-1">{debugStatus}</p><p className="mt-1 text-xs font-semibold text-amber-800">デバッグ操作はトップバーのDEBUGメニューにあります。</p>
      </div>}
    </div>
    {room.phase === "lobby" && <div className={panelClass}>
      <div className="flex flex-wrap items-end justify-between gap-2"><div><p className="text-xs font-semibold uppercase text-amber-700">Players</p><h2 className="text-2xl font-black text-slate-950">参加者</h2></div>{room.lobbyReturn && <span className="rounded-full bg-cyan-100 px-3 py-1 text-sm font-black text-cyan-900">復帰 {returnedPlayerIds.size}/{room.players.length}人</span>}</div>
      {room.lobbyReturn && <p className="mt-2 text-sm font-semibold text-slate-600">{returnStatusLabel}です。全員が「戻りました」になると、同じメンバーがロビーを開けています。</p>}
      <div className="mt-3 grid gap-2 sm:grid-cols-2">{room.players.map((player) => <div key={player.id} className="flex items-center justify-between gap-3 rounded-lg bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-800"><span>{player.name}<span className={`ml-2 ${room.playMode === "all-vote" || player.id === room.answererId ? "text-cyan-700" : "text-slate-500"}`}>{room.playMode === "all-vote" ? "偽説明・投票" : player.id === room.answererId ? "回答者" : room.answererMode === "random" ? "回答者候補・偽説明" : "偽説明"}</span></span>{room.lobbyReturn && <span className="flex shrink-0 items-center gap-1"><span className={`rounded-full px-2 py-1 text-xs font-black ${returnedPlayerIds.has(player.id) ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>{returnedPlayerIds.has(player.id) ? "戻りました" : "復帰待ち"}</span>{props.isHost && player.id !== room.hostId && !returnedPlayerIds.has(player.id) && <button type="button" onClick={() => props.onRemoveWaitingPlayer(player.id, player.name)} className="rounded-lg border border-rose-300 bg-white px-2 py-1 text-xs font-black text-rose-700 hover:bg-rose-50">退出</button>}</span>}</div>)}</div>
    </div>}
  </>;
}

import type { TahoiyaPlayer, TahoiyaRoom } from "@/lib/tahoiya-types";
import { inputClass, panelClass } from "../wordwolf/styles";

type Reason = { value: string; label: string };
type Props = {
  room: TahoiyaRoom; isAnswerer: boolean; remainingSeconds: number | null;
  isDebugMode: boolean; isHost: boolean; nextWriter: TahoiyaPlayer | null | undefined; nextVoter: TahoiyaPlayer | null | undefined;
  skipReason: string; skipComment: string; skipReasons: Reason[]; isSkipping: boolean;
  onReasonChange: (value: string) => void; onCommentChange: (value: string) => void; onSkip: () => void;
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
        <p className="font-bold">デバッグモード中</p><p className="mt-1">{debugStatus}</p>
        {props.isHost && room.phase !== "lobby" && <div className="mt-3 border-t border-amber-200 pt-3">
          <p className="font-bold">お題をスキップ</p><p className="mt-1 text-xs leading-5 text-amber-800">問題点をフィードバックへ保存して、同じ設定の次のお題へ進みます。</p>
          <select value={props.skipReason} onChange={(event) => props.onReasonChange(event.target.value)} disabled={props.isSkipping} className={`mt-2 ${inputClass}`}><option value="">スキップ理由を選択</option>{props.skipReasons.map((reason) => <option key={reason.value} value={reason.value}>{reason.label}</option>)}</select>
          <textarea value={props.skipComment} onChange={(event) => props.onCommentChange(event.target.value)} disabled={props.isSkipping} maxLength={800} placeholder="補足（任意）" className={`mt-2 min-h-20 resize-y ${inputClass}`} />
          <button type="button" onClick={props.onSkip} disabled={!props.skipReason || props.isSkipping} className="mt-2 w-full rounded-lg border border-rose-300 bg-white px-3 py-2 text-sm font-bold text-rose-700 disabled:cursor-not-allowed disabled:opacity-50">{props.isSkipping ? "保存して次のお題を準備中..." : "フィードバックを保存して次のお題へ"}</button>
        </div>}
      </div>}
    </div>
    {room.phase === "lobby" && <div className={panelClass}>
      <div className="flex flex-wrap items-end justify-between gap-2"><div><p className="text-xs font-semibold uppercase text-amber-700">Players</p><h2 className="text-2xl font-black text-slate-950">参加者</h2></div>{room.lobbyReturn && <span className="rounded-full bg-cyan-100 px-3 py-1 text-sm font-black text-cyan-900">復帰 {returnedPlayerIds.size}/{room.players.length}人</span>}</div>
      {room.lobbyReturn && <p className="mt-2 text-sm font-semibold text-slate-600">{returnStatusLabel}です。全員が「戻りました」になると、同じメンバーがロビーを開けています。</p>}
      <div className="mt-3 grid gap-2 sm:grid-cols-2">{room.players.map((player) => <div key={player.id} className="flex items-center justify-between gap-3 rounded-lg bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-800"><span>{player.name}<span className={`ml-2 ${room.playMode === "all-vote" || player.id === room.answererId ? "text-cyan-700" : "text-slate-500"}`}>{room.playMode === "all-vote" ? "偽説明・投票" : player.id === room.answererId ? "回答者" : room.answererMode === "random" ? "回答者候補・偽説明" : "偽説明"}</span></span>{room.lobbyReturn && <span className={`shrink-0 rounded-full px-2 py-1 text-xs font-black ${returnedPlayerIds.has(player.id) ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>{returnedPlayerIds.has(player.id) ? "戻りました" : "復帰待ち"}</span>}</div>)}</div>
    </div>}
  </>;
}

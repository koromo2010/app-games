import type { Room } from "@/lib/wordwolf-game-types";
import { panelClass } from "./styles";

type Props = {
  room: Room;
  isHost: boolean;
  isMyClueTurn: boolean;
  isMyVoteTurn: boolean;
  isMyFinalAnswerTurn: boolean;
  isRunoffVote: boolean;
  clueSubmittedCount: number;
  clueParticipantCount: number;
  votedCount: number;
  voteVoterCount: number;
  currentPlayerName?: string;
  activePlayerName?: string;
  nextVotePlayerName?: string;
  finalAnswerPlayerName?: string;
  accusedPlayerName?: string;
  ownWord?: string;
  roundProgressLabel: string;
  resultTitle: string;
  isDebugMode: boolean;
};

export function WordWolfPhaseStatus(props: Props) {
  const { room } = props;
  const isMyActionTurn = props.isMyClueTurn || props.isMyVoteTurn || props.isMyFinalAnswerTurn;
  const phaseVisual = room.phase === "clue"
    ? { label: room.clueMode === "simultaneous" ? "同時投稿モード" : "投稿モード", title: props.isMyClueTurn ? "あなたの投稿待ちです" : "発言を待っています", detail: room.clueMode === "simultaneous" ? `この周の投稿 ${props.clueSubmittedCount}/${props.clueParticipantCount}` : props.currentPlayerName ? `現在の手番: ${props.currentPlayerName}` : "手番を確認中", className: "border-cyan-200 bg-cyan-50 text-cyan-950", pillClassName: "bg-cyan-600 text-white" }
    : room.phase === "vote"
      ? { label: props.isRunoffVote ? "決選投票モード" : "投票モード", title: props.isMyVoteTurn ? "あなたの投票待ちです" : "投票を待っています", detail: `投票 ${props.votedCount}/${props.voteVoterCount}`, className: "border-violet-200 bg-violet-50 text-violet-950", pillClassName: "bg-violet-600 text-white" }
      : room.phase === "wolfGuess"
        ? { label: "逆転回答モード", title: props.isMyFinalAnswerTurn ? "狼の逆転回答待ちです" : "逆転回答を待っています", detail: props.accusedPlayerName ? `投票対象: ${props.accusedPlayerName}` : "投票結果を確認中", className: "border-amber-200 bg-amber-50 text-amber-950", pillClassName: "bg-amber-600 text-white" }
        : room.phase === "result"
          ? { label: "結果発表", title: props.resultTitle, detail: "投票結果とお題を確認できます", className: "border-emerald-200 bg-emerald-50 text-emerald-950", pillClassName: "bg-emerald-600 text-white" }
          : { label: "ロビー", title: "ゲーム開始前です", detail: props.isHost ? "ルールを設定してゲームを開始できます" : "ホストの開始を待っています", className: "border-slate-200 bg-slate-50 text-slate-950", pillClassName: "bg-slate-800 text-white" };

  return <>
    <div className={`rounded-lg border p-4 shadow-[0_18px_50px_rgba(15,23,42,0.12)] ${phaseVisual.className}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div><p className={`inline-flex rounded-full px-3 py-1 text-xs font-black ${phaseVisual.pillClassName}`}>{phaseVisual.label}</p><h2 className="mt-3 text-3xl font-black tracking-normal">{phaseVisual.title}</h2><p className="mt-1 text-sm font-semibold opacity-80">{phaseVisual.detail}</p></div>
        {isMyActionTurn && <div className="rounded-lg border border-white/70 bg-white/80 px-4 py-3 text-center shadow-sm"><span className="inline-flex h-3 w-3 animate-ping rounded-full bg-cyan-500" aria-hidden="true" /><p className="mt-2 text-sm font-black text-slate-950">あなたの番です</p></div>}
      </div>
    </div>
    <div className={`${panelClass} ${isMyActionTurn ? "border-cyan-300 bg-cyan-50/95 shadow-[0_0_0_3px_rgba(34,211,238,0.18),0_18px_50px_rgba(8,145,178,0.18)] animate-pulse" : ""}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div><p className="text-xs font-semibold uppercase text-cyan-700">Active player</p><p className="text-2xl font-black text-slate-950">{props.activePlayerName ?? "未選択"}</p></div>
        <div className="grid grid-cols-3 gap-2 text-center text-sm sm:w-[360px]">
          <div className="rounded-lg bg-slate-100 px-2 py-2"><p className="text-xs text-slate-500">人数</p><p className="font-bold text-slate-950">{room.players.length}</p></div>
          <div className="rounded-lg bg-slate-100 px-2 py-2"><p className="text-xs text-slate-500">周回</p><p className="font-bold text-slate-950">{props.roundProgressLabel}</p></div>
          <div className="rounded-lg bg-slate-100 px-2 py-2"><p className="text-xs text-slate-500">投票</p><p className="font-bold text-slate-950">{props.votedCount}/{props.voteVoterCount}</p></div>
        </div>
      </div>
      {props.ownWord && <div className={`mt-4 rounded-lg border p-4 ${isMyActionTurn ? "border-cyan-300 bg-white shadow-sm" : "border-cyan-200 bg-cyan-50"}`}><p className="text-xs font-semibold uppercase text-cyan-700">Your topic</p><p className="mt-1 text-3xl font-black text-cyan-950">{props.ownWord}</p></div>}
      {props.isDebugMode && <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950"><p className="font-semibold">デバッグモード</p>{room.phase === "clue" && props.currentPlayerName && <p className="mt-1">現在の手番「{props.currentPlayerName}」として投稿します。</p>}{room.phase === "vote" && props.nextVotePlayerName && <p className="mt-1">次の投票者「{props.nextVotePlayerName}」として投票します。</p>}{room.phase === "wolfGuess" && props.finalAnswerPlayerName && <p className="mt-1">狼「{props.finalAnswerPlayerName}」として逆転回答します。</p>}</div>}
    </div>
    {room.phase === "lobby" && <div className={panelClass}><p className="text-xs font-semibold uppercase text-cyan-700">Lobby</p><h2 className="mt-1 text-2xl font-black text-slate-950">ロビー</h2><p className="mt-2 text-sm leading-6 text-slate-600">部屋コードを共有して参加してもらいます。1人で動作確認するときは、デバッグモードをONにしてください。</p></div>}
  </>;
}

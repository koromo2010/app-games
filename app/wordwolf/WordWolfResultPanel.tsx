import { GameFeedbackPanel } from "../components/GameFeedbackPanel";
import { RoomResultActions } from "../components/RoomResultActions";
import type { Room } from "@/lib/wordwolf-game-types";
import { VoteHistoryPanel } from "./WordWolfPanels";
import { panelClass } from "./styles";

const feedbackReasons = [
  { value: "distance-too-close", label: "距離が近すぎる", rating: "bad" as const },
  { value: "distance-too-far", label: "距離が遠すぎる", rating: "bad" as const },
  { value: "type-mismatch", label: "種類・型が揃っていない", rating: "bad" as const },
  { value: "too-obscure", label: "片方がマイナー", rating: "bad" as const },
  { value: "too-obvious", label: "答えが露骨すぎる", rating: "bad" as const },
  { value: "conversation-flat", label: "会話が広がらない", rating: "bad" as const },
  { value: "duplicate", label: "お題が重複している", rating: "bad" as const },
  { value: "inappropriate", label: "不適切・扱いにくい", rating: "bad" as const },
  { value: "distance-good", label: "ちょうどよい距離", rating: "good" as const },
  { value: "conversation-good", label: "会話が盛り上がった", rating: "good" as const },
  { value: "familiar", label: "知名度がちょうどよい", rating: "good" as const },
  { value: "other", label: "その他" },
];

type Props = {
  room: Room;
  resultTitle: string;
  hasWolf: boolean;
  wolfPlayers: Room["players"];
  accusedPlayerName?: string;
  accusedIsWolf: boolean;
  topicSourceLabel: string;
  feedbackPlayerId: string;
  wolfCount: number;
  guessFeedbackMessage: string;
  isGuessFeedbackSaving: boolean;
  onGuessFeedback: (accepted: boolean) => void;
  canReturnToRoom: boolean;
  isHost: boolean;
  isRoomDissolved: boolean;
  onReturnToRoom: () => void;
  onDissolve?: () => void;
};

export function WordWolfResultPanel({ room, resultTitle, hasWolf, wolfPlayers, accusedPlayerName, accusedIsWolf, topicSourceLabel, feedbackPlayerId, wolfCount, guessFeedbackMessage, isGuessFeedbackSaving, onGuessFeedback, canReturnToRoom, isHost, isRoomDissolved, onReturnToRoom, onDissolve }: Props) {
  return (
    <div className={panelClass}>
      <p className="text-xs font-semibold uppercase text-cyan-700">Result</p>
      <h2 className="mt-1 text-3xl font-black text-slate-950">{resultTitle}</h2>
      <p className="mt-3 text-sm leading-6 text-slate-700">{room.resultText}</p>
      <VoteHistoryPanel room={room} />
      {hasWolf && room.wolfGuess && (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div><p className="text-xs font-semibold uppercase text-amber-700">Final answer review</p><h3 className="mt-1 text-lg font-black text-slate-950">逆転回答の判定</h3></div>
            <span className={`rounded-full px-3 py-1 text-xs font-bold ${room.wolfGuessJudgement?.accepted ? "bg-cyan-100 text-cyan-900" : "bg-rose-100 text-rose-900"}`}>
              {room.wolfGuessJudgement?.accepted ? "正解扱い" : "不正解扱い"}
            </span>
          </div>
          <dl className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg bg-white/70 p-3"><dt className="text-xs font-semibold text-slate-500">実回答</dt><dd className="mt-1 text-lg font-bold text-slate-950">{room.wolfGuess}</dd></div>
            <div className="rounded-lg bg-white/70 p-3"><dt className="text-xs font-semibold text-slate-500">正解</dt><dd className="mt-1 text-lg font-bold text-slate-950">{room.villageWord}</dd></div>
          </dl>
          {room.wolfGuessJudgement && <p className="mt-3 text-sm leading-6 text-slate-700">判定理由: {room.wolfGuessJudgement.reason} / source: {room.wolfGuessJudgement.source} / confidence: {Math.round(room.wolfGuessJudgement.confidence * 100)}%</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" disabled={isGuessFeedbackSaving} onClick={() => onGuessFeedback(true)} className="rounded-lg border border-cyan-200 bg-cyan-100 px-3 py-2 text-sm font-bold text-cyan-950 transition hover:bg-cyan-50 disabled:opacity-50">正解扱いで記憶</button>
            <button type="button" disabled={isGuessFeedbackSaving} onClick={() => onGuessFeedback(false)} className="rounded-lg border border-rose-200 bg-rose-100 px-3 py-2 text-sm font-bold text-rose-950 transition hover:bg-rose-50 disabled:opacity-50">不正解扱いで記憶</button>
          </div>
          {guessFeedbackMessage && <p className="mt-2 text-sm font-semibold text-slate-700">{guessFeedbackMessage}</p>}
        </div>
      )}
      <dl className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg bg-slate-100 p-3"><dt className="text-xs text-slate-500">村側のお題</dt><dd className="mt-1 text-lg font-bold text-slate-950">{room.villageWord}</dd></div>
        {hasWolf ? <>
          <div className="rounded-lg bg-slate-100 p-3"><dt className="text-xs text-slate-500">狼のお題</dt><dd className="mt-1 text-lg font-bold text-slate-950">{room.wolfWord}</dd></div>
          <div className="rounded-lg bg-slate-100 p-3"><dt className="text-xs text-slate-500">狼</dt><dd className="mt-1 text-lg font-bold text-slate-950">{wolfPlayers.map((player) => player.name).join("、") || "なし"}</dd></div>
        </> : <div className="rounded-lg bg-slate-100 p-3 sm:col-span-2"><dt className="text-xs text-slate-500">投票で選ばれた人</dt><dd className="mt-1 text-lg font-bold text-slate-950">{accusedPlayerName ?? "なし"}</dd></div>}
      </dl>
      <p className="mt-3 text-xs leading-5 text-slate-500">お題理由: {room.topicReason} / 取得元: {topicSourceLabel}</p>
      {room.topicGeneration && feedbackPlayerId && <GameFeedbackPanel artifactId={`wordwolf:${room.code}:${room.gameNumber}:${room.villageWord}:${room.wolfWord}`} artifactText={`村側=${room.villageWord} / 狼側=${room.wolfWord} / 理由=${room.topicReason}`} game="wordwolf" task="wordwolf.topic" playerId={feedbackPlayerId} generation={room.topicGeneration} reasonOptions={feedbackReasons} settings={{ dictionarySource: room.topicDictionarySource, pairDistance: room.topicPairDistance, difficulty: room.topicDifficulty, topicHint: room.topicHint, anchorWordId: room.topicAnchorWordId ?? "", anchorWord: room.topicAnchorWord ?? "", partnerWordId: room.topicPartnerWordId ?? "", playerCount: room.players.length, wolfCount }} outcome={{ winner: room.winner ?? "unknown", accusedIsWolf, voteRounds: room.voteHistory.length }} />}
      <RoomResultActions canReturnToRoom={canReturnToRoom} isHost={isHost} isRoomDissolved={isRoomDissolved} onReturnToRoom={onReturnToRoom} onDissolve={onDissolve} />
    </div>
  );
}

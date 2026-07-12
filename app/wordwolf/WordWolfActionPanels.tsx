import type { KeyboardEventHandler } from "react";
import type { Player, Room } from "@/lib/wordwolf-game-types";
import { cyanButtonClass, inputClass } from "./styles";

type WordWolfActionPanelsProps = {
  room: Room;
  currentPlayer: Player | null;
  runoffCandidateNames: string;
  clueSubmittedCount: number;
  clueParticipantCount: number;
  turnSecondsLeft: number | null;
  clueInput: string;
  setClueInput: (value: string) => void;
  onClueKeyDown: KeyboardEventHandler<HTMLTextAreaElement>;
  onSubmitClue: () => void;
  canSubmitClue: boolean;
  isMyClueTurn: boolean;
  isMyVoteTurn: boolean;
  isRunoffVote: boolean;
  votedCount: number;
  voteVoterCount: number;
  voteDisplayPlayer: Player | null;
  voteActor: Player | null;
  isDebugMode: boolean;
  voteCandidates: Player[];
  selectedVoteTargetId?: string;
  onCastVote: (playerId: string) => void;
  isMyFinalAnswerTurn: boolean;
  accusedPlayer: Player | null;
  guessInput: string;
  setGuessInput: (value: string) => void;
  onGuessKeyDown: KeyboardEventHandler<HTMLInputElement>;
  onSubmitGuess: () => void;
  isGuessJudging: boolean;
};

export function WordWolfActionPanels(props: WordWolfActionPanelsProps) {
  const {
    room,
    currentPlayer,
    runoffCandidateNames,
    clueSubmittedCount,
    clueParticipantCount,
    turnSecondsLeft,
    clueInput,
    setClueInput,
    onClueKeyDown,
    onSubmitClue,
    canSubmitClue,
    isMyClueTurn,
    isMyVoteTurn,
    isRunoffVote,
    votedCount,
    voteVoterCount,
    voteDisplayPlayer,
    voteActor,
    isDebugMode,
    voteCandidates,
    selectedVoteTargetId,
    onCastVote,
    isMyFinalAnswerTurn,
    accusedPlayer,
    guessInput,
    setGuessInput,
    onGuessKeyDown,
    onSubmitGuess,
    isGuessJudging,
  } = props;

  if (room.phase === "clue") {
    return (
      <div className={`rounded-lg border p-4 shadow-[0_18px_50px_rgba(15,23,42,0.16)] ${isMyClueTurn ? "border-cyan-300 bg-cyan-50/95" : "border-white/10 bg-white/[0.96]"}`}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase text-cyan-700">
              {room.clueMode === "simultaneous" ? "Simultaneous post" : "Current turn"}
            </p>
            <h2 className="mt-1 text-3xl font-black text-slate-950">
              {room.runoffCandidateIds?.length
                ? "決選前の追加発言"
                : room.clueMode === "simultaneous"
                  ? "全員同時投稿"
                  : currentPlayer?.name}
            </h2>
          </div>
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-950">
            {room.runoffCandidateIds?.length && room.currentRound > room.roundsTotal ? "追加発言" : `${room.currentRound}周目`}
          </p>
        </div>
        {room.runoffCandidateIds?.length ? (
          <div className="mt-3 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-sm leading-6 text-violet-950">
            <p className="font-black">同率投票です。もう一度発言してから決選投票します。</p>
            <p className="mt-1 font-semibold">対象: {runoffCandidateNames || "同率の候補"}</p>
          </div>
        ) : null}
        {room.clueMode === "simultaneous" && (
          <p className="mt-3 text-sm leading-6 text-slate-600">
            この周の投稿: {clueSubmittedCount}/{clueParticipantCount}
          </p>
        )}
        {turnSecondsLeft !== null && (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-950">
            残り {turnSecondsLeft} 秒
          </div>
        )}
        <textarea
          value={clueInput}
          onChange={(event) => setClueInput(event.target.value)}
          onKeyDown={onClueKeyDown}
          disabled={!canSubmitClue}
          className={`mt-4 min-h-28 resize-y ${inputClass} ${isMyClueTurn ? "border-cyan-400 bg-white ring-2 ring-cyan-400/20" : ""}`}
          placeholder="お題そのものを言わずに関連することを書き込む"
        />
        <button
          onClick={onSubmitClue}
          disabled={!clueInput.trim() || !canSubmitClue}
          className={`mt-3 ${cyanButtonClass}`}
        >
          {room.clueMode === "simultaneous" ? "投稿する" : "投稿して次へ"}
        </button>
      </div>
    );
  }

  if (room.phase === "vote") {
    return (
      <div className={`rounded-lg border p-4 shadow-[0_18px_50px_rgba(15,23,42,0.16)] ${isMyVoteTurn ? "border-violet-300 bg-violet-50/95" : "border-white/10 bg-white/[0.96]"}`}>
        <p className="text-xs font-semibold uppercase text-violet-700">Vote</p>
        <h2 className="mt-1 text-2xl font-black text-slate-950">
          {isRunoffVote ? "決選投票" : room.gameMode === "may-no-wolf" ? "追放投票" : "誰が狼か投票"}
        </h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          全員が同時に投票できます。投票: {votedCount}/{voteVoterCount}
        </p>
        {voteDisplayPlayer && room.votes[voteDisplayPlayer.id] ? (
          <p className="mt-1 text-sm font-semibold text-cyan-700">投票済みです。他のプレイヤーを待っています。</p>
        ) : null}
        {isDebugMode && voteActor ? (
          <p className="mt-1 text-sm font-semibold text-slate-600">{voteActor.name}の投票を操作中</p>
        ) : null}
        {isRunoffVote && (
          <div className="mt-3 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-sm leading-6 text-violet-950">
            <p className="font-black">同率投票のため決選投票です。</p>
            <p className="mt-1 font-semibold">対象: {runoffCandidateNames || "同率の候補"}。候補以外のプレイヤーだけが投票します。</p>
          </div>
        )}
        {turnSecondsLeft !== null && (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-950">
            残り {turnSecondsLeft} 秒
          </div>
        )}
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {voteCandidates.map((player) => (
            <button
              key={player.id}
              onClick={() => onCastVote(player.id)}
              disabled={!voteActor}
              className={`rounded-lg border px-3 py-3 text-left font-semibold disabled:cursor-not-allowed disabled:opacity-50 ${
                selectedVoteTargetId === player.id
                  ? "border-violet-500 bg-violet-100 text-violet-950"
                  : "border-slate-200 bg-white text-slate-800 hover:bg-violet-50"
              }`}
            >
              {player.name}
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (room.phase === "wolfGuess") {
    return (
      <div className={`rounded-lg border border-amber-200 bg-amber-50 p-5 shadow-[0_18px_50px_rgba(120,53,15,0.16)] ${isMyFinalAnswerTurn ? "animate-pulse ring-4 ring-amber-300/30" : ""}`}>
        <p className="text-xs font-semibold uppercase text-amber-700">Final chance</p>
        <h2 className="mt-1 text-2xl font-black text-slate-950">狼が見つかりました</h2>
        <p className="mt-2 text-sm leading-6 text-slate-700">
          投票対象は {accusedPlayer?.name} です。狼は村側のお題を当てれば逆転勝利です。
        </p>
        {turnSecondsLeft !== null && (
          <div className="mt-4 rounded-lg border border-amber-300 bg-white/70 px-3 py-2 text-sm font-semibold text-amber-950">
            残り {turnSecondsLeft} 秒
          </div>
        )}
        <input
          value={guessInput}
          onChange={(event) => setGuessInput(event.target.value)}
          onKeyDown={onGuessKeyDown}
          disabled={!isMyFinalAnswerTurn}
          className="mt-4 w-full rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 disabled:bg-amber-100"
          placeholder="村側のお題を入力"
        />
        <button
          onClick={onSubmitGuess}
          disabled={isGuessJudging || !guessInput.trim() || !isMyFinalAnswerTurn}
          className="mt-3 rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-amber-500 disabled:bg-slate-300"
        >
          {isGuessJudging ? "判定中..." : "回答する"}
        </button>
      </div>
    );
  }

  return null;
}

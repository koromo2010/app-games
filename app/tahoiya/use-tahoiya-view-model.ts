import { useMemo } from "react";
import type { TahoiyaPlayer, TahoiyaRoom } from "@/lib/tahoiya-types";
import { tahoiyaDifficultyLabel } from "@/lib/tahoiya-difficulty";

export function getAnswerer(room: TahoiyaRoom) { return room.playMode === "all-vote" ? null : room.players.find((player) => player.id === room.answererId) ?? null; }
export function getDefinitionWriters(room: TahoiyaRoom) { return room.playMode === "all-vote" ? room.players : room.players.filter((player) => player.id !== room.answererId); }
export function submittedCount(room: TahoiyaRoom) { return getDefinitionWriters(room).filter((player) => room.fakeDefinitions[player.id]).length; }
export function voterCount(room: TahoiyaRoom) { return room.playMode === "all-vote" ? room.players.filter((player) => room.votes[player.id]).length : room.answererId && room.votes[room.answererId] ? 1 : 0; }

export function useTahoiyaViewModel(room: TahoiyaRoom | null, activePlayer: TahoiyaPlayer | null, selectedOptionId: string, now: number) {
  return useMemo(() => {
    const isAllVoteMode = room?.playMode === "all-vote";
    const answererCandidates = room?.players ?? [];
    const answerer = room ? getAnswerer(room) : null;
    const isAnswerer = Boolean(room && !isAllVoteMode && activePlayer?.id === room.answererId);
    const hasActivePlayerSubmitted = Boolean(room && activePlayer && room.fakeDefinitions[activePlayer.id]);
    const hasActivePlayerVoted = Boolean(room && activePlayer && room.votes[activePlayer.id]);
    const savedVoteOptionId = room && activePlayer ? room.votes[activePlayer.id] ?? "" : "";
    const definitionWriters = room ? getDefinitionWriters(room) : [];
    const definitionWriterCount = definitionWriters.length;
    const writingDone = room ? submittedCount(room) >= definitionWriterCount : false;
    const voterTarget = room?.playMode === "all-vote" ? room.players.length : 1;
    const votingDone = room ? voterCount(room) >= voterTarget : false;
    const deadline = room?.phaseStartedAt && room.actionTimeLimitSeconds > 0 ? room.phaseStartedAt + room.actionTimeLimitSeconds * 1000 : null;
    const nextWriter = room?.phase === "writing" ? definitionWriters.find((player) => !room.fakeDefinitions[player.id]) : null;
    const nextVoter = room?.phase === "voting" ? room.playMode === "all-vote" ? room.players.find((player) => !room.votes[player.id]) ?? null : answerer && !room.votes[answerer.id] ? answerer : null : null;
    const sortedScores = room ? [...room.players].sort((left, right) => (room.scores[right.id] ?? 0) - (room.scores[left.id] ?? 0)) : [];
    const roomConfigItems = room ? [
      { label: "遊び方", value: room.playMode === "all-vote" ? "全員作成・全員投票" : "回答者1人" },
      { label: "お題難易度", value: tahoiyaDifficultyLabel(room.topicDifficulty) },
      ...(room.playMode === "single-answerer" ? [{ label: "回答者", value: answerer?.name ?? (room.answererMode === "random" ? "開始時にランダム" : "未指定") }] : []),
      { label: "正解情報", value: room.showRealDefinitionToWriters ? "偽説明担当に見せる" : "結果まで見せない" },
      { label: "偽説明", value: "1人1つ・全員完了まで修正可" }, { label: "投票", value: room.playMode === "all-vote" ? "1人1票・自分には投票不可" : "回答者のみ1票" },
      { label: "正解文の長さ", value: "10〜30字中心・40〜60字は低確率" }, { label: "制限時間", value: room.actionTimeLimitSeconds > 0 ? `${room.actionTimeLimitSeconds}秒` : "なし" },
    ] : [];
    return { isAllVoteMode, answererCandidates, answerer, isAnswerer, hasActivePlayerSubmitted, hasActivePlayerVoted, displayedVoteOptionId: selectedOptionId || savedVoteOptionId, definitionWriterCount, writingDone, voterTarget, votingDone, remainingSeconds: deadline ? Math.max(0, Math.ceil((deadline - now) / 1000)) : null, nextWriter, nextVoter, sortedScores, roomConfigItems };
  }, [activePlayer, now, room, selectedOptionId]);
}

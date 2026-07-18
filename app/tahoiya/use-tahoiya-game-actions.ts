import type { Dispatch, SetStateAction } from "react";
import type { TahoiyaPlayer, TahoiyaRoom, TahoiyaRoomAction } from "@/lib/tahoiya-types";
import { allRoomPlayersReturned } from "@/lib/room-lobby-return";
import { applyTahoiyaSpecialAction } from "./tahoiya-room-adapter";
import { getAnswerer, getDefinitionWriters } from "./use-tahoiya-view-model";

type RunAction = (action: TahoiyaRoomAction, persistDefaults?: boolean) => Promise<TahoiyaRoom | null>;
type Setter = Dispatch<SetStateAction<string>>;
type Params = { room: TahoiyaRoom | null; activePlayer: TahoiyaPlayer | null; playerId: string; isHost: boolean; isDebugMode: boolean; isAnswerer: boolean; isAllVoteMode: boolean; writingDone: boolean; votingDone: boolean; definitionInput: string; selectedOptionId: string; isStarting: boolean; isPolishing: boolean; runRoomAction: RunAction; setRoom: Dispatch<SetStateAction<TahoiyaRoom | null>>; setActivePlayerId: Setter; setDefinitionInput: Setter; setSelectedOptionId: Setter; setPolishMessage: Setter; setMessage: Setter; setIsStarting: Dispatch<SetStateAction<boolean>>; setIsPolishing: Dispatch<SetStateAction<boolean>> };

export function useTahoiyaGameActions(params: Params) {
  const clearRoundInput = () => { params.setDefinitionInput(""); params.setPolishMessage(""); params.setSelectedOptionId(""); };
  const forceAdvanceToVoting = async () => { if (params.room?.phase !== "writing" || !params.isHost) return; await params.runRoomAction({ type: "advance-phase", actorId: params.playerId, round: params.room.round, target: "voting", force: params.isDebugMode }); params.setSelectedOptionId(""); };
  const forceAdvanceToResult = async () => { if (params.room?.phase === "voting" && params.isHost && params.isDebugMode) await params.runRoomAction({ type: "advance-phase", actorId: params.playerId, round: params.room.round, target: "result", force: true }); };
  const startRound = async () => {
    const room = params.room; if (!room || !params.isHost || params.isStarting || room.topicGenerationProgress) return;
    if (!allRoomPlayersReturned(room.lobbyReturn, room.players)) return params.setMessage("復帰待ちの参加者がいます。全員が戻ってから開始してください。");
    if (!room.debugMode && room.players.length < 2) return params.setMessage("ゲーム開始には2人以上が必要です。");
    if (room.playMode === "single-answerer" && room.answererMode === "manual" && !room.players.some((player) => player.id === room.answererId)) return params.setMessage("回答者を指定するか、ランダムで選ぶ設定にしてください。");
    params.setIsStarting(true); params.setMessage("");
    try { const started = await applyTahoiyaSpecialAction(room.code, { type: "start-round" }); params.setRoom(started); const writer = getDefinitionWriters(started)[0]; if (writer) params.setActivePlayerId(writer.id); clearRoundInput(); }
    catch (error) {
      params.setMessage(error instanceof Error && error.message && error.message !== "ROOM_ACTION_FAILED"
        ? error.message
        : "お題を生成してゲームを開始できませんでした。もう一度試してください。");
    }
    finally { params.setIsStarting(false); }
  };
  const submitDefinition = async () => {
    const room = params.room; if (!room || !params.activePlayer || params.isAnswerer || params.writingDone || !params.definitionInput.trim()) return;
    const saved = await params.runRoomAction({ type: "submit-definition", actorId: params.playerId, playerId: params.activePlayer.id, round: room.round, text: params.definitionInput.trim() }); if (!saved) return;
    if (params.isDebugMode) { const next = saved.phase === "voting" ? saved.playMode === "all-vote" ? saved.players[0] : getAnswerer(saved) : getDefinitionWriters(saved).find((player) => !saved.fakeDefinitions[player.id]); if (next) params.setActivePlayerId(next.id); }
    params.setDefinitionInput(""); params.setPolishMessage(""); if (saved.phase === "voting") params.setSelectedOptionId("");
  };
  const polishDefinition = async () => {
    const room = params.room; if (!room || params.isAnswerer || params.writingDone || !params.definitionInput.trim() || params.isPolishing) return;
    params.setIsPolishing(true); params.setPolishMessage("");
    try { const response = await fetch("/api/tahoiya/polish-definition", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ roomCode: room.code, text: params.definitionInput.trim() }) }); const data = await response.json() as { text?: string; provider?: string; model?: string; error?: string }; if (!response.ok || !data.text) return params.setPolishMessage(data.error || "偽説明を整えられませんでした。"); params.setDefinitionInput(data.text); params.setPolishMessage(`辞書調に整えました（${data.provider ?? "AI"} / ${data.model ?? "model"}）。内容を確認してから投稿してください。`); }
    catch { params.setPolishMessage("偽説明を整えられませんでした。"); } finally { params.setIsPolishing(false); }
  };
  const castVote = async () => {
    const room = params.room; const player = params.activePlayer; if (!room || !player || params.votingDone || (!params.isAllVoteMode && !params.isAnswerer) || !params.selectedOptionId) return;
    const option = room.options.find((item) => item.id === params.selectedOptionId); if (!option || option.authorId === player.id) return;
    const saved = await params.runRoomAction({ type: "cast-vote", actorId: params.playerId, playerId: player.id, round: room.round, optionId: option.id }); if (!saved) return;
    if (params.isDebugMode && saved.phase === "voting" && room.playMode === "all-vote") { const next = room.players.find((candidate) => !saved.votes[candidate.id]); if (next) params.setActivePlayerId(next.id); } params.setSelectedOptionId("");
  };
  const nextRound = async () => { if (!params.room) return; const saved = await params.runRoomAction({ type: "next-round", actorId: params.playerId }); if (saved) params.setActivePlayerId(params.playerId); clearRoundInput(); };
  const returnToLobby = async () => { if (!params.room) return; const saved = await params.runRoomAction({ type: "confirm-lobby-return", actorId: params.playerId }); if (saved) params.setActivePlayerId(params.playerId); clearRoundInput(); };
  return { forceAdvanceToVoting, forceAdvanceToResult, startRound, submitDefinition, polishDefinition, castVote, nextRound, returnToLobby };
}

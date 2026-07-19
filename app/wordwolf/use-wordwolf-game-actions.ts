import { useCallback, useEffect, useRef, type Dispatch, type KeyboardEvent, type SetStateAction } from "react";
import { createGameTimerEventId } from "@/lib/game-timer/event";
import type { Room, WordWolfRoomAction } from "@/lib/wordwolf-game-types";
import { getVoteVoters } from "./game-flow";
import { castWordWolfVote, expireWordWolfPhase, startWordWolfGame, submitWordWolfClue, submitWordWolfGuessCommand } from "./wordwolf-room-api-client";
import { loadRoomFromStore, normalizeWolfIds, saveRoom } from "./wordwolf-room-adapter";

type Args = {
  room: Room | null; turnSecondsLeft: number | null; clueActorId: string; currentPlayerId: string; voteActorId: string; guessActorId: string;
  clueInput: string; guessInput: string; isGuessJudging: boolean; isStarting: boolean;
  setRoom: Dispatch<SetStateAction<Room | null>>; setClueInput: Dispatch<SetStateAction<string>>; setGuessInput: Dispatch<SetStateAction<string>>;
  setIsGuessJudging: Dispatch<SetStateAction<boolean>>; setIsStarting: Dispatch<SetStateAction<boolean>>;
  setGuessFeedbackMessage: Dispatch<SetStateAction<string>>; setError: Dispatch<SetStateAction<string>>;
  runRoomAction: (action: WordWolfRoomAction) => Promise<Room | null>;
};

export function useWordWolfGameActions(args: Args) {
  const timeoutActionKeyRef = useRef("");
  const startGame = async () => {
    if (!args.room || args.isStarting) return;
    args.setIsStarting(true); args.setError("");
    try {
      if (!args.room.debugMode && args.room.players.length < 3) { args.setError("デバッグモードOFFでは3人以上で開始してください。"); return; }
      const result = await startWordWolfGame(args.room.code, crypto.randomUUID()); args.setRoom(result.room); args.setError("");
    } catch { args.setError("ゲームを開始できませんでした。もう一度試してください。"); }
    finally { args.setIsStarting(false); }
  };
  const submitClue = useCallback(async (atTimeout = false) => {
    if (!args.room || args.room.phase !== "clue" || (!atTimeout && args.turnSecondsLeft === 0 && args.room.turnTimeLimitSeconds > 0)) return false;
    const text = args.clueInput.trim(); if (!args.clueActorId || !text) return false;
    try { const result = await submitWordWolfClue(args.room.code, args.clueActorId, text, crypto.randomUUID()); args.setClueInput(""); saveRoom(result.room); args.setRoom(result.room); return true; }
    catch { const latest = await loadRoomFromStore(args.room.code); if (latest) args.setRoom(latest); args.setError("発言を反映できませんでした。最新の状態を読み込みました。"); return false; }
  }, [args]);
  const expireCurrentPhase = useCallback(async (commandId: string) => {
    if (!args.room) return;
    const attempt = async (): Promise<void> => { try { const result = await expireWordWolfPhase(args.room!.code, commandId); if (result.room) { saveRoom(result.room); args.setRoom(result.room); } if (!result.applied && result.retryAfterMs && result.retryAfterMs > 0) window.setTimeout(() => void attempt(), result.retryAfterMs + 50); } catch { const latest = await loadRoomFromStore(args.room!.code); if (latest) args.setRoom(latest); } };
    await attempt();
  }, [args]);
  const castVote = useCallback(async (targetId: string) => {
    if (!args.room || args.room.phase !== "vote" || (args.turnSecondsLeft === 0 && args.room.turnTimeLimitSeconds > 0) || !args.voteActorId || !targetId) return;
    try { const result = await castWordWolfVote(args.room.code, args.voteActorId, targetId, crypto.randomUUID()); saveRoom(result.room); args.setRoom(result.room); }
    catch { const latest = await loadRoomFromStore(args.room.code); if (latest) args.setRoom(latest); args.setError("投票を反映できませんでした。最新の状態を読み込みました。"); }
  }, [args]);
  const submitWolfGuess = useCallback(async (isTimeout = false) => {
    if (!args.room || !args.guessActorId || !args.room.accusedId || args.guessActorId !== args.room.accusedId || !normalizeWolfIds(args.room).includes(args.guessActorId) || args.isGuessJudging) return;
    if (!isTimeout && args.turnSecondsLeft === 0 && args.room.turnTimeLimitSeconds > 0) return;
    const guess = args.guessInput.trim() || (isTimeout ? "時間切れ" : ""); if (!guess) return false;
    args.setIsGuessJudging(true); args.setGuessFeedbackMessage("");
    try { const result = await submitWordWolfGuessCommand(args.room.code, guess, crypto.randomUUID()); args.setGuessInput(""); args.setRoom(result.room); return true; }
    catch { args.setError("逆転回答を判定できませんでした。もう一度試してください。"); return false; }
    finally { args.setIsGuessJudging(false); }
  }, [args]);
  useEffect(() => {
    const room = args.room;
    const shouldExpire = room && room.turnTimeLimitSeconds > 0 && args.turnSecondsLeft === 0 && (
      (room.phase === "clue" && (room.clueMode !== "turn" || args.clueActorId === args.currentPlayerId)) ||
      (room.phase === "vote" && !getVoteVoters(room).every((player) => room.votes[player.id])) ||
      (room.phase === "wolfGuess" && Boolean(room.accusedId) && args.guessActorId === room.accusedId && normalizeWolfIds(room).includes(args.guessActorId))
    );
    if (!room || !shouldExpire) return;
    const key = createGameTimerEventId({ game: "wordwolf", roomCode: room.code, phase: room.phase, revision: room.revision, startedAt: room.currentTurnStartedAt });
    if (timeoutActionKeyRef.current === key) return; timeoutActionKeyRef.current = key;
    const timer = window.setTimeout(() => {
      const submitDraft = room.phase === "clue" && args.clueInput.trim()
        ? submitClue(true)
        : room.phase === "wolfGuess" && args.guessInput.trim()
          ? submitWolfGuess(true)
          : Promise.resolve(false);
      void submitDraft.then((saved) => { if (!saved) void expireCurrentPhase(key); });
    }, 0); return () => window.clearTimeout(timer);
  }, [args, expireCurrentPhase, submitClue, submitWolfGuess]);
  const isComposing = (event: KeyboardEvent<HTMLElement>) => event.nativeEvent.isComposing || event.keyCode === 229;
  const submitClueOnEnter = (event: KeyboardEvent<HTMLTextAreaElement>) => { if (event.key !== "Enter" || event.shiftKey || isComposing(event)) return; event.preventDefault(); void submitClue(); };
  const submitGuessOnEnter = (event: KeyboardEvent<HTMLInputElement>) => { if (event.key !== "Enter" || isComposing(event)) return; event.preventDefault(); void submitWolfGuess(); };
  const submitGuessFeedback = async (accepted: boolean) => { if (!args.room?.wolfGuess || !args.room.villageWord) return; args.setGuessFeedbackMessage(""); try { const response = await fetch("/api/wordwolf/guess-feedback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ roomCode: args.room.code, guess: args.room.wolfGuess, accepted }) }); if (!response.ok) throw new Error(); args.setGuessFeedbackMessage(accepted ? "正解扱いとして記憶しました。" : "不正解扱いとして記憶しました。"); } catch { args.setGuessFeedbackMessage("保存に失敗しました。あとでもう一度試してください。"); } };
  const resetRoom = async () => { if (args.room) { await args.runRoomAction({ type: "reset-game" }); args.setGuessInput(""); args.setClueInput(""); } };
  const abortGame = () => { if (args.room && args.room.phase !== "lobby") { void args.runRoomAction({ type: "abort-game" }); args.setGuessInput(""); args.setClueInput(""); } };
  return { startGame, submitClue, submitClueOnEnter, castVote, submitWolfGuess, submitGuessOnEnter, submitGuessFeedback, resetRoom, abortGame };
}

import { useCallback, useEffect, useRef, type Dispatch, type KeyboardEvent, type SetStateAction } from "react";
import { createGameTimerEventId } from "@/lib/game-timer/event";
import type { Room, WordWolfRoomAction } from "@/lib/wordwolf-game-types";
import { getVoteVoters } from "./game-flow";
import { castWordWolfVote, expireWordWolfPhase, startWordWolfGame, submitWordWolfClue, submitWordWolfGuessCommand, wordWolfCommandErrorDisposition } from "./wordwolf-room-api-client";
import { loadRoomFromStore, normalizeWolfIds, saveRoom } from "./wordwolf-room-adapter";
import type { GameplayActionWindowController } from "@/app/hooks/use-gameplay-action-window";

type Args = {
  room: Room | null; turnSecondsLeft: number | null; clueActorId: string; currentPlayerId: string; voteActorId: string; guessActorId: string;
  actionWindow: GameplayActionWindowController;
  clueInput: string; guessInput: string; isGuessJudging: boolean; isStarting: boolean; isVoteSubmitting: boolean;
  acceptRoom: (room: Room) => void; setClueInput: Dispatch<SetStateAction<string>>; setGuessInput: Dispatch<SetStateAction<string>>;
  setIsGuessJudging: Dispatch<SetStateAction<boolean>>; setIsStarting: Dispatch<SetStateAction<boolean>>; setIsVoteSubmitting: Dispatch<SetStateAction<boolean>>;
  setIsClueSubmitting: Dispatch<SetStateAction<boolean>>; setIsGuessFeedbackSaving: Dispatch<SetStateAction<boolean>>;
  setGuessFeedbackMessage: Dispatch<SetStateAction<string>>; setError: Dispatch<SetStateAction<string>>;
  runRoomAction: (action: WordWolfRoomAction) => Promise<Room | null>;
};

export function useWordWolfGameActions(args: Args) {
  const timeoutActionKeyRef = useRef("");
  const startPendingRef = useRef(false);
  const guessFeedbackPendingRef = useRef(false);
  const startGame = async () => {
    if (!args.room || args.isStarting || startPendingRef.current) return;
    const room = args.room;
    startPendingRef.current = true;
    args.setIsStarting(true); args.setError("");
    try {
      if (!room.debugMode && room.players.length < 3) { args.setError("デバッグモードOFFでは3人以上で開始してください。"); return; }
      const result = await startWordWolfGame(room, crypto.randomUUID()); args.acceptRoom(result.room); args.setError("");
    } catch { args.setError("ゲームを開始できませんでした。もう一度試してください。"); }
    finally { startPendingRef.current = false; args.setIsStarting(false); }
  };
  const submitClue = useCallback(async () => {
    if (!args.room || args.room.phase !== "clue") return false;
    const room = args.room;
    const text = args.clueInput.trim(); if (!args.clueActorId || !text) return false;
    const actorId = args.clueActorId;
    args.setIsClueSubmitting(true);
    const result = await args.actionWindow.dispatchManual({
      actionKey: `submit-clue:${actorId}`,
      execute: () => submitWordWolfClue(room, actorId, text, crypto.randomUUID()),
      classifyError: wordWolfCommandErrorDisposition,
    });
    try {
      if (result.kind === "accepted") {
        args.setClueInput("");
        args.acceptRoom(result.value.room);
        return true;
      }
      if (result.kind === "duplicate") return true;
      if (result.kind === "closed") return false;
      const latest = await loadRoomFromStore(room.code);
      if (latest) args.acceptRoom(latest);
      if (latest?.clues.some((clue) => clue.round === room.currentRound && clue.playerId === actorId)) {
        args.setClueInput("");
        args.setError("");
        return true;
      }
      args.setError(result.kind === "authoritative-expired"
        ? "受付期限を過ぎたため、サーバーの最新状態を読み込みました。"
        : "発言を反映できませんでした。最新の状態を読み込みました。");
      return false;
    } finally {
      args.setIsClueSubmitting(false);
    }
  }, [args]);
  const expireCurrentPhase = useCallback(async (commandId: string) => {
    if (!args.room) return;
    const roomCode = args.room.code;
    const attempt = async (): Promise<void> => { try { const result = await expireWordWolfPhase(roomCode, commandId); if (result.room) { saveRoom(result.room); args.acceptRoom(result.room); } if (!result.applied && result.retryAfterMs && result.retryAfterMs > 0) window.setTimeout(() => void attempt(), result.retryAfterMs + 50); } catch { const latest = await loadRoomFromStore(roomCode); if (latest) args.acceptRoom(latest); } };
    await attempt();
  }, [args]);
  const castVote = useCallback(async (targetId: string) => {
    if (!args.room || args.room.phase !== "vote" || !args.voteActorId || !targetId || args.isVoteSubmitting) return;
    const room = args.room;
    const roomCode = room.code;
    const actorId = args.voteActorId;
    args.setIsVoteSubmitting(true);
    args.setError("");
    const result = await args.actionWindow.dispatchManual({
      actionKey: `cast-vote:${actorId}`,
      execute: () => castWordWolfVote(room, actorId, targetId, crypto.randomUUID()),
      classifyError: wordWolfCommandErrorDisposition,
    });
    try {
      if (result.kind === "accepted") {
        args.acceptRoom(result.value.room);
        return;
      }
      if (result.kind === "duplicate" || result.kind === "closed") return;
      const latest = await loadRoomFromStore(roomCode);
      if (latest) args.acceptRoom(latest);
      if (latest?.votes[actorId]) args.setError("");
      else args.setError(result.kind === "authoritative-expired"
        ? "投票の受付期限を過ぎたため、サーバーの最新状態を読み込みました。"
        : "投票を反映できませんでした。最新の状態を読み込みました。");
    } finally {
      args.setIsVoteSubmitting(false);
    }
  }, [args]);
  const submitWolfGuess = useCallback(async (isTimeout = false) => {
    if (!args.room || !args.guessActorId || !args.room.accusedId || args.guessActorId !== args.room.accusedId || !normalizeWolfIds(args.room).includes(args.guessActorId)) return false;
    const room = args.room;
    const guess = args.guessInput.trim() || (isTimeout ? "時間切れ" : ""); if (!guess) return false;
    args.setIsGuessJudging(true); args.setGuessFeedbackMessage("");
    const result = await args.actionWindow.dispatchManual({
      actionKey: `submit-wolf-guess:${args.guessActorId}`,
      execute: () => submitWordWolfGuessCommand(room, guess, crypto.randomUUID()),
      classifyError: wordWolfCommandErrorDisposition,
    });
    try {
      if (result.kind === "accepted") {
        args.setGuessInput("");
        args.acceptRoom(result.value.room);
        return true;
      }
      if (result.kind === "duplicate") return true;
      if (result.kind === "closed") return false;
      const latest = await loadRoomFromStore(room.code);
      if (latest) args.acceptRoom(latest);
      if (latest?.phase === "result" && latest.wolfGuess) {
        args.setGuessInput("");
        args.setError("");
        return true;
      }
      args.setError(result.kind === "authoritative-expired"
        ? "逆転回答の受付期限を過ぎたため、サーバーの最新状態を読み込みました。"
        : "逆転回答を判定できませんでした。もう一度試してください。");
      return false;
    } finally {
      args.setIsGuessJudging(false);
    }
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
        ? submitClue()
        : room.phase === "wolfGuess" && args.guessInput.trim()
          ? submitWolfGuess(true)
          : Promise.resolve(false);
      void submitDraft.then((saved) => { if (!saved) void expireCurrentPhase(key); });
    }, 0); return () => window.clearTimeout(timer);
  }, [args, expireCurrentPhase, submitClue, submitWolfGuess]);
  const isComposing = (event: KeyboardEvent<HTMLElement>) => event.nativeEvent.isComposing || event.keyCode === 229;
  const submitClueOnEnter = (event: KeyboardEvent<HTMLTextAreaElement>) => { if (event.key !== "Enter" || event.shiftKey || isComposing(event)) return; event.preventDefault(); void submitClue(); };
  const submitGuessOnEnter = (event: KeyboardEvent<HTMLInputElement>) => { if (event.key !== "Enter" || isComposing(event)) return; event.preventDefault(); void submitWolfGuess(); };
  const submitGuessFeedback = async (accepted: boolean) => {
    if (!args.room?.wolfGuess || !args.room.villageWord || guessFeedbackPendingRef.current) return;
    const room = args.room;
    guessFeedbackPendingRef.current = true;
    args.setIsGuessFeedbackSaving(true);
    args.setGuessFeedbackMessage("");
    try {
      const response = await fetch("/api/wordwolf/guess-feedback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ roomCode: room.code, guess: room.wolfGuess, accepted }) });
      if (!response.ok) throw new Error();
      args.setGuessFeedbackMessage(accepted ? "正解扱いとして記憶しました。" : "不正解扱いとして記憶しました。");
    } catch {
      args.setGuessFeedbackMessage("保存に失敗しました。あとでもう一度試してください。");
    } finally {
      guessFeedbackPendingRef.current = false;
      args.setIsGuessFeedbackSaving(false);
    }
  };
  const resetRoom = async () => { if (args.room) { await args.runRoomAction({ type: "reset-game" }); args.setGuessInput(""); args.setClueInput(""); } };
  const abortGame = () => { if (args.room && args.room.phase !== "lobby") { void args.runRoomAction({ type: "abort-game" }); args.setGuessInput(""); args.setClueInput(""); } };
  return { startGame, submitClue, submitClueOnEnter, castVote, submitWolfGuess, submitGuessOnEnter, submitGuessFeedback, resetRoom, abortGame };
}

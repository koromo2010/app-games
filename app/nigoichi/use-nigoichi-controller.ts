"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useOnlineGameSessionRestore } from "@/app/hooks/use-online-game-session-restore";
import { onlineRoomPollingIntervals, useOnlineRoomPolling } from "@/app/hooks/use-online-room-polling";
import { useRoomResultReturnGate } from "@/app/hooks/use-room-result-return-gate";
import { useRoomLobbyReturnConfirmation } from "@/app/hooks/use-room-lobby-return-confirmation";
import { confirmRoomLeave } from "@/app/components/room-navigation-confirmation";
import { applyNigoichiRoomAction, createNigoichiRoom, nigoichiRoomApi } from "./nigoichi-room-api-client";
import { clientTimeoutClaimDelayMs } from "@/lib/game-timer/client-policy";
import { commonGameTimeoutGraceMs } from "@/lib/game-timer/policy";
import {
  areValidNigoichiAssociations,
  nigoichiConfigBounds,
  nigoichiGuessIsCorrect,
  nigoichiMinimumPlayers,
  type NigoichiPlayer,
  type NigoichiRoom,
  type NigoichiRoomAction,
  type NigoichiRoomChoice,
} from "@/lib/nigoichi";
import { OnlineRoomApiError } from "@/lib/online-room-api-client";
import { preferLatestOnlineRoom } from "@/lib/online-room-client-state";
import { synchronizedNow } from "@/lib/server-clock";

const lastRoomKey = "nigoichi-last-room";
const ownerIdKey = "nigoichi-owner-id";

function makeRoomCode() {
  return Math.random().toString(36).slice(2, 6).toUpperCase();
}

function getOwnerId() {
  const saved = localStorage.getItem(ownerIdKey);
  if (saved) return saved;
  const created = crypto.randomUUID();
  localStorage.setItem(ownerIdKey, created);
  return created;
}

function apiMessage(error: unknown, fallback: string) {
  if (!(error instanceof OnlineRoomApiError)) return fallback;
  const payloadErrorCode = error.payload && typeof error.payload === "object" && "errorCode" in error.payload
    ? String((error.payload as { errorCode?: unknown }).errorCode ?? "")
    : "";
  if (error.status === 401) return "合言葉が違うか、ログインの有効期限が切れています。";
  if (error.status === 403) return "この操作を行う権限がありません。";
  if (error.status === 404) return "部屋が見つかりません。";
  if (error.status === 409) return "部屋が満員か、ほかの端末で状態が更新されました。もう一度お試しください。";
  if (payloadErrorCode === "NIGOICHI_WORDS_UNAVAILABLE") return "単語DBのGeneral Game Poolから、設定した難易度の単語を取得できませんでした。";
  if (error.status === 503) return "部屋サーバーを利用できません。少し待ってお試しください。";
  return fallback;
}

export function useNigoichiController() {
  const [room, setRoom] = useState<NigoichiRoom | null>(null);
  const { session, ready, isRestoringRoom } = useOnlineGameSessionRestore({ lastRoomKey, fetchActiveRoom: nigoichiRoomApi.fetchActiveRoom, fetchRoom: nigoichiRoomApi.fetchRoom, setRoom });
  const [error, setError] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [choices, setChoices] = useState<NigoichiRoomChoice[]>([]);
  const [showChoices, setShowChoices] = useState(false);
  const [newPlayerCapacity, setNewPlayerCapacity] = useState(3);
  const [associationDrafts, setAssociationDrafts] = useState<Record<string, string[]>>({});
  const timeoutAssociationKeyRef = useRef("");
  const [guessSelection, setGuessSelection] = useState<{ roundKey: string; number: number } | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const resultReturnGate = useRoomResultReturnGate({ room, setRoom, playerId: session?.id ?? "", resultPhase: "result", onReturnUnavailable: () => setError("部屋に戻れません。解散されたか、参加情報が変更されています。") });

  const roomCode = room?.code;
  const roomPhase = room?.phase;
  const roomGameNumber = room?.gameNumber;
  const playerId = session?.id ?? "";
  const guessRoundKey = `${roomCode ?? ""}:${roomGameNumber ?? 0}`;
  const selectedGuessNumber = roomPhase === "guess" && guessSelection?.roundKey === guessRoundKey
    ? guessSelection.number
    : null;

  useOnlineRoomPolling({
    game: "nigoichi",
    roomCode: playerId && !resultReturnGate.isRoomDissolved ? roomCode : null,
    intervalMs: roomPhase === "lobby" || roomPhase === "result" ? onlineRoomPollingIntervals.idle : onlineRoomPollingIntervals.active,
    fetchRoom: (code) => nigoichiRoomApi.fetchRoom(code, playerId),
    onRoom: resultReturnGate.acceptIncomingRoom,
    onMissing: () => {
      localStorage.removeItem(lastRoomKey);
      if (resultReturnGate.markRoomDissolved()) {
        setError("部屋が解散されました。結果画面はこのまま確認できます。");
        return;
      }
      setRoom(null);
      setError("部屋が解散されたか、参加情報がなくなりました。");
    },
  });

  const isHost = Boolean(room && room.hostId === playerId);
  const myHand = room?.hands[playerId] ?? null;
  const submittedAssociations = room ? Object.keys(room.associations).length : 0;
  const submittedGuesses = room ? Object.keys(room.guesses).length : 0;
  const correctCount = room?.phase === "result" ? room.players.filter((player) => nigoichiGuessIsCorrect(room, player.id)).length : 0;
  const roomConfigPlayerCount = Math.max(nigoichiMinimumPlayers, room?.players.length ?? nigoichiMinimumPlayers);
  const roomBounds = room ? nigoichiConfigBounds(roomConfigPlayerCount, room.associationWordCount) : null;
  const roomTotalCards = room?.phase === "lobby"
    ? roomConfigPlayerCount * room.cardsPerPlayer + 1
    : room?.words.length ?? 0;
  const controllablePlayers = useMemo(() => {
    if (!room) return [];
    return room.players.filter((player) => player.id === playerId || (room.debugMode && isHost && player.isDummy));
  }, [isHost, playerId, room]);

  const runAction = useCallback(async (action: NigoichiRoomAction) => {
    if (!room || isSaving) return null;
    setIsSaving(true);
    setError("");
    try {
      const saved = await applyNigoichiRoomAction(room.code, action);
      setRoom((current) => preferLatestOnlineRoom(current, saved));
      return saved;
    } catch (caught) {
      setError(apiMessage(caught, "操作を保存できませんでした。"));
      return null;
    } finally {
      setIsSaving(false);
    }
  }, [isSaving, room]);
  useRoomLobbyReturnConfirmation({ room, playerId, confirmReturn: () => runAction({ type: "confirm-lobby-return", actorId: playerId }) });

  const timerPhaseStartedAt = room?.phaseStartedAt;
  const timerDurationSeconds = room?.phase === "clue"
    ? room.clueTimeLimitSeconds
    : room?.phase === "guess"
      ? room.guessTimeLimitSeconds
      : 0;
  const timerClaimDelayMs = room ? clientTimeoutClaimDelayMs({ playerId, hostId: room.hostId, playerIds: room.players.map((player) => player.id) }) : 0;

  useEffect(() => {
    if (!roomCode || !playerId || !timerPhaseStartedAt || timerDurationSeconds <= 0 || !roomPhase || !["clue", "guess"].includes(roomPhase)) return;
    const timer = window.setTimeout(() => {
      void applyNigoichiRoomAction(roomCode, { type: "expire-phase", actorId: playerId, phaseStartedAt: timerPhaseStartedAt })
        .then((saved) => setRoom((current) => current?.code === saved.code ? preferLatestOnlineRoom(current, saved) : current))
        .catch(() => undefined);
    }, Math.max(0, timerPhaseStartedAt + timerDurationSeconds * 1000 + commonGameTimeoutGraceMs() - synchronizedNow()) + 100 + timerClaimDelayMs);
    return () => window.clearTimeout(timer);
  }, [playerId, roomCode, roomPhase, timerClaimDelayMs, timerDurationSeconds, timerPhaseStartedAt]);

  useEffect(() => {
    if (!room || room.phase !== "clue" || !room.phaseStartedAt || room.clueTimeLimitSeconds <= 0 || room.associations[playerId]) return;
    const clues = Array.from({ length: room.associationWordCount }, (_, index) => associationDrafts[playerId]?.[index] ?? "");
    if (!clues.some((clue) => clue.trim())) return;
    const key = `${room.code}:${room.gameNumber}:${room.phaseStartedAt}:${playerId}`;
    const delay = Math.max(0, room.phaseStartedAt + room.clueTimeLimitSeconds * 1000 - synchronizedNow());
    const timer = window.setTimeout(() => {
      if (timeoutAssociationKeyRef.current === key) return;
      timeoutAssociationKeyRef.current = key;
      void applyNigoichiRoomAction(room.code, { type: "submit-timeout-associations", actorId: playerId, playerId, clues })
        .then((saved) => {
          setRoom((current) => current?.code === saved.code ? preferLatestOnlineRoom(current, saved) : current);
          setAssociationDrafts((current) => { const next = { ...current }; delete next[playerId]; return next; });
        })
        .catch(() => undefined);
    }, delay);
    return () => window.clearTimeout(timer);
  }, [associationDrafts, playerId, room]);

  const createRoom = async () => {
    if (!session?.id || isSaving) return;
    setIsSaving(true);
    setError("");
    const now = Date.now();
    const host: NigoichiPlayer = { id: session.id, name: session.name, joinedAt: now, avatarColor: session.avatarColor, avatarImage: session.avatarImage ?? undefined, shareNameAllowed: session.shareNameAllowed === true };
    const draft: NigoichiRoom = {
      code: makeRoomCode(), revision: 0, hostId: session.id, ownerId: getOwnerId(), passphrase: passphrase.trim(), phase: "lobby", players: [host], playerCapacity: newPlayerCapacity, gameNumber: 1, gameStartedAt: null,
      cardsPerPlayer: 2, associationWordCount: 1, wordDifficulty: "normal", clueTimeLimitSeconds: 0, guessTimeLimitSeconds: 0, phaseStartedAt: null,
      debugMode: false, debugReplayEnabled: false, words: [], hands: {}, associations: {}, guesses: {}, missingNumber: null,
      totalScores: { [host.id]: 0 }, roundScores: {}, roundHistory: [], debugLog: [], createdAt: now, updatedAt: now,
    };
    try {
      const data = await createNigoichiRoom(draft, session.id);
      setRoom(data.room);
      localStorage.setItem(lastRoomKey, data.room.code);
    } catch (caught) {
      setError(apiMessage(caught, "部屋を作成できませんでした。"));
    } finally {
      setIsSaving(false);
    }
  };

  const joinRoom = async (selectedCode?: string) => {
    if (!session?.id || isSaving) return;
    const code = (selectedCode ?? joinCode).trim().toUpperCase();
    if (code.length !== 4) { setError("4文字の部屋コードを入力してください。"); return; }
    setIsSaving(true);
    setError("");
    const player: NigoichiPlayer = { id: session.id, name: session.name, joinedAt: Date.now(), avatarColor: session.avatarColor, avatarImage: session.avatarImage ?? undefined, shareNameAllowed: session.shareNameAllowed === true };
    try {
      const saved = await applyNigoichiRoomAction(code, { type: "join-room", actorId: session.id, player, passphrase });
      setRoom(saved);
      setShowChoices(false);
      localStorage.setItem(lastRoomKey, saved.code);
    } catch (caught) {
      setError(apiMessage(caught, "部屋へ参加できませんでした。"));
    } finally {
      setIsSaving(false);
    }
  };

  const listRooms = async () => {
    setError("");
    try {
      const listed = await nigoichiRoomApi.fetchJoinableRooms();
      setChoices(listed);
      setShowChoices(true);
    } catch (caught) {
      setError(apiMessage(caught, "部屋一覧を取得できませんでした。"));
    }
  };

  const leaveRoom = async () => {
    if (!confirmRoomLeave()) return;
    const saved = await runAction({ type: "leave-room", actorId: playerId });
    if (!saved) return;
    setRoom(null);
    localStorage.removeItem(lastRoomKey);
  };

  const dissolveRoom = async () => {
    if (!room || !window.confirm("この部屋を解散しますか？")) return;
    setIsSaving(true);
    setError("");
    try {
      await nigoichiRoomApi.remove({ code: room.code, actorId: playerId });
      localStorage.removeItem(lastRoomKey);
      if (resultReturnGate.markRoomDissolved()) {
        setError("部屋を解散しました。結果画面はこのまま確認できます。");
        return;
      }
      setRoom(null);
    } catch (caught) {
      setError(apiMessage(caught, "部屋を解散できませんでした。"));
    } finally {
      setIsSaving(false);
    }
  };

  const submitAssociations = (targetId: string) => {
    if (!room) return;
    const clues = Array.from({ length: room.associationWordCount }, (_, index) => (associationDrafts[targetId]?.[index] ?? "").trim());
    if (!areValidNigoichiAssociations(clues, room.associationWordCount)) {
      setError(`${room.associationWordCount}個すべての連想語を入力してください。`);
      return;
    }
    void runAction({ type: "submit-associations", actorId: playerId, playerId: targetId, clues }).then((saved) => {
      if (saved) setAssociationDrafts((current) => { const next = { ...current }; delete next[targetId]; return next; });
    });
  };

  const submitSelectedGuess = () => {
    if (selectedGuessNumber === null) {
      setError("言葉一覧から余りだと思うカードを選んでください。");
      return;
    }
    void runAction({ type: "submit-guess", actorId: playerId, number: selectedGuessNumber }).then((saved) => {
      if (saved) setGuessSelection(null);
    });
  };

  const returnToRoom = () => resultReturnGate.returnToRoom(
    (code) => nigoichiRoomApi.fetchRoom(code, playerId),
    () => setError("部屋に戻れません。解散されたか、参加情報が変更されています。"),
  );

  return {
    state: {
      room, session, ready, isRestoringRoom, error, passphrase, joinCode, choices,
      showChoices, newPlayerCapacity, associationDrafts, selectedGuessNumber,
      guessRoundKey, isSaving, rulesOpen,
    },
    setters: {
      setPassphrase, setJoinCode, setShowChoices, setNewPlayerCapacity,
      setAssociationDrafts, setGuessSelection, setRulesOpen,
    },
    viewModel: {
      playerId, myHand, submittedAssociations, submittedGuesses,
      correctCount, roomConfigPlayerCount, roomBounds, roomTotalCards,
      controllablePlayers,
    },
    permissions: { isHost },
    actions: {
      runAction, createRoom, joinRoom, listRooms, leaveRoom, dissolveRoom,
      submitAssociations, submitSelectedGuess, returnToRoom,
    },
    result: resultReturnGate,
  };
}

export type NigoichiController = ReturnType<typeof useNigoichiController>;

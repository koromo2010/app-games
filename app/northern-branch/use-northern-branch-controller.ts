"use client";

import { useCallback, useEffect, useState } from "react";
import { confirmRoomLeave } from "@/app/components/room-navigation-confirmation";
import { useOnlineGameSessionRestore } from "@/app/hooks/use-online-game-session-restore";
import { onlineRoomPollingIntervals, useOnlineRoomPolling } from "@/app/hooks/use-online-room-polling";
import { clientTimeoutClaimDelayMs } from "@/lib/game-timer/client-policy";
import { useRoomResultReturnGate } from "@/app/hooks/use-room-result-return-gate";
import { useRoomLobbyReturnConfirmation } from "@/app/hooks/use-room-lobby-return-confirmation";
import { applyNorthernBranchRoomAction, createNorthernBranchRoom, northernBranchRoomApi } from "./northern-branch-room-api-client";
import { northernCards } from "@/lib/northern-branch-data";
import { northernRules } from "@/lib/northern-branch-game";
import { OnlineRoomApiError } from "@/lib/online-room-api-client";
import { synchronizedNow } from "@/lib/server-clock";
import type {
  NorthernGameAction,
  NorthernRoom,
  NorthernRoomAction,
  NorthernRoomChoice,
  NorthernRoomPlayer,
} from "@/lib/northern-branch-types";

const lastRoomKey = "northern-branch-last-room";
const ownerIdKey = "northern-branch-owner-id";

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

function apiMessage(status: number, fallback: string) {
  if (status === 401) return "合言葉が違います。";
  if (status === 403) return "今はあなたの手番ではないか、この操作を行う権限がありません。";
  if (status === 404) return "部屋が見つかりません。";
  if (status === 409) return "部屋が満員か、状態が更新されています。もう一度お試しください。";
  if (status === 503) return "部屋サーバーを利用できません。少し待ってお試しください。";
  return fallback;
}

function timeLimitLabel(seconds: number) {
  return seconds > 0 ? `${seconds}秒` : "なし";
}


export function useNorthernBranchController() {
  const [room, setRoom] = useState<NorthernRoom | null>(null);
  const { session, ready, isRestoringRoom } = useOnlineGameSessionRestore({ lastRoomKey, fetchActiveRoom: northernBranchRoomApi.fetchActiveRoom, fetchRoom: northernBranchRoomApi.fetchRoom, setRoom });
  const [error, setError] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [choices, setChoices] = useState<NorthernRoomChoice[]>([]);
  const [showChoices, setShowChoices] = useState(false);
  const [paymentSelection, setPaymentSelection] = useState<{ playerId: string; indexes: number[] }>({ playerId: "", indexes: [] });
  const [isSaving, setIsSaving] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const resultReturnGate = useRoomResultReturnGate({ room, setRoom, playerId: session?.id ?? "", resultPhase: "finished", onReturnUnavailable: () => setError("部屋に戻れません。解散されたか、参加情報が変更されています。") });

  const roomCode = room?.code;
  const roomPhase = room?.phase;
  const playerId = session?.id ?? "";

  useOnlineRoomPolling({
    game: "northern-branch",
    roomCode: playerId && !resultReturnGate.isRoomDissolved ? roomCode : null,
    intervalMs: roomPhase === "lobby" || roomPhase === "finished" ? onlineRoomPollingIntervals.idle : onlineRoomPollingIntervals.active,
    fetchRoom: (code) => northernBranchRoomApi.fetchRoom(code, playerId),
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

  const game = room?.game ?? null;
  const activePlayer = game?.players[game.activePlayerIndex];
  const paymentIndexes = paymentSelection.playerId === activePlayer?.id ? paymentSelection.indexes : [];

  const isHost = Boolean(room && playerId === room.hostId);
  const canControlTurn = Boolean(activePlayer && (activePlayer.id === playerId || (room?.debugMode && isHost)));
  const myGamePlayer = game?.players.find((player) => player.id === playerId);
  const handPlayer = canControlTurn ? activePlayer : myGamePlayer;
  const selectedValue = handPlayer
    ? paymentIndexes.reduce((sum, index) => sum + (northernCards[handPlayer.hand[index]]?.value ?? 0), 0)
    : 0;
  const winner = game?.players.find((player) => player.id === game.winnerId);
  const timerTurnStartedAt = room?.turnStartedAt;
  const timerDurationSeconds = room?.turnTimeLimitSeconds ?? 0;
  const timerClaimDelayMs = room ? clientTimeoutClaimDelayMs({ playerId, hostId: room.hostId, playerIds: room.players.map((player) => player.id) }) : 0;
  const configItems = room ? [
    { label: "参加人数", value: `${room.players.length}/4人` },
    { label: "勝利条件", value: `${northernRules.victoryPoints}点` },
    { label: "手札上限", value: `${northernRules.handLimit}枚` },
    { label: "1手番の時間", value: timeLimitLabel(room.turnTimeLimitSeconds) },
    { label: "合言葉", value: room.passphrase ? "あり" : "なし" },
    { label: "デバッグ", value: room.debugMode ? "ON" : "OFF" },
  ] : [];

  useEffect(() => {
    if (!roomCode || !playerId || roomPhase !== "playing" || !timerTurnStartedAt || timerDurationSeconds <= 0) return;
    const timer = window.setTimeout(() => {
      void applyNorthernBranchRoomAction(roomCode, { type: "expire-turn", actorId: playerId, turnStartedAt: timerTurnStartedAt })
        .then((saved) => setRoom((current) => current?.code === saved.code ? saved : current))
        .catch(() => undefined);
    }, Math.max(0, timerTurnStartedAt + timerDurationSeconds * 1000 - synchronizedNow()) + 100 + timerClaimDelayMs);
    return () => window.clearTimeout(timer);
  }, [playerId, roomCode, roomPhase, timerClaimDelayMs, timerDurationSeconds, timerTurnStartedAt]);

  const runAction = useCallback(async (action: NorthernRoomAction) => {
    if (!room) return null;
    setIsSaving(true);
    try {
      const savedRoom = await applyNorthernBranchRoomAction(room.code, action);
      setRoom(savedRoom);
      setError("");
      return savedRoom;
    } catch (caught) {
      const payload = caught instanceof OnlineRoomApiError && caught.payload && typeof caught.payload === "object" ? caught.payload as { error?: string } : null;
      setError(caught instanceof OnlineRoomApiError ? apiMessage(caught.status, payload?.error || "操作を保存できませんでした。") : "通信できませんでした。接続を確認してください。");
      return null;
    } finally {
      setIsSaving(false);
    }
  }, [room]);
  useRoomLobbyReturnConfirmation({ room, playerId, confirmReturn: () => runAction({ type: "confirm-lobby-return", actorId: playerId }) });

  const perform = (action: NorthernGameAction) => {
    if (!room || !playerId) return;
    void runAction({ type: "game-action", actorId: playerId, action }).then((saved) => {
      if (saved && action.type !== "use-building") setPaymentSelection({ playerId: "", indexes: [] });
    });
  };

  const createRoom = async () => {
    if (!session?.id) return;
    setIsSaving(true);
    const ownerId = getOwnerId();
    try {
      await northernBranchRoomApi.remove({ ownerId, fallbackHostId: session.id });
      const now = Date.now();
      const host: NorthernRoomPlayer = { id: session.id, name: session.name, joinedAt: now, avatarColor: session.avatarColor, avatarImage: session.avatarImage ?? undefined };
      const nextRoom: NorthernRoom = {
        code: makeRoomCode(), revision: 0, hostId: session.id, ownerId, passphrase: passphrase.trim(), phase: "lobby",
        players: [host], gameNumber: 1, gameStartedAt: null, debugMode: false, debugReplayEnabled: false, turnTimeLimitSeconds: 0, turnStartedAt: null, game: null, notice: "参加者を待っています。", createdAt: now, updatedAt: now,
      };
      const data = await createNorthernBranchRoom(nextRoom, session.id);
      setRoom(data.room);
      localStorage.setItem(lastRoomKey, data.room.code);
      setError("");
    } catch (caught) {
      const status = caught instanceof OnlineRoomApiError ? caught.status : 0;
      setError(status === 409 ? "プレイ中の部屋があります。先にその部屋へ戻ってください。" : apiMessage(status, "部屋を作成できませんでした。"));
    } finally {
      setIsSaving(false);
    }
  };

  const listRooms = async () => {
    try {
      const rooms = await northernBranchRoomApi.fetchJoinableRooms();
      setChoices(rooms);
      setShowChoices(true);
      setError(rooms.length ? "" : "参加できる未開始の部屋がありません。");
    } catch (caught) {
      setError(apiMessage(caught instanceof OnlineRoomApiError ? caught.status : 0, "部屋一覧を取得できませんでした。"));
    }
  };

  const joinRoom = async (selectedCode = joinCode) => {
    if (!session?.id) return;
    const code = selectedCode.trim().toUpperCase();
    if (!code) {
      setError("部屋コードを入力してください。");
      return;
    }
    const player: NorthernRoomPlayer = { id: session.id, name: session.name, joinedAt: Date.now(), avatarColor: session.avatarColor, avatarImage: session.avatarImage ?? undefined };
    setIsSaving(true);
    try {
      const joinedRoom = await applyNorthernBranchRoomAction(code, { type: "join-room", actorId: session.id, player, passphrase });
      setRoom(joinedRoom);
      setShowChoices(false);
      localStorage.setItem(lastRoomKey, joinedRoom.code);
      setError("");
    } catch (caught) {
      setError(apiMessage(caught instanceof OnlineRoomApiError ? caught.status : 0, "部屋へ参加できませんでした。"));
    } finally {
      setIsSaving(false);
    }
  };

  const dissolveRoom = async () => {
    if (!room || !session?.id || !isHost || !window.confirm("部屋を解散しますか？")) return;
    try {
      await northernBranchRoomApi.remove({ code: room.code, actorId: session.id });
    } catch {
      setError("部屋を解散できませんでした。");
      return;
    }
    localStorage.removeItem(lastRoomKey);
    if (resultReturnGate.markRoomDissolved()) {
      setError("部屋を解散しました。結果画面はこのまま確認できます。");
      return;
    }
    setRoom(null);
  };

  const leaveRoom = async () => {
    if (!room || !session?.id || isHost || !confirmRoomLeave()) return;
    const saved = await runAction({ type: "leave-room", actorId: session.id });
    if (!saved) return;
    setRoom(null);
    localStorage.removeItem(lastRoomKey);
  };

  const marketCards = game?.offers ?? [];

  const returnToRoom = () => resultReturnGate.returnToRoom(
    (code) => northernBranchRoomApi.fetchRoom(code, playerId),
    () => setError("部屋に戻れません。解散されたか、参加情報が変更されています。"),
  );

  return {
    state: {
      room, session, ready, isRestoringRoom, error, passphrase, joinCode,
      choices, showChoices, paymentSelection, isSaving, rulesOpen,
    },
    setters: {
      setPassphrase, setJoinCode, setPaymentSelection, setRulesOpen,
    },
    viewModel: {
      playerId, game, activePlayer, paymentIndexes, handPlayer,
      selectedValue, winner, configItems, marketCards,
    },
    permissions: { isHost, canControlTurn },
    actions: {
      runAction, perform, createRoom, listRooms, joinRoom, dissolveRoom,
      leaveRoom, returnToRoom,
    },
    result: resultReturnGate,
  };
}

export type NorthernBranchController = ReturnType<typeof useNorthernBranchController>;

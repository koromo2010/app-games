"use client";

import { useEffect, useRef, useState } from "react";
import { confirmRoomLeave } from "@/app/components/room-navigation-confirmation";
import { useOnlineGameSessionRestore } from "@/app/hooks/use-online-game-session-restore";
import { onlineRoomPollingIntervals, useOnlineRoomPolling } from "@/app/hooks/use-online-room-polling";
import { useRoomResultReturnGate } from "@/app/hooks/use-room-result-return-gate";
import { useRoomLobbyReturnConfirmation } from "@/app/hooks/use-room-lobby-return-confirmation";
import { applyKotobaSenpukuRoomAction, createKotobaSenpukuRoom, kotobaSenpukuRoomApi } from "./kotoba-senpuku-room-api-client";
import { loadPlayerRoomDefaults, savePlayerRoomDefaults } from "@/lib/game-room-defaults-client";
import { OnlineRoomApiError } from "@/lib/online-room-api-client";
import { synchronizedNow } from "@/lib/server-clock";
import {
  kotobaSenpukuKanaKey,
  isValidKotobaSenpukuWord,
  minimumKotobaSenpukuWordLength,
  normalizeKotobaSenpukuConfig,
  normalizeKotobaSenpukuWord,
  type KotobaSenpukuConfig,
  type KotobaSenpukuPlayer,
  type KotobaSenpukuRoom,
  type KotobaSenpukuRoomAction,
  type KotobaSenpukuRoomChoice,
} from "@/lib/kotoba-senpuku";

const lastRoomKey = "kotoba-senpuku-last-room";
const ownerIdKey = "kotoba-senpuku-owner-id";
const defaultsStorageKey = "kotoba-senpuku-room-defaults-v1";

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

function normalizeDefaults(value: unknown) {
  const config = normalizeKotobaSenpukuConfig(value);
  return {
    roundsTotal: config.roundsTotal,
    secretTimeLimitSeconds: config.secretTimeLimitSeconds,
    turnTimeLimitSeconds: config.turnTimeLimitSeconds,
    continuousScan: config.continuousScan,
    allowWordGuess: config.allowWordGuess,
    showWordGuessInLog: config.showWordGuessInLog,
    randomFirstTurn: config.randomFirstTurn,
  };
}

function formatTime(seconds: number) {
  return seconds === 0 ? "なし" : `${seconds}秒`;
}

function apiMessage(status: number, fallback: string) {
  if (status === 401) return "合言葉が違います。";
  if (status === 403) return "今はこの操作を行えません。手番や権限を確認してください。";
  if (status === 404) return "部屋が見つかりません。";
  if (status === 409) return "部屋が満員か、状態が更新されています。もう一度お試しください。";
  if (status === 503) return "部屋サーバーを利用できません。少し待ってお試しください。";
  return fallback;
}

export function useKotobaSenpukuController() {
  const [room, setRoom] = useState<KotobaSenpukuRoom | null>(null);
  const { session, ready, isRestoringRoom } = useOnlineGameSessionRestore({ lastRoomKey, fetchActiveRoom: kotobaSenpukuRoomApi.fetchActiveRoom, fetchRoom: kotobaSenpukuRoomApi.fetchRoom, setRoom });
  const [error, setError] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [choices, setChoices] = useState<KotobaSenpukuRoomChoice[]>([]);
  const [showChoices, setShowChoices] = useState(false);
  const [secretWord, setSecretWord] = useState("");
  const [challengeTarget, setChallengeTarget] = useState("");
  const [challengeGuess, setChallengeGuess] = useState("");
  const timeoutTextSubmissionKeyRef = useRef("");
  const [isSaving, setIsSaving] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const resultReturnGate = useRoomResultReturnGate({ room, setRoom, playerId: session?.id ?? "", resultPhase: "result", onReturnUnavailable: () => setError("部屋に戻れません。解散されたか、参加情報が変更されています。") });

  const roomCode = room?.code;
  const roomPhase = room?.phase;
  const playerId = session?.id ?? "";

  useOnlineRoomPolling({
    game: "kotoba-senpuku",
    roomCode: playerId && !resultReturnGate.isRoomDissolved ? roomCode : null,
    intervalMs: roomPhase === "lobby" || roomPhase === "result" ? onlineRoomPollingIntervals.idle : onlineRoomPollingIntervals.active,
    fetchRoom: (code) => kotobaSenpukuRoomApi.fetchRoom(code, playerId),
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

  const isHost = Boolean(room && playerId === room.hostId);
  const activePlayer = room?.players[room.activePlayerIndex];
  const canControlTurn = Boolean(room?.phase === "battle" && activePlayer && (activePlayer.id === playerId || (room.debugMode && isHost)));
  const challengeTargets = room?.players.filter((player) => player.id !== activePlayer?.id && !room.exposedIds.includes(player.id)) ?? [];
  const effectiveTarget = challengeTargets.some((player) => player.id === challengeTarget) ? challengeTarget : challengeTargets[0]?.id ?? "";
  const latestResult = room?.history.at(-1);
  const winnerIds = latestResult?.winnerIds ?? (latestResult?.winnerId ? [latestResult.winnerId] : []);
  const winnerNames = room?.players.filter((player) => winnerIds.includes(player.id)).map((player) => player.name).join("・") ?? "";
  const ownSecretKana = new Set([...(room?.secrets[playerId] ?? "")].map(kotobaSenpukuKanaKey));
  const configItems = room ? [
    { label: "参加人数", value: `${room.players.length}人` },
    { label: "勝利条件", value: "最後の1人" },
    { label: "秘密語時間", value: formatTime(room.secretTimeLimitSeconds) },
    { label: "手番時間", value: formatTime(room.turnTimeLimitSeconds) },
    { label: "連続探知", value: room.continuousScan ? "あり" : "なし" },
    { label: "秘密語回答", value: room.allowWordGuess ? "あり" : "なし" },
    { label: "直接回答ログ", value: room.showWordGuessInLog ? "表示" : "非表示" },
    { label: "最初の手番", value: room.randomFirstTurn ? "ランダム" : "参加順" },
    { label: "デバッグ", value: room.debugMode ? "ON" : "OFF" },
  ] : [];

  const runAction = async (action: KotobaSenpukuRoomAction) => {
    if (!room) return null;
    setIsSaving(true);
    try {
      const savedRoom = await applyKotobaSenpukuRoomAction(room.code, action);
      setRoom(savedRoom);
      setError("");
      return savedRoom;
    } catch (caught) {
      const payload = caught instanceof OnlineRoomApiError && caught.payload && typeof caught.payload === "object"
        ? caught.payload as { error?: string }
        : null;
      const invalidWord = payload?.error === "Invalid secret word" ? "秘密語はひらがなと長音符で入力してください。" : "";
      const tooShort = payload?.error === "Secret word is too short" ? "2人対戦では、秘密語を2文字以上で入力してください。" : "";
      setError(invalidWord || tooShort || (caught instanceof OnlineRoomApiError
        ? apiMessage(caught.status, payload?.error || "操作を保存できませんでした。")
        : "通信できませんでした。接続を確認してください。"));
      return null;
    } finally {
      setIsSaving(false);
    }
  };
  useRoomLobbyReturnConfirmation({ room, playerId, confirmReturn: () => runAction({ type: "confirm-lobby-return", actorId: playerId }) });

  useEffect(() => {
    if (!room?.phaseStartedAt || !playerId) return;
    const secret = normalizeKotobaSenpukuWord(secretWord);
    const canSubmitSecret = room.phase === "secret"
      && room.secretTimeLimitSeconds > 0
      && !room.secrets[playerId]
      && isValidKotobaSenpukuWord(secret)
      && [...secret].length >= minimumKotobaSenpukuWordLength(room.players.length);
    const canSubmitChallenge = room.phase === "battle"
      && room.turnTimeLimitSeconds > 0
      && room.allowWordGuess
      && canControlTurn
      && Boolean(effectiveTarget)
      && isValidKotobaSenpukuWord(challengeGuess);
    if (!canSubmitSecret && !canSubmitChallenge) return;
    const durationSeconds = canSubmitSecret ? room.secretTimeLimitSeconds : room.turnTimeLimitSeconds;
    const actionType = canSubmitSecret ? "secret" : "challenge";
    const key = `${room.code}:${room.round}:${room.turnNumber}:${room.phaseStartedAt}:${playerId}:${actionType}`;
    const delay = Math.max(0, room.phaseStartedAt + durationSeconds * 1000 - synchronizedNow());
    const timer = window.setTimeout(() => {
      if (timeoutTextSubmissionKeyRef.current === key) return;
      timeoutTextSubmissionKeyRef.current = key;
      const action: KotobaSenpukuRoomAction = canSubmitSecret
        ? { type: "submit-secret", actorId: playerId, round: room.round, word: secret }
        : { type: "challenge-word", actorId: playerId, round: room.round, targetId: effectiveTarget, guess: challengeGuess };
      void applyKotobaSenpukuRoomAction(room.code, action)
        .then((saved) => {
          setRoom((current) => current?.code === saved.code ? saved : current);
          if (canSubmitSecret) setSecretWord("");
          else setChallengeGuess("");
        })
        .catch(() => undefined);
    }, delay);
    return () => window.clearTimeout(timer);
  }, [canControlTurn, challengeGuess, effectiveTarget, playerId, room, secretWord]);

  const createRoom = async () => {
    if (!session?.id) return;
    setIsSaving(true);
    const ownerId = getOwnerId();
    try {
      await kotobaSenpukuRoomApi.remove({ ownerId, fallbackHostId: session.id });
      const defaults = await loadPlayerRoomDefaults({ game: "kotoba-senpuku", playerId: session.id, localStorageKey: defaultsStorageKey, normalize: normalizeDefaults });
      const now = Date.now();
      const host: KotobaSenpukuPlayer = { id: session.id, name: session.name, joinedAt: now, avatarColor: session.avatarColor, avatarImage: session.avatarImage ?? undefined };
      const nextRoom: KotobaSenpukuRoom = {
        code: makeRoomCode(), revision: 0, hostId: session.id, ownerId, passphrase: passphrase.trim(), phase: "lobby", players: [host], gameNumber: 1, gameStartedAt: null,
        ...defaults, playerTimeouts: { [session.id]: { consecutiveTimeouts: 0, reducedTime: false } }, playerTimeoutNotice: null, debugMode: false, debugReplayEnabled: false, round: 1, theme: null, secrets: {}, submittedIds: [], masks: {}, calledKana: [], exposedIds: [],
        roundSignals: { [session.id]: 0 }, totalScores: { [session.id]: 0 }, activePlayerIndex: 0, turnNumber: 1, roundEvents: [],
        history: [], log: ["参加者を待っています。"], phaseStartedAt: null, createdAt: now, updatedAt: now,
      };
      const data = await createKotobaSenpukuRoom(nextRoom, session.id);
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
      const rooms = await kotobaSenpukuRoomApi.fetchJoinableRooms();
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
    const player: KotobaSenpukuPlayer = { id: session.id, name: session.name, joinedAt: Date.now(), avatarColor: session.avatarColor, avatarImage: session.avatarImage ?? undefined };
    setIsSaving(true);
    try {
      const joinedRoom = await applyKotobaSenpukuRoomAction(code, { type: "join-room", actorId: session.id, player, passphrase });
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
      await kotobaSenpukuRoomApi.remove({ code: room.code, actorId: session.id });
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

  const updateConfig = async (updates: Partial<Omit<KotobaSenpukuConfig, "debugMode">>) => {
    if (!room || !session?.id || !isHost) return;
    const config = normalizeKotobaSenpukuConfig({ ...room, ...updates, debugMode: room.debugMode });
    const saved = await runAction({ type: "update-config", actorId: session.id, config: normalizeDefaults(config) });
    if (saved) void savePlayerRoomDefaults({ game: "kotoba-senpuku", playerId: session.id, localStorageKey: defaultsStorageKey, defaults: normalizeDefaults(saved) });
  };

  const submitSecret = () => {
    if (!room || !playerId) return;
    const word = normalizeKotobaSenpukuWord(secretWord);
    if (!isValidKotobaSenpukuWord(word)) {
      setError("秘密語はひらがなと長音符だけで入力してください。カタカナや漢字は使用できません。");
      return;
    }
    if ([...word].length < minimumKotobaSenpukuWordLength(room.players.length)) {
      setError("2人対戦では、秘密語を2文字以上で入力してください。");
      return;
    }
    void runAction({ type: "submit-secret", actorId: playerId, round: room.round, word }).then((saved) => {
      if (saved) setSecretWord("");
    });
  };

  const challengeWord = () => {
    if (!room || !playerId || !effectiveTarget) return;
    if (!isValidKotobaSenpukuWord(challengeGuess)) {
      setError("回答はひらがなと長音符だけで入力してください。");
      return;
    }
    void runAction({ type: "challenge-word", actorId: playerId, round: room.round, targetId: effectiveTarget, guess: challengeGuess }).then((saved) => {
      if (saved) setChallengeGuess("");
    });
  };

  const returnToRoom = () => resultReturnGate.returnToRoom(
    (code) => kotobaSenpukuRoomApi.fetchRoom(code, playerId),
    () => setError("部屋に戻れません。解散されたか、参加情報が変更されています。"),
  );

  return {
    state: {
      room, session, ready, isRestoringRoom, error, passphrase, joinCode, choices,
      showChoices, secretWord, challengeTarget, challengeGuess, isSaving, rulesOpen,
    },
    setters: {
      setPassphrase, setJoinCode, setSecretWord, setChallengeTarget,
      setChallengeGuess, setRulesOpen,
    },
    viewModel: {
      playerId, activePlayer, challengeTargets,
      effectiveTarget, latestResult, winnerIds, winnerNames, ownSecretKana,
      configItems,
    },
    permissions: { isHost, canControlTurn },
    actions: {
      runAction, createRoom, listRooms, joinRoom, dissolveRoom, leaveRoom,
      updateConfig, submitSecret, challengeWord, returnToRoom,
    },
    result: resultReturnGate,
  };
}

export type KotobaSenpukuController = ReturnType<typeof useKotobaSenpukuController>;

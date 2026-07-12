"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  defaultAvatarImage,
  fallbackAvatarColor,
  isPlayerAuthenticated,
  loadPersistentPlayerSession,
  makeRandomAvatarColor,
} from "@/lib/player-session";
import { loadPlayerRoomDefaults, savePlayerRoomDefaults } from "@/lib/game-room-defaults-client";
import { normalizeCommonTimeLimit } from "@/lib/game-room-config";
import type { TahoiyaAnswererMode, TahoiyaDifficulty, TahoiyaPlayMode, TahoiyaPlayer, TahoiyaRoom, TahoiyaRoomAction, TahoiyaRoomChoice, TahoiyaTopic } from "@/lib/tahoiya-types";
import { PaidLlmAccessButton } from "../components/PaidLlmAccessButton";
import { DebugModeButton } from "../components/DebugModeButton";
import { GameFeedbackPanel } from "../components/GameFeedbackPanel";
import { RoomConfigSummary } from "../components/RoomConfigSummary";
import { RoomTimeLimitControl } from "../components/RoomTimeLimitControl";
import { cyanButtonClass, dangerButtonClass, inputClass, panelClass, primaryButtonClass, subtleButtonClass } from "../wordwolf/styles";

const roomStoragePrefix = "tahoiya-room-";
const roomDefaultsStoragePrefix = "tahoiya-room-defaults-";

const tahoiyaFeedbackReasons = [
  { value: "too-difficult", label: "難しすぎる", rating: "bad" as const },
  { value: "want-harder-word", label: "もっと難しい単語にしてほしい", rating: "bad" as const },
  { value: "hard-to-fake", label: "偽説明を作りにくい", rating: "bad" as const },
  { value: "definition-too-complex", label: "本物の説明が複雑", rating: "bad" as const },
  { value: "definition-questionable", label: "読み・説明が怪しい", rating: "bad" as const },
  { value: "existence-questionable", label: "実在するか怪しい", rating: "bad" as const },
  { value: "difficulty-good", label: "ちょうどよい難易度", rating: "good" as const },
  { value: "appropriately-obscure", label: "ちゃんと知らない難語だった", rating: "good" as const },
  { value: "definition-simple", label: "本物の説明が簡潔", rating: "good" as const },
  { value: "easy-to-fake", label: "偽説明を作りやすかった", rating: "good" as const },
  { value: "conversation-good", label: "盛り上がった", rating: "good" as const },
  { value: "other", label: "その他" },
];

type TahoiyaRoomDefaults = Pick<TahoiyaRoom, "playMode" | "topicDifficulty" | "answererMode" | "showRealDefinitionToWriters" | "actionTimeLimitSeconds">;

function makeId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function makeRoomCode() {
  return Math.random().toString(36).slice(2, 6).toUpperCase();
}

function getOwnerId() {
  const saved = localStorage.getItem("tahoiya-owner-id");
  if (saved) return saved;

  const ownerId = makeId("owner");
  localStorage.setItem("tahoiya-owner-id", ownerId);
  return ownerId;
}

function getRoomKey(code: string) {
  return `${roomStoragePrefix}${code.toUpperCase()}`;
}

function getRoomDefaultsKey(playerId: string, ownerId: string) {
  return `${roomDefaultsStoragePrefix}${playerId || ownerId || "local"}`;
}

function normalizeRoomDefaults(value: unknown): TahoiyaRoomDefaults {
  if (!value || typeof value !== "object") {
    return { playMode: "single-answerer", topicDifficulty: "standard", answererMode: "random", showRealDefinitionToWriters: true, actionTimeLimitSeconds: 0 };
  }
  const parsed = value as Partial<TahoiyaRoomDefaults>;
  const playMode = parsed.playMode === "all-vote" ? "all-vote" : "single-answerer";
  return {
    playMode,
    topicDifficulty: parsed.topicDifficulty === "extreme" ? "extreme" : "standard",
    answererMode: parsed.answererMode === "manual" ? "manual" : "random",
    showRealDefinitionToWriters: playMode === "single-answerer" && parsed.showRealDefinitionToWriters !== false,
    actionTimeLimitSeconds: normalizeCommonTimeLimit(parsed.actionTimeLimitSeconds),
  };
}

function loadRoomDefaults(playerId: string, ownerId: string) {
  const raw = localStorage.getItem(getRoomDefaultsKey(playerId, ownerId));
  if (!raw) return normalizeRoomDefaults(null);

  try {
    return normalizeRoomDefaults(JSON.parse(raw));
  } catch {
    return normalizeRoomDefaults(null);
  }
}

async function loadRoomDefaultsFromStore(playerId: string, ownerId: string) {
  return loadPlayerRoomDefaults({
    game: "tahoiya",
    playerId,
    localStorageKey: getRoomDefaultsKey(playerId, ownerId),
    normalize: normalizeRoomDefaults,
  });
}

async function saveRoomDefaultsToStore(room: TahoiyaRoom) {
  const defaults = normalizeRoomDefaults(room);
  await savePlayerRoomDefaults({
    game: "tahoiya",
    playerId: room.hostId,
    localStorageKey: getRoomDefaultsKey(room.hostId, room.ownerId ?? ""),
    defaults,
  });
}

function stampRoom(room: TahoiyaRoom) {
  return { ...room, updatedAt: Date.now() };
}

function shuffle<T>(items: T[]) {
  const next = [...items];
  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
  }
  return next;
}

function createPlayer(name: string, avatarColor = makeRandomAvatarColor(), avatarImage?: string | null, id?: string): TahoiyaPlayer {
  return {
    id: id ?? makeId("player"),
    name,
    avatarColor,
    avatarImage: avatarImage || undefined,
    joinedAt: Date.now(),
  };
}

function normalizeRoom(room: TahoiyaRoom): TahoiyaRoom {
  const playMode = room.playMode === "all-vote" ? "all-vote" : "single-answerer";
  return {
    ...room,
    revision: typeof room.revision === "number" ? room.revision : 0,
    passphrase: room.passphrase ?? "",
    debugMode: Boolean(room.debugMode),
    players: Array.isArray(room.players) ? room.players : [],
    parentId: room.parentId || room.hostId,
    playMode,
    topicDifficulty: room.topicDifficulty === "extreme" ? "extreme" : "standard",
    answererMode: room.answererMode === "manual" ? "manual" : "random",
    showRealDefinitionToWriters: playMode === "single-answerer" && room.showRealDefinitionToWriters !== false,
    actionTimeLimitSeconds: normalizeCommonTimeLimit(room.actionTimeLimitSeconds),
    phaseStartedAt: typeof room.phaseStartedAt === "number" ? room.phaseStartedAt : null,
    answererId: typeof room.answererId === "string" ? room.answererId : "",
    round: room.round ?? 1,
    fakeDefinitions: room.fakeDefinitions ?? {},
    options: room.options ?? [],
    votes: room.votes ?? {},
    scores: room.scores ?? {},
    topicSource: room.topicSource ?? "pending",
    topicSourceDetail: room.topicSourceDetail ?? "",
    updatedAt: room.updatedAt ?? Date.now(),
  };
}

function saveRoomLocally(room: TahoiyaRoom) {
  localStorage.setItem(getRoomKey(room.code), JSON.stringify(stampRoom(room)));
}

function loadRoomLocally(code: string): TahoiyaRoom | null {
  const raw = localStorage.getItem(getRoomKey(code));
  if (!raw) return null;

  try {
    return normalizeRoom(JSON.parse(raw) as TahoiyaRoom);
  } catch {
    return null;
  }
}

function listRoomsLocally() {
  const rooms: TahoiyaRoom[] = [];
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (!key?.startsWith(roomStoragePrefix)) continue;
    const room = loadRoomLocally(key.slice(roomStoragePrefix.length));
    if (room) rooms.push(room);
  }
  return rooms;
}

function listJoinableRoomsLocally(): TahoiyaRoomChoice[] {
  return listRoomsLocally()
    .filter((room) => room.phase === "lobby" && room.players.length < 8)
    .map((room) => ({
      code: room.code,
      hostName: room.players.find((player) => player.id === room.hostId)?.name ?? "Unknown",
      playerCount: room.players.length,
      phase: room.phase,
      hasPassphrase: Boolean(room.passphrase),
      updatedAt: room.updatedAt,
    }))
    .sort((left, right) => right.updatedAt - left.updatedAt);
}

function deleteRoomLocally(code: string) {
  localStorage.removeItem(getRoomKey(code));
}

async function saveRoomToStore(room: TahoiyaRoom, actorId: string) {
  saveRoomLocally(room);
  try {
    const response = await fetch("/api/tahoiya/rooms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ room, actorId }),
    });
    if (!response.ok) return null;
    const data = (await response.json()) as { room?: TahoiyaRoom };
    if (!data.room) return null;
    const saved = normalizeRoom(data.room);
    saveRoomLocally(saved);
    return saved;
  } catch {
    // Local storage keeps prototype testing usable when Redis is unavailable.
    return null;
  }
}

async function applyRoomActionToStore(code: string, action: TahoiyaRoomAction) {
  try {
    const response = await fetch("/api/tahoiya/rooms", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, action }),
    });
    if (!response.ok) return null;
    const data = (await response.json()) as { room?: TahoiyaRoom };
    if (!data.room) return null;
    const saved = normalizeRoom(data.room);
    saveRoomLocally(saved);
    return saved;
  } catch {
    return null;
  }
}

async function loadRoomFromStore(code: string) {
  try {
    const response = await fetch(`/api/tahoiya/rooms?code=${encodeURIComponent(code)}`, { cache: "no-store" });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error("ROOM_FETCH_FAILED");
    const data = (await response.json()) as { room?: TahoiyaRoom };
    if (!data.room) return null;
    const normalized = normalizeRoom(data.room);
    saveRoomLocally(normalized);
    return normalized;
  } catch {
    return loadRoomLocally(code);
  }
}

async function loadActiveRoomFromStore(playerId: string) {
  try {
    const response = await fetch(`/api/tahoiya/rooms?playerId=${encodeURIComponent(playerId)}`, { cache: "no-store" });
    if (!response.ok) throw new Error("ACTIVE_ROOM_FETCH_FAILED");
    const data = (await response.json()) as { room?: TahoiyaRoom | null };
    if (!data.room) return null;
    const normalized = normalizeRoom(data.room);
    saveRoomLocally(normalized);
    return normalized;
  } catch {
    return null;
  }
}

async function listJoinableRoomsFromStore() {
  try {
    const response = await fetch("/api/tahoiya/rooms", { cache: "no-store" });
    if (!response.ok) throw new Error("ROOM_LIST_FAILED");
    const data = (await response.json()) as { rooms?: TahoiyaRoomChoice[] };
    return Array.isArray(data.rooms) ? data.rooms : [];
  } catch {
    return listJoinableRoomsLocally();
  }
}

async function deleteRoomFromStore(code: string, actorId: string) {
  deleteRoomLocally(code);
  try {
    const params = new URLSearchParams({ code, actorId });
    await fetch(`/api/tahoiya/rooms?${params.toString()}`, { method: "DELETE" });
  } catch {
    // Local delete already happened.
  }
}

async function deleteHostedRoomsFromStore(ownerId: string, fallbackHostId: string) {
  for (const localRoom of listRoomsLocally()) {
    if (localRoom.ownerId === ownerId || (!localRoom.ownerId && localRoom.hostId === fallbackHostId)) {
      deleteRoomLocally(localRoom.code);
    }
  }
  try {
    const params = new URLSearchParams({ ownerId, fallbackHostId });
    await fetch(`/api/tahoiya/rooms?${params.toString()}`, { method: "DELETE" });
  } catch {
    // Local cleanup keeps room creation usable when Redis is unavailable.
  }
}

function createEmptyRoom(
  host: TahoiyaPlayer,
  passphrase: string,
  ownerId: string,
  savedDefaults?: TahoiyaRoomDefaults,
): TahoiyaRoom {
  const defaults = savedDefaults ?? loadRoomDefaults(host.id, ownerId);
  return {
    code: makeRoomCode(),
    revision: 0,
    hostId: host.id,
    ownerId,
    passphrase,
    phase: "lobby",
    debugMode: false,
    players: [host],
    parentId: host.id,
    playMode: defaults.playMode,
    topicDifficulty: defaults.topicDifficulty,
    answererMode: defaults.answererMode,
    showRealDefinitionToWriters: defaults.showRealDefinitionToWriters,
    actionTimeLimitSeconds: defaults.actionTimeLimitSeconds,
    phaseStartedAt: null,
    answererId: "",
    round: 1,
    word: "",
    reading: "",
    realDefinition: "",
    topicNote: "",
    topicSourceDetail: "",
    topicSource: "pending",
    fakeDefinitions: {},
    options: [],
    votes: {},
    scores: {},
    resultText: "",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}


function getAnswererCandidates(room: TahoiyaRoom) {
  return room.players;
}

function getAnswerer(room: TahoiyaRoom) {
  if (room.playMode === "all-vote") return null;
  return getAnswererCandidates(room).find((player) => player.id === room.answererId) ?? null;
}

function getDefinitionWriters(room: TahoiyaRoom) {
  if (room.playMode === "all-vote") return room.players;
  return room.players.filter((player) => player.id !== room.answererId);
}

function submittedCount(room: TahoiyaRoom) {
  return getDefinitionWriters(room).filter((player) => room.fakeDefinitions[player.id]).length;
}

function voterCount(room: TahoiyaRoom) {
  if (room.playMode === "all-vote") {
    return room.players.filter((player) => room.votes[player.id]).length;
  }
  return room.answererId && room.votes[room.answererId] ? 1 : 0;
}

export function TahoiyaGame() {
  const [room, setRoom] = useState<TahoiyaRoom | null>(null);
  const [playerId, setPlayerId] = useState("");
  const [playerName, setPlayerName] = useState("");
  const [avatarColor, setAvatarColor] = useState(fallbackAvatarColor);
  const [avatarImage, setAvatarImage] = useState<string | null>(defaultAvatarImage);
  const [passphrase, setPassphrase] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [joinableRooms, setJoinableRooms] = useState<TahoiyaRoomChoice[]>([]);
  const [activePlayerId, setActivePlayerId] = useState("");
  const [definitionInput, setDefinitionInput] = useState("");
  const [selectedOptionId, setSelectedOptionId] = useState("");
  const [isStarting, setIsStarting] = useState(false);
  const [isPolishingDefinition, setIsPolishingDefinition] = useState(false);
  const [polishMessage, setPolishMessage] = useState("");
  const [message, setMessage] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const roomCode = room?.code;

  useEffect(() => {
    let mounted = true;
    loadPersistentPlayerSession()
      .then(async (session) => {
        if (!mounted || !session) return;
        const accountId = session.id ?? "";
        setPlayerId(accountId);
        setActivePlayerId(accountId);
        setPlayerName(session.name);
        setAvatarColor(session.avatarColor);
        setAvatarImage(session.avatarImage || defaultAvatarImage);
        if (!accountId) return;
        const activeRoom = await loadActiveRoomFromStore(accountId);
        if (!mounted || !activeRoom) return;
        setRoom(activeRoom);
        setActivePlayerId(accountId);
      })
      .catch(() => undefined);
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!roomCode) return undefined;
    const refreshRoom = () => {
      if (document.visibilityState !== "visible") return;
      void loadRoomFromStore(roomCode).then((latest) => {
        if (latest) {
          setRoom(latest);
        } else {
          setRoom(null);
          setMessage("部屋が解散されました。");
        }
      });
    };
    const intervalMs = room?.phase === "lobby" || room?.phase === "result" ? 5000 : 2500;
    const timer = window.setInterval(refreshRoom, intervalMs);
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") refreshRoom();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [room?.phase, roomCode]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const isDebugMode = Boolean(room?.debugMode);
  const operationPlayerId = isDebugMode ? activePlayerId : playerId;
  const activePlayer = room?.players.find((player) => player.id === operationPlayerId) ?? null;
  const isHost = Boolean(room && playerId === room.hostId);
  const isAllVoteMode = room?.playMode === "all-vote";
  const answererCandidates = room ? getAnswererCandidates(room) : [];
  const answerer = room ? getAnswerer(room) : null;
  const isAnswerer = Boolean(room && !isAllVoteMode && activePlayer?.id === room.answererId);
  const hasActivePlayerSubmitted = Boolean(room && activePlayer && room.fakeDefinitions[activePlayer.id]);
  const hasActivePlayerVoted = Boolean(room && activePlayer && room.votes[activePlayer.id]);
  const savedVoteOptionId = room && activePlayer ? room.votes[activePlayer.id] ?? "" : "";
  const displayedVoteOptionId = selectedOptionId || savedVoteOptionId;
  const definitionWriters = room ? getDefinitionWriters(room) : [];
  const definitionWriterCount = definitionWriters.length;
  const writingDone = room ? submittedCount(room) >= definitionWriterCount : false;
  const voterTarget = room ? (room.playMode === "all-vote" ? room.players.length : 1) : 1;
  const votingDone = room ? voterCount(room) >= voterTarget : false;
  const phaseDeadline = room?.phaseStartedAt && room.actionTimeLimitSeconds > 0
    ? room.phaseStartedAt + room.actionTimeLimitSeconds * 1000
    : null;
  const remainingSeconds = phaseDeadline ? Math.max(0, Math.ceil((phaseDeadline - now) / 1000)) : null;
  const nextWriter = room?.phase === "writing"
    ? definitionWriters.find((player) => !room.fakeDefinitions[player.id])
    : null;
  const nextVoter = room?.phase === "voting"
    ? room.playMode === "all-vote"
      ? room.players.find((player) => !room.votes[player.id]) ?? null
      : answerer && !room.votes[answerer.id] ? answerer : null
    : null;

  const sortedScores = useMemo(() => {
    if (!room) return [];
    return [...room.players].sort((left, right) => (room.scores[right.id] ?? 0) - (room.scores[left.id] ?? 0));
  }, [room]);
  const definitionLength = room ? Array.from(room.realDefinition.replace(/。$/, "")).length : 0;
  const definitionGranularity = definitionLength <= 14
    ? "brief"
    : definitionLength <= 25
      ? "standard"
      : definitionLength <= 38
        ? "detailed"
        : definitionLength <= 46
          ? "long"
          : definitionLength <= 55
            ? "extended"
            : "maximum";
  const roomConfigItems = room
    ? [
        { label: "遊び方", value: room.playMode === "all-vote" ? "全員作成・全員投票" : "回答者1人" },
        { label: "お題難易度", value: room.topicDifficulty === "extreme" ? "高難易度" : "通常" },
        ...(room.playMode === "single-answerer"
          ? [{ label: "回答者", value: answerer?.name ?? (room.answererMode === "random" ? "開始時にランダム" : "未指定") }]
          : []),
        { label: "正解情報", value: room.showRealDefinitionToWriters ? "偽説明担当に見せる" : "結果まで見せない" },
        { label: "偽説明", value: "1人1つ・全員完了まで修正可" },
        { label: "投票", value: room.playMode === "all-vote" ? "1人1票・自分には投票不可" : "回答者のみ1票" },
        { label: "正解文の長さ", value: "10〜30字中心・40〜60字は低確率" },
        { label: "制限時間", value: room.actionTimeLimitSeconds > 0 ? `${room.actionTimeLimitSeconds}秒` : "なし" },
      ]
    : [];

  const setAndSaveRoom = (nextRoom: TahoiyaRoom, persistDefaults = false) => {
    const stamped = stampRoom(nextRoom);
    setRoom(stamped);
    void saveRoomToStore(stamped, playerId).then((saved) => {
      if (saved) setRoom(saved);
    });
    if (persistDefaults && playerId === stamped.hostId) void saveRoomDefaultsToStore(stamped);
  };

  const runRoomAction = async (action: TahoiyaRoomAction) => {
    if (!room) return null;
    const saved = await applyRoomActionToStore(room.code, action);
    if (!saved) {
      setMessage("部屋の更新に失敗しました。再読み込みしてもう一度お試しください。");
      return null;
    }
    setRoom(saved);
    setMessage("");
    return saved;
  };

  const forceAdvanceToVoting = async () => {
    if (!room || !isHost || room.phase !== "writing") return;
    await runRoomAction({ type: "advance-phase", actorId: playerId, round: room.round, target: "voting", force: true });
    setSelectedOptionId("");
  };

  const forceAdvanceToResult = async () => {
    if (!room || !isHost || room.phase !== "voting") return;
    await runRoomAction({ type: "advance-phase", actorId: playerId, round: room.round, target: "result", force: true });
  };

  const refreshJoinableRooms = async () => {
    setJoinableRooms(await listJoinableRoomsFromStore());
  };

  const createRoom = async () => {
    if (!isPlayerAuthenticated() || !playerId || !playerName) {
      setMessage("先にゲームロビーでログインしてください。");
      return;
    }

    const ownerId = getOwnerId();
    await deleteHostedRoomsFromStore(ownerId, playerId);
    const host = createPlayer(playerName, avatarColor, avatarImage, playerId);
    const defaults = await loadRoomDefaultsFromStore(playerId, ownerId);
    const nextRoom = createEmptyRoom(host, passphrase, ownerId, defaults);
    setAndSaveRoom(nextRoom, true);
    setActivePlayerId(host.id);
    setMessage("");
  };

  const joinRoom = async (targetCode = joinCode) => {
    if (!isPlayerAuthenticated() || !playerId || !playerName) {
      setMessage("先にゲームロビーでログインしてください。");
      return;
    }

    const code = targetCode.trim().toUpperCase();
    const activeRoom = await loadActiveRoomFromStore(playerId);
    if (activeRoom && activeRoom.code !== code) {
      setRoom(activeRoom);
      setActivePlayerId(playerId);
      setMessage(`すでに部屋 ${activeRoom.code} に参加しています。1人が保持できる部屋は1つです。`);
      return;
    }
    const target = await loadRoomFromStore(code);
    if (!target) {
      setMessage("部屋が見つかりません。");
      return;
    }
    if (target.phase !== "lobby") {
      setMessage("開始済みの部屋には参加できません。");
      return;
    }
    if (target.passphrase && target.passphrase !== passphrase) {
      setMessage("合言葉が違います。");
      return;
    }

    const existing = target.players.find((player) => player.id === playerId);
    const nextRoom = existing
      ? target
      : {
          ...target,
          players: [...target.players, createPlayer(playerName, avatarColor, avatarImage, playerId)].slice(0, 8),
        };
    setAndSaveRoom(nextRoom);
    setActivePlayerId(playerId);
    setMessage("");
  };

  const addTestPlayer = () => {
    if (!room || room.phase !== "lobby" || !room.debugMode) return;
    const count = room.players.length + 1;
    setAndSaveRoom({
      ...room,
      players: [...room.players, createPlayer(`テスト${count}`)].slice(0, 8),
    });
  };

  const setDebugMode = (debugMode: boolean) => {
    if (!room || room.phase !== "lobby") return;
    const nextRoom = { ...room, debugMode };
    setAndSaveRoom(nextRoom);
    if (!debugMode) {
      setActivePlayerId(playerId);
    }
  };

  const withMinimumDebugPlayers = (baseRoom: TahoiyaRoom) => {
    if (!baseRoom.debugMode || baseRoom.players.length >= 2) return baseRoom;

    const players = [...baseRoom.players];
    while (players.length < 2) {
      players.push(createPlayer(`テスト${players.length + 1}`));
    }
    return { ...baseRoom, players };
  };

  const setAnswererMode = (answererMode: TahoiyaAnswererMode) => {
    if (!room || room.phase !== "lobby") return;
    setAndSaveRoom({
      ...room,
      answererMode,
      answererId: answererMode === "random" ? "" : room.answererId,
    }, true);
  };

  const setPlayMode = (playMode: TahoiyaPlayMode) => {
    if (!room || room.phase !== "lobby") return;
    setAndSaveRoom({
      ...room,
      playMode,
      answererId: playMode === "all-vote" ? "" : room.answererId,
      showRealDefinitionToWriters: playMode === "all-vote" ? false : room.showRealDefinitionToWriters,
    }, true);
  };

  const setTopicDifficulty = (topicDifficulty: TahoiyaDifficulty) => {
    if (!room || room.phase !== "lobby") return;
    setAndSaveRoom({ ...room, topicDifficulty }, true);
  };

  const setManualAnswerer = (answererId: string) => {
    if (!room || room.phase !== "lobby") return;
    setAndSaveRoom({ ...room, answererId }, true);
  };

  const setShowRealDefinitionToWriters = (showRealDefinitionToWriters: boolean) => {
    if (!room || room.phase !== "lobby") return;
    setAndSaveRoom({ ...room, showRealDefinitionToWriters }, true);
  };

  const setActionTimeLimit = (actionTimeLimitSeconds: number) => {
    if (!room || room.phase !== "lobby") return;
    setAndSaveRoom({ ...room, actionTimeLimitSeconds: normalizeCommonTimeLimit(actionTimeLimitSeconds) }, true);
  };

  const startRound = async () => {
    if (!room || !isHost || isStarting) return;
    const startingRoom = withMinimumDebugPlayers(room);
    if (startingRoom.players.length < 2) {
      setMessage("ゲーム開始には2人以上が必要です。");
      return;
    }
    const candidates = getAnswererCandidates(startingRoom);
    const selectedAnswererId = startingRoom.playMode === "all-vote"
      ? ""
      : startingRoom.answererMode === "random"
        ? shuffle(candidates)[0]?.id ?? ""
        : candidates.some((player) => player.id === startingRoom.answererId)
          ? startingRoom.answererId
          : "";

    if (startingRoom.playMode === "single-answerer" && !selectedAnswererId) {
      setMessage("回答者を指定するか、ランダムで選ぶ設定にしてください。");
      return;
    }

    const playableRoom = { ...startingRoom, answererId: selectedAnswererId };
    setIsStarting(true);
    setMessage("");
    try {
      const topicParams = new URLSearchParams({
        roomCode: playableRoom.code,
        round: String(playableRoom.round),
        difficulty: playableRoom.topicDifficulty,
      });
      const response = await fetch(`/api/tahoiya/topic?${topicParams.toString()}`, { cache: "no-store" });
      const topic = (await response.json()) as TahoiyaTopic & { error?: string };
      if (!response.ok || !topic.word || !topic.realDefinition) {
        setMessage(topic.notice || topic.error || "お題を生成できませんでした。");
        return;
      }
      setMessage(topic.notice ?? "");
      setAndSaveRoom({
        ...playableRoom,
        phase: "writing",
        phaseStartedAt: Date.now(),
        word: topic.word,
        reading: topic.reading,
        realDefinition: topic.realDefinition,
        topicNote: topic.note,
        topicSourceDetail: topic.sourceDetail,
        topicSource: topic.source,
        topicGeneration: topic.generation,
        fakeDefinitions: {},
        options: [],
        votes: {},
        resultText: "",
      });
      const firstWriter = getDefinitionWriters(playableRoom)[0];
      if (firstWriter) setActivePlayerId(firstWriter.id);
      setDefinitionInput("");
      setPolishMessage("");
      setSelectedOptionId("");
    } finally {
      setIsStarting(false);
    }
  };

  const submitDefinition = async () => {
    if (!room || !activePlayer || isAnswerer || writingDone || !definitionInput.trim()) return;
    const nextRoom = await runRoomAction({
      type: "submit-definition",
      actorId: playerId,
      playerId: activePlayer.id,
      round: room.round,
      text: definitionInput.trim(),
    });
    if (!nextRoom) return;
    if (isDebugMode) {
      const next = nextRoom.phase === "voting"
        ? nextRoom.playMode === "all-vote" ? nextRoom.players[0] : getAnswerer(nextRoom)
        : getDefinitionWriters(nextRoom).find((player) => !nextRoom.fakeDefinitions[player.id]);
      if (next) setActivePlayerId(next.id);
    }
    setDefinitionInput("");
    setPolishMessage("");
    if (nextRoom.phase === "voting") setSelectedOptionId("");
  };

  const polishDefinition = async () => {
    if (!room || isAnswerer || writingDone || !definitionInput.trim() || isPolishingDefinition) return;
    setIsPolishingDefinition(true);
    setPolishMessage("");
    try {
      const response = await fetch("/api/tahoiya/polish-definition", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ word: room.word, text: definitionInput.trim() }),
      });
      const data = (await response.json()) as { text?: string; provider?: string; model?: string; error?: string };
      if (!response.ok || !data.text) {
        setPolishMessage(data.error || "偽説明を整えられませんでした。");
        return;
      }
      setDefinitionInput(data.text);
      setPolishMessage(`辞書調に整えました（${data.provider ?? "AI"} / ${data.model ?? "model"}）。内容を確認してから投稿してください。`);
    } catch {
      setPolishMessage("偽説明を整えられませんでした。");
    } finally {
      setIsPolishingDefinition(false);
    }
  };

  const autoFillTestDefinitions = async () => {
    if (!room || room.phase !== "writing") return;
    const nextRoom = await runRoomAction({ type: "debug-fill-definitions", actorId: playerId, round: room.round });
    if (!nextRoom) return;
    const firstVoter = nextRoom.playMode === "all-vote" ? nextRoom.players[0] : getAnswerer(nextRoom);
    if (firstVoter) setActivePlayerId(firstVoter.id);
    setSelectedOptionId("");
  };

  const castVote = async () => {
    if (!room || !activePlayer || votingDone || (!isAllVoteMode && !isAnswerer) || !selectedOptionId) return;
    const selectedOption = room.options.find((option) => option.id === selectedOptionId);
    if (!selectedOption || selectedOption.authorId === activePlayer.id) return;
    const nextRoom = await runRoomAction({
      type: "cast-vote",
      actorId: playerId,
      playerId: activePlayer.id,
      round: room.round,
      optionId: selectedOptionId,
    });
    if (!nextRoom) return;
    if (isDebugMode && nextRoom.phase === "voting" && room.playMode === "all-vote") {
      const next = room.players.find((player) => !nextRoom.votes[player.id]);
      if (next) setActivePlayerId(next.id);
    }
    setSelectedOptionId("");
  };

  const autoFillTestVotes = async () => {
    if (!room || room.phase !== "voting" || room.options.length === 0) return;
    await runRoomAction({ type: "debug-fill-votes", actorId: playerId, round: room.round });
  };

  const nextRound = () => {
    if (!room) return;
    const nextAnswererId = room.playMode === "single-answerer" && room.answererMode === "manual" ? room.answererId : "";
    setAndSaveRoom({
      ...room,
      phase: "lobby",
      answererId: nextAnswererId,
      round: room.round + 1,
      word: "",
      reading: "",
      realDefinition: "",
      topicNote: "",
      topicSourceDetail: "",
      topicSource: "pending",
      topicGeneration: undefined,
      phaseStartedAt: null,
      fakeDefinitions: {},
      options: [],
      votes: {},
      resultText: "",
    });
    setDefinitionInput("");
    setPolishMessage("");
    setSelectedOptionId("");
  };

  const dissolveRoom = async () => {
    if (!room) return;
    const code = room.code;
    setRoom(null);
    await deleteRoomFromStore(code, playerId);
  };

  return (
    <main className="min-h-screen bg-slate-950 text-slate-950">
      <header className="sticky top-0 z-20 border-b border-white/10 bg-slate-950/95 text-white backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <div>
            <p className="text-xs font-semibold uppercase text-amber-200">Dictionary bluffing</p>
            <h1 className="text-2xl font-black">たほい屋</h1>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <PaidLlmAccessButton />
            {room && isHost && (
              <DebugModeButton
                enabled={Boolean(room.debugMode)}
                disabled={room.phase !== "lobby"}
                onChange={setDebugMode}
              />
            )}
            <Link href="/games" className={subtleButtonClass}>
              ゲームロビー
            </Link>
            <span className="rounded-lg border border-white/15 bg-white/10 px-3 py-2 text-sm font-semibold text-white">
              {playerName || "未ログイン"}
            </span>
          </div>
        </div>
      </header>

      <section className="mx-auto grid max-w-6xl gap-4 px-4 py-5 lg:grid-cols-[340px_1fr]">
        <aside className="space-y-4">
          <div className={panelClass}>
            <p className="text-xs font-semibold uppercase text-amber-700">Entry</p>
            <h2 className="text-lg font-bold text-slate-950">部屋</h2>
            {!room ? (
              <div className="mt-4 space-y-3">
                <label className="block text-sm font-medium text-slate-700">
                  合言葉
                  <input
                    value={passphrase}
                    onChange={(event) => setPassphrase(event.target.value)}
                    className={`mt-1 ${inputClass}`}
                    placeholder="空欄なら合言葉なし"
                  />
                </label>
                <button onClick={() => void createRoom()} className={`w-full ${primaryButtonClass}`}>
                  部屋を作成
                </button>
                <button onClick={() => void refreshJoinableRooms()} className={`w-full ${subtleButtonClass}`}>
                  参加できる部屋を表示
                </button>
                {joinableRooms.length > 0 && (
                  <div className="space-y-2">
                    {joinableRooms.map((choice) => (
                      <button
                        key={choice.code}
                        type="button"
                        onClick={() => void joinRoom(choice.code)}
                        className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-left text-sm transition hover:bg-white"
                      >
                        <span className="font-bold text-slate-950">{choice.code}</span>
                        <span className="ml-2 text-slate-500">
                          {choice.hostName} / {choice.playerCount}人
                        </span>
                      </button>
                    ))}
                  </div>
                )}
                <input
                  value={joinCode}
                  onChange={(event) => setJoinCode(event.target.value.toUpperCase())}
                  className={inputClass}
                  placeholder="ROOM CODE"
                />
                <button onClick={() => void joinRoom()} className={`w-full ${cyanButtonClass}`}>
                  コードで参加
                </button>
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                <div className="rounded-lg bg-slate-100 p-3">
                  <p className="text-xs text-slate-500">ROOM</p>
                  <p className="text-xl font-black text-slate-950">{room.code}</p>
                </div>
                <p className="text-sm text-slate-600">
                  {room.playMode === "all-vote" ? (
                    <span className="font-bold text-slate-950">全員作成・全員投票</span>
                  ) : (
                    <>回答者: <span className="font-bold text-slate-950">{answerer?.name ?? (room.answererMode === "random" ? "開始時にランダム" : "未指定")}</span></>
                  )}
                </p>
                {room.phase === "lobby" && isHost && (
                  <div className="space-y-3">
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <p className="text-sm font-bold text-slate-950">遊び方</p>
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => setPlayMode("single-answerer")}
                          className={`rounded-lg border px-3 py-2 text-sm font-bold ${
                            room.playMode === "single-answerer"
                              ? "border-amber-500 bg-amber-100 text-amber-950"
                              : "border-slate-300 bg-white text-slate-700"
                          }`}
                        >
                          回答者1人
                        </button>
                        <button
                          type="button"
                          onClick={() => setPlayMode("all-vote")}
                          className={`rounded-lg border px-3 py-2 text-sm font-bold ${
                            room.playMode === "all-vote"
                              ? "border-cyan-500 bg-cyan-100 text-cyan-950"
                              : "border-slate-300 bg-white text-slate-700"
                          }`}
                        >
                          全員投票
                        </button>
                      </div>
                      <p className="mt-2 text-xs text-slate-500">
                        {room.playMode === "all-vote"
                          ? "全員が偽説明を書き、全員で投票して最多得票を競います。"
                          : "1人だけが回答し、それ以外の参加者が偽説明を書きます。"}
                      </p>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <p className="text-sm font-bold text-slate-950">お題の難易度</p>
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => setTopicDifficulty("standard")}
                          className={`rounded-lg border px-3 py-2 text-sm font-bold ${
                            room.topicDifficulty === "standard"
                              ? "border-cyan-500 bg-cyan-100 text-cyan-950"
                              : "border-slate-300 bg-white text-slate-700"
                          }`}
                        >
                          通常
                        </button>
                        <button
                          type="button"
                          onClick={() => setTopicDifficulty("extreme")}
                          className={`rounded-lg border px-3 py-2 text-sm font-bold ${
                            room.topicDifficulty === "extreme"
                              ? "border-rose-500 bg-rose-100 text-rose-950"
                              : "border-slate-300 bg-white text-slate-700"
                          }`}
                        >
                          高難易度
                        </button>
                      </div>
                      <p className="mt-2 text-xs text-slate-500">
                        {room.topicDifficulty === "extreme"
                          ? "難語好きでも知らないほど使用頻度の低い語を優先します。"
                          : "一般的な大人が意味を知らない難語を選びます。"}
                      </p>
                    </div>
                    {room.playMode === "single-answerer" && (
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <p className="text-sm font-bold text-slate-950">回答者の決め方</p>
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => setAnswererMode("manual")}
                          className={`rounded-lg border px-3 py-2 text-sm font-bold ${
                            room.answererMode === "manual"
                              ? "border-amber-500 bg-amber-100 text-amber-950"
                              : "border-slate-300 bg-white text-slate-700"
                          }`}
                        >
                          指定
                        </button>
                        <button
                          type="button"
                          onClick={() => setAnswererMode("random")}
                          className={`rounded-lg border px-3 py-2 text-sm font-bold ${
                            room.answererMode === "random"
                              ? "border-cyan-500 bg-cyan-100 text-cyan-950"
                              : "border-slate-300 bg-white text-slate-700"
                          }`}
                        >
                          ランダム
                        </button>
                      </div>
                      {room.answererMode === "manual" ? (
                        <label className="mt-2 block text-sm font-medium text-slate-700">
                          回答者
                          <select value={room.answererId} onChange={(event) => setManualAnswerer(event.target.value)} className={`mt-1 ${inputClass}`}>
                            <option value="">選択してください</option>
                            {answererCandidates.map((player) => (
                              <option key={player.id} value={player.id}>
                                {player.name}
                              </option>
                            ))}
                          </select>
                        </label>
                      ) : (
                        <p className="mt-2 text-xs font-semibold text-slate-500">
                          ラウンド開始時に、参加者全員から1人を回答者に選びます。
                        </p>
                      )}
                    </div>
                    )}
                    {room.playMode === "single-answerer" && (
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <p className="text-sm font-bold text-slate-950">本物の説明を見せる</p>
                      <p className="mt-1 text-xs text-slate-500">偽説明を書く人に、AIが用意した本物の説明を表示するか選べます。</p>
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => setShowRealDefinitionToWriters(true)}
                          className={`rounded-lg border px-3 py-2 text-sm font-bold ${
                            room.showRealDefinitionToWriters
                              ? "border-amber-500 bg-amber-100 text-amber-950"
                              : "border-slate-300 bg-white text-slate-700"
                          }`}
                        >
                          見せる
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowRealDefinitionToWriters(false)}
                          className={`rounded-lg border px-3 py-2 text-sm font-bold ${
                            !room.showRealDefinitionToWriters
                              ? "border-cyan-500 bg-cyan-100 text-cyan-950"
                              : "border-slate-300 bg-white text-slate-700"
                          }`}
                        >
                          見せない
                        </button>
                      </div>
                    </div>
                    )}
                    <RoomTimeLimitControl label="制限時間" value={room.actionTimeLimitSeconds} onChange={setActionTimeLimit} />
                  </div>
                )}
                <RoomConfigSummary items={roomConfigItems} />
                {room.phase === "lobby" && !isHost && (
                  <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600">
                    部屋設定は参加者全員に表示され、変更できるのはホストだけです。
                  </p>
                )}
                {isDebugMode ? (
                  <label className="block text-sm font-medium text-slate-700">
                    操作プレイヤー
                    <select value={activePlayer?.id ?? activePlayerId} onChange={(event) => setActivePlayerId(event.target.value)} className={`mt-1 ${inputClass}`}>
                      {room.players.map((player) => (
                        <option key={player.id} value={player.id}>
                          {player.name}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : (
                  <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                    操作中: <span className="font-bold text-slate-950">{activePlayer?.name ?? playerName}</span>
                  </div>
                )}
                {room.phase === "lobby" && (
                  isHost ? (
                    <>
                    {isDebugMode && (
                      <button onClick={addTestPlayer} disabled={room.players.length >= 8} className={`w-full ${subtleButtonClass}`}>
                        テストプレイヤー追加
                      </button>
                    )}
                    <button onClick={() => void startRound()} disabled={isStarting} className={`w-full ${primaryButtonClass}`}>
                      {isStarting ? "お題生成中..." : "ラウンド開始"}
                    </button>
                    </>
                  ) : (
                    <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-center text-xs font-semibold text-slate-600">
                      ホストのラウンド開始を待っています。
                    </p>
                  )
                )}
                {isHost && (
                  <button onClick={() => void dissolveRoom()} className={`w-full ${dangerButtonClass}`}>
                    部屋を解散
                  </button>
                )}
              </div>
            )}
            {message && <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900">{message}</p>}
          </div>

          {room && (
            <div className={panelClass}>
              <p className="text-xs font-semibold uppercase text-amber-700">Score</p>
              <h2 className="text-lg font-bold text-slate-950">得点</h2>
              <div className="mt-3 space-y-2">
                {sortedScores.map((player) => (
                  <div key={player.id} className="flex items-center justify-between rounded-lg bg-slate-100 px-3 py-2 text-sm">
                    <span className="font-semibold text-slate-800">{player.name}</span>
                    <span className="font-black text-slate-950">{room.scores[player.id] ?? 0}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </aside>

        <section className="space-y-4">
          {!room ? (
            <div className="min-h-[520px] rounded-lg border border-white/10 bg-white/[0.96] p-6 shadow-[0_18px_50px_rgba(15,23,42,0.16)]">
              <div className="grid min-h-[460px] place-items-center rounded-lg border border-dashed border-amber-200 bg-[linear-gradient(135deg,#ffffff_0%,#f8fafc_55%,#fff7ed_100%)]">
                <div className="max-w-md text-center">
                  <p className="text-sm font-semibold text-amber-700">Prototype ready</p>
                  <h2 className="mt-2 text-3xl font-black text-slate-950">辞書の本物を見抜く</h2>
                  <p className="mt-3 text-sm leading-6 text-slate-600">
                    回答者1人で遊ぶルールと、全員が偽説明を書いて全員投票するルールを選べます。
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <>
              <div className={panelClass}>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase text-amber-700">Round {room.round}</p>
                    <h2 className="mt-1 text-3xl font-black text-slate-950">
                      {room.phase === "lobby"
                        ? "開始待ち"
                        : room.phase === "writing" && isAnswerer
                          ? "お題は準備中"
                          : room.word}
                    </h2>
                  </div>
                  <div className="flex items-center gap-2">
                    {remainingSeconds !== null && (room.phase === "writing" || room.phase === "voting") && (
                      <span className={`rounded-lg px-3 py-2 text-sm font-black ${remainingSeconds <= 10 ? "bg-rose-100 text-rose-800" : "bg-amber-100 text-amber-900"}`}>
                        残り {remainingSeconds}秒
                      </span>
                    )}
                    <span className="rounded-lg bg-slate-100 px-3 py-2 text-sm font-bold text-slate-700">{room.phase}</span>
                  </div>
                </div>
                {isDebugMode && (
                  <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
                    <p className="font-bold">デバッグモード中</p>
                    <p className="mt-1">
                      {room.phase === "writing" && nextWriter
                        ? `次の未投稿: ${nextWriter.name}`
                        : room.phase === "voting" && nextVoter
                          ? `次の未投票: ${nextVoter.name}`
                          : "操作プレイヤーを切り替えながら一人で流れを確認できます。"}
                    </p>
                  </div>
                )}
              </div>

              {room.phase === "lobby" && (
                <div className={panelClass}>
                  <p className="text-xs font-semibold uppercase text-amber-700">Players</p>
                  <h2 className="text-2xl font-black text-slate-950">参加者</h2>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {room.players.map((player) => (
                      <div key={player.id} className="rounded-lg bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-800">
                        {player.name}
                        {room.playMode === "all-vote" ? (
                          <span className="ml-2 text-cyan-700">偽説明・投票</span>
                        ) : player.id === room.answererId ? (
                          <span className="ml-2 text-cyan-700">回答者</span>
                        ) : (
                          <span className="ml-2 text-slate-500">
                            {room.answererMode === "random" ? "回答者候補・偽説明" : "偽説明"}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {room.phase === "writing" && (
                <div className={panelClass}>
                  <p className="text-xs font-semibold uppercase text-amber-700">Fake explanation</p>
                  <h2 className="text-2xl font-black text-slate-950">偽説明を書く</h2>
                  <p className="mt-2 text-sm text-slate-600">
                    偽説明: {submittedCount(room)}/{definitionWriterCount}
                  </p>
                  {isAnswerer ? (
                    <p className="mt-4 rounded-lg bg-cyan-50 p-3 text-sm font-semibold text-cyan-900">回答者にはお題を表示しません。説明が並ぶまで待ちます。</p>
                  ) : (
                    <>
                      {room.playMode === "single-answerer" && room.showRealDefinitionToWriters && (
                        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4">
                          <p className="text-xs font-semibold uppercase text-amber-700">AIが用意した正解情報</p>
                          <p className="mt-1 text-lg font-bold text-slate-950">{room.realDefinition}</p>
                          {room.reading && (
                            <p className="mt-2 text-sm font-semibold text-slate-700">読み: {room.reading}</p>
                          )}
                          <div className="mt-3 border-t border-amber-200 pt-3 text-xs leading-5 text-slate-600">
                            <p><span className="font-bold text-slate-800">出典・確認情報:</span> {room.topicSourceDetail || room.topicNote}</p>
                            {room.topicNote && room.topicNote !== room.topicSourceDetail && (
                              <p><span className="font-bold text-slate-800">選定補足:</span> {room.topicNote}</p>
                            )}
                          </div>
                          <p className="mt-2 text-xs font-semibold text-amber-800">
                            この説明を参考に、回答者を迷わせる別の説明を作ってください。
                          </p>
                        </div>
                      )}
                      {hasActivePlayerSubmitted && writingDone ? (
                        <div className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm font-semibold text-emerald-900">
                          全員の偽説明がそろったため、提出内容は確定しました。
                        </div>
                      ) : (
                        <>
                          {hasActivePlayerSubmitted && (
                            <div className="mt-4 rounded-lg bg-cyan-50 p-3 text-sm font-semibold text-cyan-900">
                              <p>提出済みです。全員が提出するまでは上書きできます。</p>
                              <button
                                type="button"
                                onClick={() => setDefinitionInput(room.fakeDefinitions[activePlayer?.id ?? ""] ?? "")}
                                className="mt-2 rounded-lg border border-cyan-300 bg-white px-3 py-1.5 text-xs font-bold text-cyan-900"
                              >
                                現在の説明を編集する
                              </button>
                            </div>
                          )}
                          <textarea
                            value={definitionInput}
                            onChange={(event) => {
                              setDefinitionInput(event.target.value);
                              setPolishMessage("");
                            }}
                            className={`mt-4 min-h-28 resize-y ${inputClass}`}
                            placeholder="辞書に載っていそうな短い説明を書く"
                            maxLength={240}
                          />
                          <div className="mt-3 flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => void polishDefinition()}
                              disabled={!definitionInput.trim() || isPolishingDefinition}
                              className={subtleButtonClass}
                            >
                              {isPolishingDefinition ? "AIで整形中..." : "辞書っぽく整える（AI）"}
                            </button>
                            <button onClick={submitDefinition} disabled={!definitionInput.trim() || isPolishingDefinition} className={cyanButtonClass}>
                              {hasActivePlayerSubmitted ? "偽説明を上書き" : "偽説明を投稿"}
                            </button>
                          </div>
                          {polishMessage && (
                            <p className="mt-2 text-xs font-semibold text-slate-600">{polishMessage}</p>
                          )}
                        </>
                      )}
                    </>
                  )}
                  <p className="mt-4 text-xs font-semibold text-slate-500">全員の偽説明がそろうと、自動で投票へ進みます。</p>
                  {isHost && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {isDebugMode && (
                        <button onClick={autoFillTestDefinitions} className={subtleButtonClass}>
                          未投稿をテスト入力
                        </button>
                      )}
                      {writingDone && (
                        <button onClick={forceAdvanceToVoting} className={primaryButtonClass}>
                          投票へ進む（手動）
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}

              {room.phase === "voting" && (
                <div className={panelClass}>
                  <p className="text-xs font-semibold uppercase text-amber-700">Vote</p>
                  <h2 className="text-2xl font-black text-slate-950">{room.playMode === "all-vote" ? "最多得票を決める" : "本物を選ぶ"}</h2>
                  <p className="mt-2 text-sm text-slate-600">
                    投票: {voterCount(room)}/{voterTarget}
                  </p>
                  {!isAllVoteMode && !isAnswerer ? (
                    <div className="mt-4 space-y-3">
                      <p className={`rounded-lg p-3 text-sm font-semibold ${votingDone ? "bg-emerald-50 text-emerald-900" : "bg-slate-100 text-slate-700"}`}>
                        {votingDone ? "回答者が投票しました。ホストの結果発表を待っています。" : "回答者が候補を見比べています。投票先は結果発表まで非公開です。"}
                      </p>
                      <div className="grid gap-2">
                        {room.options.map((option, index) => (
                          <div key={option.id} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-semibold text-slate-800">
                            {index + 1}. {option.text}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="mt-4 grid gap-2">
                      {hasActivePlayerVoted && !votingDone && (
                        <p className="rounded-lg bg-cyan-50 p-3 text-sm font-semibold text-cyan-900">
                          投票済みです。全員が投票するまでは別の候補へ変更できます。
                        </p>
                      )}
                      {room.options.map((option, index) => {
                        const isOwnDefinition = option.authorId === activePlayer?.id;
                        return (
                        <button
                          key={option.id}
                          disabled={isOwnDefinition}
                          onClick={() => setSelectedOptionId(option.id)}
                          className={`rounded-lg border px-3 py-3 text-left text-sm font-semibold ${
                            isOwnDefinition
                              ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400"
                              : displayedVoteOptionId === option.id && selectedOptionId
                              ? "border-amber-500 bg-amber-50 text-amber-950"
                              : displayedVoteOptionId === option.id
                              ? "border-cyan-500 bg-cyan-50 text-cyan-950"
                              : "border-slate-200 bg-slate-50 text-slate-800 hover:bg-white"
                          }`}
                        >
                          {index + 1}. {option.text}
                          {isOwnDefinition ? "（自分の説明）" : displayedVoteOptionId === option.id && !selectedOptionId ? "（投票済み）" : ""}
                        </button>
                        );
                      })}
                      <button onClick={castVote} disabled={!selectedOptionId || votingDone} className={cyanButtonClass}>
                        {hasActivePlayerVoted ? "投票を変更" : "投票する"}
                      </button>
                    </div>
                  )}
                  <p className="mt-4 text-xs font-semibold text-slate-500">必要な投票がそろうと、自動で採点して結果を表示します。</p>
                  {isHost && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {isDebugMode && (
                        <button onClick={autoFillTestVotes} className={subtleButtonClass}>
                          未投票をテスト投票
                        </button>
                      )}
                      <button onClick={forceAdvanceToResult} className={primaryButtonClass}>
                        結果へ進む（手動）
                      </button>
                    </div>
                  )}
                </div>
              )}

              {room.phase === "result" && (
                <div className={panelClass}>
                  <p className="text-xs font-semibold uppercase text-amber-700">Result</p>
                  <h2 className="text-3xl font-black text-slate-950">結果</h2>
                  <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4">
                    <p className="text-xs font-semibold uppercase text-amber-700">本物</p>
                    <p className="mt-1 text-lg font-black text-slate-950">{room.realDefinition}</p>
                    {room.reading && (
                      <p className="mt-2 text-sm font-semibold text-slate-700">読み: {room.reading}</p>
                    )}
                    <div className="mt-3 border-t border-amber-200 pt-3 text-xs leading-5 text-slate-600">
                      <p><span className="font-bold text-slate-800">出典・確認情報:</span> {room.topicSourceDetail || room.topicNote}</p>
                      {room.topicNote && room.topicNote !== room.topicSourceDetail && (
                        <p><span className="font-bold text-slate-800">選定補足:</span> {room.topicNote}</p>
                      )}
                      {room.topicGeneration && (
                        <p>
                          <span className="font-bold text-slate-800">生成:</span>{" "}
                          {room.topicGeneration.provider} / {room.topicGeneration.model} / {room.topicGeneration.promptVersion}
                          {room.topicGeneration.reusedFromCatalog ? " / 保存済み問題を再利用" : ""}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="mt-4 grid gap-2">
                    {room.options.map((option, index) => {
                      const author = option.authorId ? room.players.find((player) => player.id === option.authorId) : null;
                      const votes = Object.entries(room.votes)
                        .filter(([, optionId]) => optionId === option.id)
                        .map(([voterId]) => room.players.find((player) => player.id === voterId)?.name ?? "Unknown");
                      return (
                        <div key={option.id} className={`rounded-lg border px-3 py-3 text-sm ${option.isReal ? "border-amber-300 bg-amber-50" : "border-slate-200 bg-slate-50"}`}>
                          <p className="font-bold text-slate-950">
                            {index + 1}. {option.text}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            {option.isReal ? "本物" : `作者: ${author?.name ?? "Unknown"}`} / 投票: {votes.length ? votes.join(", ") : "なし"}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                  <p className="mt-4 text-sm font-semibold text-slate-700">{room.resultText}</p>
                  {room.topicGeneration && operationPlayerId && (
                    <GameFeedbackPanel
                      artifactId={`tahoiya:${room.code}:${room.round}:${room.word}`}
                      artifactText={`単語=${room.word} / 読み=${room.reading ?? ""} / 語釈=${room.realDefinition} / 注記=${room.topicNote}`}
                      game="tahoiya"
                      task="tahoiya.topic"
                      playerId={operationPlayerId}
                      generation={room.topicGeneration}
                      reasonOptions={tahoiyaFeedbackReasons}
                      settings={{
                        playerCount: room.players.length,
                        playMode: room.playMode,
                        answererMode: room.answererMode,
                        showRealDefinitionToWriters: room.showRealDefinitionToWriters,
                        difficulty: room.topicDifficulty,
                        reusedFromCatalog: room.topicGeneration.reusedFromCatalog === true,
                        definitionStyle: definitionGranularity,
                        definitionLength,
                        punctuationStyle: "no-parentheses",
                      }}
                      outcome={{
                        correctVotes: Object.entries(room.votes).filter(([, optionId]) => room.options.find((option) => option.id === optionId)?.isReal).length,
                        fakeDefinitionCount: Object.keys(room.fakeDefinitions).length,
                      }}
                    />
                  )}
                  {isHost && (
                    <button onClick={nextRound} className={`mt-4 ${primaryButtonClass}`}>
                      次のラウンドへ
                    </button>
                  )}
                </div>
              )}
            </>
          )}
        </section>
      </section>
    </main>
  );
}

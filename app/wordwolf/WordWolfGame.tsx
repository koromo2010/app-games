"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type KeyboardEvent } from "react";
import {
  avatarColorOptions,
  clearPlayerSession,
  defaultAvatarImage,
  defaultAvatarImages,
  fallbackAvatarColor,
  isPlayerAuthenticated,
  makeRandomAvatarColor,
  normalizePlayerName,
  loadPersistentPlayerSession,
  savePersistentPlayerSession,
} from "@/lib/player-session";
import { loadPlayerRoomDefaults, savePlayerRoomDefaults } from "@/lib/game-room-defaults-client";
import { normalizeCommonTimeLimit } from "@/lib/game-room-config";
import {
  getTopicKey,
  getTopicWords,
  isValidWordWolfTopic,
  normalizeGuess,
  normalizeTopicDictionarySource,
  normalizeTopicPairDistance,
  pickFallbackTopic,
  type TopicDictionarySource,
  type TopicPairDistance,
  type WordWolfTopic,
} from "@/lib/wordwolf";
import { PaidLlmAccessButton } from "../components/PaidLlmAccessButton";
import { GameFeedbackPanel } from "../components/GameFeedbackPanel";
import { RoomTimeLimitControl } from "../components/RoomTimeLimitControl";
import type {
  ClueLogVisibility,
  ClueMode,
  GameMode,
  Player,
  Room,
  RoomChoice,
  VoteRound,
} from "@/lib/wordwolf-game-types";
import type { WordWolfGuessJudgement } from "@/lib/wordwolf-guess-judgement";
import {
  abstainVoteId,
  createClue,
  createVoteRound,
  getClueParticipants,
  getClueSubmittedCount,
  getFirstClueTurnIndex,
  getNextClueTurn,
  getNextSimultaneousCluePlayer,
  getNextVotePlayer,
  getTopVoteTargetIds,
  getVoteCandidates,
  getVoteTarget,
  getVoteVoters,
  hasPostedClueThisRound,
  pickWolves,
  shufflePlayers,
} from "./game-flow";
import { ClueLogPanel, VoteHistoryPanel } from "./WordWolfPanels";
import {
  cyanButtonClass,
  dangerButtonClass,
  inputClass,
  panelClass,
  primaryButtonClass,
  subtleButtonClass,
} from "./styles";

const wordwolfFeedbackReasons = [
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

function normalizeGameMode(value: unknown): GameMode {
  return value === "may-no-wolf" || value === "no-wolf" ? "may-no-wolf" : "wordwolf";
}

function normalizeClueMode(value: unknown): ClueMode {
  return value === "simultaneous" ? "simultaneous" : "turn";
}

function normalizeRoomScores(value: unknown) {
  if (!value || typeof value !== "object") return {};

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([playerId, score]) => playerId && typeof score === "number" && Number.isFinite(score))
      .map(([playerId, score]) => [playerId, Math.max(0, Math.floor(score as number))]),
  );
}

function normalizeVoteHistory(value: unknown): VoteRound[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item, index) => {
      if (!item || typeof item !== "object") return null;
      const parsed = item as Partial<VoteRound>;
      return {
        round: typeof parsed.round === "number" ? Math.max(1, Math.floor(parsed.round)) : index + 1,
        votes: parsed.votes && typeof parsed.votes === "object" ? (parsed.votes as Record<string, string>) : {},
        candidateIds: Array.isArray(parsed.candidateIds)
          ? parsed.candidateIds.filter((candidateId): candidateId is string => typeof candidateId === "string")
          : [],
        at: typeof parsed.at === "number" ? parsed.at : Date.now(),
      };
    })
    .filter((item): item is VoteRound => Boolean(item));
}

function normalizeRunoffCandidateIds(value: unknown) {
  return Array.isArray(value) ? value.filter((candidateId): candidateId is string => typeof candidateId === "string") : null;
}

function normalizeWolfIds(room: Partial<Room>) {
  const wolfIds = Array.isArray(room.wolfIds)
    ? room.wolfIds.filter((wolfId): wolfId is string => typeof wolfId === "string")
    : [];
  if (wolfIds.length > 0) return [...new Set(wolfIds)];
  return typeof room.wolfId === "string" ? [room.wolfId] : [];
}

function maxWolfCount(playerCount: number) {
  return Math.max(1, Math.floor((Math.max(3, playerCount) - 1) / 2));
}

function normalizeWolfCount(value: unknown, playerCount: number) {
  const count = typeof value === "number" && Number.isFinite(value) ? Math.floor(value) : 1;
  return Math.max(1, Math.min(maxWolfCount(playerCount), count));
}

function normalizeStoredWolfCount(value: unknown) {
  const count = typeof value === "number" && Number.isFinite(value) ? Math.floor(value) : 1;
  return Math.max(1, Math.min(20, count));
}

const lobbyRounds = [1, 2, 3, 4];

function normalizeRoundsTotal(value: unknown) {
  const round = typeof value === "number" && Number.isFinite(value) ? Math.floor(value) : 3;
  return lobbyRounds.includes(round) ? round : 3;
}

const noWolfChance = 0.1;
const roomStoragePrefix = "wordwolf-room-";
const roomDefaultsStoragePrefix = "wordwolf-room-defaults-";
const topicHistoryKey = "wordwolf-topic-history";
const topicDailyWordHistoryKey = "wordwolf-topic-daily-words";
const topicRequestHistoryLimit = 500;

type WordWolfRoomDefaults = Pick<
  Room,
  | "gameMode"
  | "clueLogVisibility"
  | "clueMode"
  | "randomizeTurnOrder"
  | "roundsTotal"
  | "turnTimeLimitSeconds"
  | "wolfCount"
  | "topicDictionarySource"
  | "topicPairDistance"
  | "topicHint"
>;

function makeId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function getOwnerId() {
  const savedOwnerId = localStorage.getItem("wordwolf-owner-id");
  if (savedOwnerId) return savedOwnerId;

  const ownerId = makeId("owner");
  localStorage.setItem("wordwolf-owner-id", ownerId);
  return ownerId;
}

function makeRoomCode() {
  return Math.random().toString(36).slice(2, 6).toUpperCase();
}

function getRoomKey(code: string) {
  return `${roomStoragePrefix}${code.toUpperCase()}`;
}

function getRoomDefaultsKey(playerId: string, ownerId: string) {
  return `${roomDefaultsStoragePrefix}${playerId || ownerId || "local"}`;
}

function getDefaultRoomSettings(): WordWolfRoomDefaults {
  return {
    gameMode: "wordwolf",
    clueLogVisibility: "always",
    clueMode: "turn",
    randomizeTurnOrder: true,
    roundsTotal: 3,
    turnTimeLimitSeconds: 0,
    wolfCount: 1,
    topicDictionarySource: "llm",
    topicPairDistance: "balanced",
    topicHint: "",
  };
}

function normalizeRoomDefaults(value: unknown): WordWolfRoomDefaults {
  const defaults = getDefaultRoomSettings();
  if (!value || typeof value !== "object") return defaults;

  const parsed = value as Partial<WordWolfRoomDefaults>;
  return {
    gameMode: normalizeGameMode(parsed.gameMode),
    clueLogVisibility: parsed.clueLogVisibility === "result" ? "result" : defaults.clueLogVisibility,
    clueMode: normalizeClueMode(parsed.clueMode),
    randomizeTurnOrder: typeof parsed.randomizeTurnOrder === "boolean" ? parsed.randomizeTurnOrder : defaults.randomizeTurnOrder,
    roundsTotal: normalizeRoundsTotal(parsed.roundsTotal),
    turnTimeLimitSeconds: normalizeCommonTimeLimit(parsed.turnTimeLimitSeconds),
    wolfCount: normalizeStoredWolfCount(parsed.wolfCount),
    topicDictionarySource: normalizeTopicDictionarySource(parsed.topicDictionarySource),
    topicPairDistance: normalizeTopicPairDistance(parsed.topicPairDistance),
    topicHint: typeof parsed.topicHint === "string" ? parsed.topicHint.slice(0, 80) : defaults.topicHint,
  };
}

function loadRoomDefaults(playerId: string, ownerId: string) {
  const raw = localStorage.getItem(getRoomDefaultsKey(playerId, ownerId));
  if (!raw) return getDefaultRoomSettings();

  try {
    return normalizeRoomDefaults(JSON.parse(raw));
  } catch {
    return getDefaultRoomSettings();
  }
}

async function loadRoomDefaultsFromStore(playerId: string, ownerId: string) {
  return loadPlayerRoomDefaults({
    game: "wordwolf",
    playerId,
    localStorageKey: getRoomDefaultsKey(playerId, ownerId),
    normalize: normalizeRoomDefaults,
  });
}

async function saveRoomDefaultsToStore(room: Room) {
  const defaults = normalizeRoomDefaults({
    gameMode: room.gameMode,
    clueLogVisibility: room.clueLogVisibility,
    clueMode: room.clueMode,
    randomizeTurnOrder: room.randomizeTurnOrder,
    roundsTotal: room.roundsTotal,
    turnTimeLimitSeconds: room.turnTimeLimitSeconds,
    wolfCount: room.wolfCount,
    topicDictionarySource: room.topicDictionarySource,
    topicPairDistance: room.topicPairDistance,
    topicHint: room.topicHint,
  });
  await savePlayerRoomDefaults({
    game: "wordwolf",
    playerId: room.hostId,
    localStorageKey: getRoomDefaultsKey(room.hostId, room.ownerId ?? ""),
    defaults,
  });
}

function saveRoom(room: Room) {
  localStorage.setItem(getRoomKey(room.code), JSON.stringify(stampRoom(room)));
}

function deleteRoom(code: string) {
  localStorage.removeItem(getRoomKey(code));
}

function loadRoom(code: string): Room | null {
  const raw = localStorage.getItem(getRoomKey(code));
  if (!raw) return null;

  try {
    const room = JSON.parse(raw) as Room;
    return {
      ...room,
      passphrase: room.passphrase ?? "",
      gameMode: normalizeGameMode(room.gameMode),
      clueLogVisibility: room.clueLogVisibility ?? "result",
      clueMode: normalizeClueMode(room.clueMode),
      randomizeTurnOrder: room.randomizeTurnOrder ?? true,
      roundsTotal: normalizeRoundsTotal(room.roundsTotal),
      turnTimeLimitSeconds: room.turnTimeLimitSeconds ?? 0,
      currentTurnStartedAt: room.currentTurnStartedAt ?? null,
      wolfIds: normalizeWolfIds(room),
      wolfCount: normalizeWolfCount(room.wolfCount, room.players.length),
      voteHistory: normalizeVoteHistory(room.voteHistory),
      runoffCandidateIds: normalizeRunoffCandidateIds(room.runoffCandidateIds),
      topicDictionarySource: normalizeTopicDictionarySource(room.topicDictionarySource ?? room.topicSourceMode),
      topicPairDistance: normalizeTopicPairDistance(room.topicPairDistance ?? room.topicSourceMode),
      topicHint: typeof room.topicHint === "string" ? room.topicHint : "",
      scores: normalizeRoomScores(room.scores),
      gamesPlayed: room.gamesPlayed ?? 0,
      gameNumber: room.gameNumber ?? Math.max(1, (room.gamesPlayed ?? 0) + 1),
    };
  } catch {
    return null;
  }
}

function listRooms(): Room[] {
  const rooms: Room[] = [];

  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (!key?.startsWith(roomStoragePrefix)) continue;

    const room = loadRoom(key.slice(roomStoragePrefix.length));
    if (room) rooms.push(room);
  }

  return rooms;
}

function listJoinableRooms(): RoomChoice[] {
  return listRooms()
    .filter((room) => room.phase === "lobby")
    .map((room) => ({
      code: room.code,
      hostName: room.players.find((player) => player.id === room.hostId)?.name ?? "Unknown",
      playerCount: room.players.length,
      roundsTotal: room.roundsTotal,
      hasPassphrase: Boolean(room.passphrase),
      updatedAt: room.updatedAt,
    }))
    .sort((left, right) => right.updatedAt - left.updatedAt);
}

function deleteHostedRooms(ownerId: string, fallbackHostId: string) {
  listRooms()
    .filter((room) => room.ownerId === ownerId || (!room.ownerId && room.hostId === fallbackHostId))
    .forEach((room) => deleteRoom(room.code));
}

async function saveRoomToStore(room: Room) {
  saveRoom(room);

  try {
    await fetch("/api/wordwolf/rooms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ room }),
    });
  } catch {
    // Local storage keeps solo/browser-tab testing usable when the remote store is unavailable.
  }
}

async function loadRoomFromStore(code: string) {
  try {
    const response = await fetch(`/api/wordwolf/rooms?code=${encodeURIComponent(code)}`, {
      cache: "no-store",
    });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error("ROOM_FETCH_FAILED");

    const data = (await response.json()) as { room?: Room };
    if (!data.room) return null;

    const normalizedRoom = {
      ...data.room,
      passphrase: data.room.passphrase ?? "",
      gameMode: normalizeGameMode(data.room.gameMode),
      clueLogVisibility: data.room.clueLogVisibility ?? "result",
      clueMode: normalizeClueMode(data.room.clueMode),
      randomizeTurnOrder: data.room.randomizeTurnOrder ?? true,
      roundsTotal: normalizeRoundsTotal(data.room.roundsTotal),
      turnTimeLimitSeconds: data.room.turnTimeLimitSeconds ?? 0,
      currentTurnStartedAt: data.room.currentTurnStartedAt ?? null,
      wolfIds: normalizeWolfIds(data.room),
      wolfCount: normalizeWolfCount(data.room.wolfCount, data.room.players.length),
      voteHistory: normalizeVoteHistory(data.room.voteHistory),
      runoffCandidateIds: normalizeRunoffCandidateIds(data.room.runoffCandidateIds),
      topicDictionarySource: normalizeTopicDictionarySource(data.room.topicDictionarySource ?? data.room.topicSourceMode),
      topicPairDistance: normalizeTopicPairDistance(data.room.topicPairDistance ?? data.room.topicSourceMode),
      topicHint: typeof data.room.topicHint === "string" ? data.room.topicHint : "",
      scores: normalizeRoomScores(data.room.scores),
      gamesPlayed: data.room.gamesPlayed ?? 0,
      gameNumber: data.room.gameNumber ?? Math.max(1, (data.room.gamesPlayed ?? 0) + 1),
    };
    saveRoom(normalizedRoom);
    return normalizedRoom;
  } catch {
    return loadRoom(code);
  }
}

async function loadActiveRoomFromStore(playerId: string) {
  try {
    const response = await fetch(`/api/wordwolf/rooms?playerId=${encodeURIComponent(playerId)}`, {
      cache: "no-store",
    });
    if (!response.ok) throw new Error("ACTIVE_ROOM_FETCH_FAILED");

    const data = (await response.json()) as { room?: Room | null };
    if (!data.room) return null;

    const normalizedRoom = {
      ...data.room,
      passphrase: data.room.passphrase ?? "",
      gameMode: normalizeGameMode(data.room.gameMode),
      clueLogVisibility: data.room.clueLogVisibility ?? "result",
      clueMode: normalizeClueMode(data.room.clueMode),
      randomizeTurnOrder: data.room.randomizeTurnOrder ?? true,
      roundsTotal: normalizeRoundsTotal(data.room.roundsTotal),
      turnTimeLimitSeconds: data.room.turnTimeLimitSeconds ?? 0,
      currentTurnStartedAt: data.room.currentTurnStartedAt ?? null,
      wolfIds: normalizeWolfIds(data.room),
      wolfCount: normalizeWolfCount(data.room.wolfCount, data.room.players.length),
      voteHistory: normalizeVoteHistory(data.room.voteHistory),
      runoffCandidateIds: normalizeRunoffCandidateIds(data.room.runoffCandidateIds),
      topicDictionarySource: normalizeTopicDictionarySource(data.room.topicDictionarySource ?? data.room.topicSourceMode),
      topicPairDistance: normalizeTopicPairDistance(data.room.topicPairDistance ?? data.room.topicSourceMode),
      topicHint: typeof data.room.topicHint === "string" ? data.room.topicHint : "",
      scores: normalizeRoomScores(data.room.scores),
      gamesPlayed: data.room.gamesPlayed ?? 0,
      gameNumber: data.room.gameNumber ?? Math.max(1, (data.room.gamesPlayed ?? 0) + 1),
    };
    saveRoom(normalizedRoom);
    return normalizedRoom;
  } catch {
    return null;
  }
}

async function listJoinableRoomsFromStore() {
  try {
    const response = await fetch("/api/wordwolf/rooms", { cache: "no-store" });
    if (!response.ok) throw new Error("ROOM_LIST_FAILED");

    const data = (await response.json()) as { rooms?: RoomChoice[] };
    return Array.isArray(data.rooms) ? data.rooms : [];
  } catch {
    return listJoinableRooms();
  }
}

async function deleteRoomFromStore(code: string) {
  deleteRoom(code);

  try {
    await fetch(`/api/wordwolf/rooms?code=${encodeURIComponent(code)}`, {
      method: "DELETE",
    });
  } catch {
    // Already removed locally; remote cleanup can be retried by host actions later.
  }
}

async function deleteHostedRoomsFromStore(ownerId: string, fallbackHostId: string) {
  deleteHostedRooms(ownerId, fallbackHostId);

  try {
    const params = new URLSearchParams({ ownerId, fallbackHostId });
    await fetch(`/api/wordwolf/rooms?${params.toString()}`, {
      method: "DELETE",
    });
  } catch {
    // Keep local fallback behavior.
  }
}

function createEmptyRoom(
  hostName: string,
  passphrase: string,
  ownerId: string,
  avatarColor: string,
  avatarImage?: string | null,
  hostId?: string,
  savedDefaults?: WordWolfRoomDefaults,
): { room: Room; player: Player } {
  const player = createPlayer(hostName, avatarColor, avatarImage, hostId);
  const defaults = savedDefaults ?? loadRoomDefaults(player.id, ownerId);
  const room: Room = {
    code: makeRoomCode(),
    hostId: player.id,
    ownerId,
    passphrase,
    phase: "lobby",
    gameMode: defaults.gameMode,
    clueLogVisibility: defaults.clueLogVisibility,
    clueMode: defaults.clueMode,
    randomizeTurnOrder: defaults.randomizeTurnOrder,
    players: [player],
    roundsTotal: defaults.roundsTotal,
    turnTimeLimitSeconds: defaults.turnTimeLimitSeconds,
    currentRound: 1,
    currentTurnIndex: 0,
    currentTurnStartedAt: null,
    wolfId: null,
    wolfIds: [],
    wolfCount: defaults.wolfCount,
    villageWord: "",
    wolfWord: "",
    topicReason: "",
    topicSource: "pending",
    topicFallbackExhausted: false,
    topicDictionarySource: defaults.topicDictionarySource,
    topicPairDistance: defaults.topicPairDistance,
    topicHint: defaults.topicHint,
    clues: [],
    votes: {},
    voteHistory: [],
    runoffCandidateIds: null,
    accusedId: null,
    wolfGuess: "",
    wolfGuessJudgement: null,
    winner: null,
    resultText: "",
    scores: {},
    gamesPlayed: 0,
    gameNumber: 1,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  return { room, player };
}

function stampRoom(room: Room) {
  return { ...room, updatedAt: Date.now() };
}

function createPlayer(
  name: string,
  avatarColor = makeRandomAvatarColor(),
  avatarImage?: string | null,
  id?: string,
): Player {
  return {
    id: id ?? makeId("player"),
    name,
    avatarColor,
    avatarImage: avatarImage || undefined,
    joinedAt: Date.now(),
  };
}

function fillSoloTestPlayers(players: Player[]) {
  const nextPlayers = [...players];

  while (nextPlayers.length < 3) {
    nextPlayers.push(createPlayer(`Test Player ${nextPlayers.length + 1}`));
  }

  return nextPlayers;
}

function getJstDateKey() {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function loadTopicHistory() {
  try {
    const parsed = JSON.parse(localStorage.getItem(topicHistoryKey) || "[]");
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function loadDailyTopicWords() {
  try {
    const parsed = JSON.parse(localStorage.getItem(topicDailyWordHistoryKey) || "{}") as {
      date?: unknown;
      words?: unknown;
    };
    if (parsed.date !== getJstDateKey() || !Array.isArray(parsed.words)) return [];
    return parsed.words.filter((item): item is string => typeof item === "string");
  } catch {
    return [];
  }
}

function rememberTopic(topic: WordWolfTopic) {
  const key = getTopicKey(topic);
  const history = loadTopicHistory().filter((item) => item !== key);
  localStorage.setItem(topicHistoryKey, JSON.stringify([key, ...history]));

  const dailyWords = new Set([...loadDailyTopicWords(), ...getTopicWords(topic)]);
  localStorage.setItem(topicDailyWordHistoryKey, JSON.stringify({ date: getJstDateKey(), words: [...dailyWords] }));
}

function isTopicUnusedToday(topic: WordWolfTopic, history: string[], dailyWords: string[]) {
  const usedWords = new Set(dailyWords);
  return !history.includes(getTopicKey(topic)) && getTopicWords(topic).every((word) => !usedWords.has(word));
}

async function fetchTopicWithFallback(
  dictionarySource: TopicDictionarySource,
  pairDistance: TopicPairDistance,
  topicHint: string,
  roomCode: string,
  gameNumber: number,
): Promise<WordWolfTopic> {
  const requiresLlm = dictionarySource === "llm" || dictionarySource === "proper-noun";
  const history = loadTopicHistory();
  const requestHistory = history.slice(0, topicRequestHistoryLimit);
  const dailyWords = loadDailyTopicWords();
  const params = new URLSearchParams({ source: dictionarySource, distance: pairDistance });
  params.set("roomCode", roomCode);
  params.set("gameNumber", String(gameNumber));
  const normalizedTopicHint = topicHint.trim().slice(0, 80);
  if (normalizedTopicHint) {
    params.set("hint", normalizedTopicHint);
  }
  if (requestHistory.length > 0) {
    params.set("exclude", requestHistory.join(","));
  }
  if (dailyWords.length > 0) {
    params.set("excludeWords", dailyWords.join(","));
  }

  const maxAttempts = 1;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const topicTimeoutMs = requiresLlm ? 60000 : 1500;
    const timer = window.setTimeout(() => controller.abort(), topicTimeoutMs);

    try {
      const response = await fetch(`/api/wordwolf/topic?${params.toString()}`, {
        signal: controller.signal,
      });

      if (!response.ok) {
        if (requiresLlm) continue;
        const topic = pickFallbackTopic(history, dictionarySource, pairDistance, dailyWords, normalizedTopicHint);
        rememberTopic(topic);
        return topic;
      }

      const topic = (await response.json()) as WordWolfTopic;
      if (!isValidWordWolfTopic(topic) || !isTopicUnusedToday(topic, history, dailyWords)) {
        if (requiresLlm) continue;
        const fallbackTopic = pickFallbackTopic(history, dictionarySource, pairDistance, dailyWords, normalizedTopicHint);
        rememberTopic(fallbackTopic);
        return fallbackTopic;
      }

      rememberTopic(topic);
      return topic;
    } catch {
      if (requiresLlm) continue;
      const topic = pickFallbackTopic(history, dictionarySource, pairDistance, dailyWords, normalizedTopicHint);
      rememberTopic(topic);
      return topic;
    } finally {
      window.clearTimeout(timer);
    }
  }

  throw new Error("LLM topic generation did not complete.");
}

export function WordWolfGame() {
  const [room, setRoom] = useState<Room | null>(null);
  const [activePlayerId, setActivePlayerId] = useState("");
  const [playerAccountId, setPlayerAccountId] = useState("");
  const [playerName, setPlayerName] = useState("");
  const [roomPassphrase, setRoomPassphrase] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [joinableRooms, setJoinableRooms] = useState<RoomChoice[]>([]);
  const [isJoinListOpen, setIsJoinListOpen] = useState(false);
  const [clueInput, setClueInput] = useState("");
  const [guessInput, setGuessInput] = useState("");
  const [isGuessJudging, setIsGuessJudging] = useState(false);
  const [guessFeedbackMessage, setGuessFeedbackMessage] = useState("");
  const [error, setError] = useState("");
  const [avatarColor, setAvatarColor] = useState(fallbackAvatarColor);
  const [avatarImage, setAvatarImage] = useState<string | null>(null);
  const [isAvatarPickerOpen, setIsAvatarPickerOpen] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [isDebugAuthing, setIsDebugAuthing] = useState(false);
  const [isDebugPasswordOpen, setIsDebugPasswordOpen] = useState(false);
  const [debugPassword, setDebugPassword] = useState("");
  const [debugPasswordError, setDebugPasswordError] = useState("");
  const [isRulesOpen, setIsRulesOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const roomCode = room?.code;
  const roomPhase = room?.phase;

  useEffect(() => {
    let isMounted = true;
    if (!isPlayerAuthenticated()) {
      return () => {
        isMounted = false;
      };
    }

    let timer: number | undefined;
    loadPersistentPlayerSession()
      .then(async (session) => {
        if (!isMounted || !session) return;

        const accountId = session.id ?? "";
        setPlayerName(session.name);
        setPlayerAccountId(accountId);
        setAvatarColor(session.avatarColor);
        setAvatarImage(session.avatarImage);

        const lastCode = localStorage.getItem("wordwolf-last-room");
        const lastPlayer = localStorage.getItem("wordwolf-last-player");
        let savedRoom = lastCode ? await loadRoomFromStore(lastCode) : null;
        if (!savedRoom && accountId) {
          savedRoom = await loadActiveRoomFromStore(accountId);
        }

        if (!isMounted || !savedRoom) return;

        const restoredPlayerId =
          lastPlayer && savedRoom.players.some((player) => player.id === lastPlayer)
            ? lastPlayer
            : savedRoom.players.some((player) => player.id === accountId)
              ? accountId
              : "";

        timer = window.setTimeout(() => {
          setRoom(savedRoom);
          if (restoredPlayerId) {
            setActivePlayerId(restoredPlayerId);
            localStorage.setItem("wordwolf-last-player", restoredPlayerId);
          }
          localStorage.setItem("wordwolf-last-room", savedRoom.code);
        }, 0);
      })
      .catch(() => undefined);

    return () => {
      isMounted = false;
      if (timer) window.clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    if (!roomCode || !roomPhase) return;
    const code = roomCode;

    const refreshRoom = () => {
      if (document.visibilityState !== "visible") return;
      void loadRoomFromStore(code).then((latest) => {
        if (latest) {
          setRoom((current) => {
            if (!current || current.code !== code) return current;
            return latest.updatedAt !== current.updatedAt ||
              latest.statsRecordedAt !== current.statsRecordedAt ||
              latest.gamesPlayed !== current.gamesPlayed
              ? latest
              : current;
          });
        } else {
          setRoom(null);
          setActivePlayerId("");
          setError("部屋が解散されました。");
        }
      });
    };
    const intervalMs = roomPhase === "lobby" || roomPhase === "result" ? 5000 : 2000;
    const timer = window.setInterval(refreshRoom, intervalMs);
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") refreshRoom();
    };

    const onStorage = (event: StorageEvent) => {
      if (event.key !== getRoomKey(code)) return;
      if (!event.newValue) {
        setRoom(null);
        setActivePlayerId("");
        setError("部屋が解散されました。");
        return;
      }

      void loadRoomFromStore(code).then((latest) => {
        if (latest) setRoom(latest);
      });
    };

    window.addEventListener("storage", onStorage);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("storage", onStorage);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [roomCode, roomPhase]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const activePlayer = useMemo(
    () => room?.players.find((player) => player.id === activePlayerId) ?? null,
    [activePlayerId, room],
  );

  const currentPlayer = room?.players[room.currentTurnIndex] ?? null;
  const simultaneousNextCluePlayer = room?.phase === "clue" && room.clueMode === "simultaneous" ? getNextSimultaneousCluePlayer(room) : null;
  const wolfIds = room ? normalizeWolfIds(room) : [];
  const wolfPlayers = room?.players.filter((player) => wolfIds.includes(player.id)) ?? [];
  const wolfPlayer = wolfPlayers[0] ?? null;
  const accusedPlayer = room?.players.find((player) => player.id === room.accusedId) ?? null;
  const accusedIsWolf = Boolean(room?.accusedId && wolfIds.includes(room.accusedId));
  const finalAnswerPlayer = accusedIsWolf ? accusedPlayer : wolfPlayer;
  const nextVotePlayer = room ? getNextVotePlayer(room) : null;
  const isDebugMode = Boolean(room?.debugMode);
  const clueActor = room?.clueMode === "simultaneous"
    ? isDebugMode
      ? simultaneousNextCluePlayer
      : activePlayer &&
          room.phase === "clue" &&
          getClueParticipants(room).some((player) => player.id === activePlayer.id) &&
          !hasPostedClueThisRound(room, activePlayer.id)
        ? activePlayer
        : null
    : isDebugMode
      ? currentPlayer
      : activePlayer;
  const voteActor = room?.phase === "vote"
    ? isDebugMode
      ? nextVotePlayer
      : activePlayer && getVoteVoters(room).some((player) => player.id === activePlayer.id) && !room.votes[activePlayer.id]
        ? activePlayer
        : null
    : null;
  const voteDisplayPlayer = isDebugMode ? voteActor : activePlayer;
  const guessActor = isDebugMode ? finalAnswerPlayer : activePlayer;
  const isHost = Boolean(room && activePlayerId === room.hostId);
  const headerName = activePlayer?.name || playerName.trim() || "ゲスト";
  const headerAvatarColor = activePlayer?.avatarColor || avatarColor;
  const headerAvatarImage = activePlayer?.avatarImage || avatarImage || defaultAvatarImage;
  const displayWordPlayer = isDebugMode && room?.phase === "clue" ? clueActor : activePlayer;
  const ownWord = displayWordPlayer && room && room.phase !== "lobby"
    ? wolfIds.includes(displayWordPlayer.id)
      ? room.wolfWord
      : room.villageWord
    : "";
  const resultTitle = room?.winner === "players"
    ? "結果"
    : room?.winner === "village"
      ? "村側の勝利"
      : "狼の勝利";
  const hasWolfInCurrentGame = wolfIds.length > 0;
  const topicSourceLabel =
    room?.topicSource === "llm"
      ? room.topicDictionarySource === "proper-noun"
        ? "固有名詞"
        : "一般単語"
      : room?.topicSource === "fallback"
        ? room.topicFallbackExhausted
          ? "代替辞書（候補枯渇）"
          : "代替辞書"
        : "未取得";
  const voteVoters = room ? getVoteVoters(room) : [];
  const votedCount = room ? voteVoters.filter((player) => room.votes[player.id]).length : 0;
  const selectedVoteTargetId = room && voteDisplayPlayer ? room.votes[voteDisplayPlayer.id] : undefined;
  const clueParticipants = room ? getClueParticipants(room) : [];
  const clueSubmittedCount = room?.phase === "clue" ? getClueSubmittedCount(room) : 0;
  const canSubmitClue = Boolean(clueActor) && (room?.clueMode === "simultaneous" || clueActor?.id === currentPlayer?.id);
  const voteCandidates = room ? getVoteCandidates(room) : [];
  const allowedWolfCount = room ? maxWolfCount(room.players.length) : 1;
  const wolfCountOptions = room
    ? Array.from(new Set([
        ...Array.from({ length: allowedWolfCount }, (_, index) => index + 1),
        normalizeStoredWolfCount(room.wolfCount),
      ])).sort((left, right) => left - right)
    : [1];
  const isRunoffVote = Boolean(room?.runoffCandidateIds?.length);
  const runoffCandidateNames = room?.runoffCandidateIds
    ?.map((candidateId) => room.players.find((player) => player.id === candidateId)?.name)
    .filter((name): name is string => Boolean(name))
    .join("、") ?? "";
  const roundProgressLabel = room?.runoffCandidateIds?.length && room.currentRound > room.roundsTotal
    ? "追加"
    : room
      ? `${room.currentRound}/${room.roundsTotal}`
      : "";
  const phaseTimeLimitSeconds = room?.turnTimeLimitSeconds && room.currentTurnStartedAt
    ? room.phase === "clue"
      ? room.turnTimeLimitSeconds
      : room.phase === "vote" || room.phase === "wolfGuess"
        ? room.turnTimeLimitSeconds * 2
        : 0
    : 0;
  const shouldShowClueLog = Boolean(
    room &&
      room.phase !== "lobby" &&
      (room.clueLogVisibility === "always" || room.clueMode === "simultaneous" || room.phase === "result"),
  );
  const turnSecondsLeft = room?.currentTurnStartedAt && phaseTimeLimitSeconds > 0
    ? Math.max(
        0,
        phaseTimeLimitSeconds - Math.floor((now - room.currentTurnStartedAt) / 1000),
      )
    : null;
  const roomScoreRows = room
    ? room.players
        .map((player) => ({
          player,
          wins: room.scores[player.id] ?? 0,
        }))
        .sort((left, right) => right.wins - left.wins || left.player.joinedAt - right.player.joinedAt)
    : [];
  const wordwolfLayoutClass =
    room && shouldShowClueLog
      ? "mx-auto grid max-w-[1500px] gap-4 px-4 py-5 lg:grid-cols-[320px_minmax(0,1fr)] xl:grid-cols-[320px_minmax(0,1fr)_360px]"
      : "mx-auto grid max-w-6xl gap-4 px-4 py-5 lg:grid-cols-[340px_1fr]";
  const isMyClueTurn = Boolean(room?.phase === "clue" && canSubmitClue);
  const isMyVoteTurn = Boolean(room?.phase === "vote" && voteActor);
  const isMyFinalAnswerTurn = Boolean(room?.phase === "wolfGuess" && room.accusedId && guessActor?.id === room.accusedId && accusedIsWolf);
  const isMyActionTurn = isMyClueTurn || isMyVoteTurn || isMyFinalAnswerTurn;
  const clueActorId = clueActor?.id ?? "";
  const currentPlayerId = currentPlayer?.id ?? "";
  const guessActorId = guessActor?.id ?? "";
  const phaseVisual = room
    ? room.phase === "clue"
      ? {
          label: room.clueMode === "simultaneous" ? "同時投稿モード" : "投稿モード",
          title: isMyClueTurn ? "あなたの投稿待ちです" : "発言を待っています",
          detail: room.clueMode === "simultaneous"
            ? `この周の投稿 ${clueSubmittedCount}/${clueParticipants.length}`
            : currentPlayer
              ? `現在の手番: ${currentPlayer.name}`
              : "手番を確認中",
          className: "border-cyan-200 bg-cyan-50 text-cyan-950",
          pillClassName: "bg-cyan-600 text-white",
        }
      : room.phase === "vote"
        ? {
            label: isRunoffVote ? "決選投票モード" : "投票モード",
            title: isMyVoteTurn ? "あなたの投票待ちです" : "投票を待っています",
            detail: `投票 ${votedCount}/${voteVoters.length}`,
            className: "border-violet-200 bg-violet-50 text-violet-950",
            pillClassName: "bg-violet-600 text-white",
          }
        : room.phase === "wolfGuess"
          ? {
              label: "逆転回答モード",
              title: isMyFinalAnswerTurn ? "狼の逆転回答待ちです" : "逆転回答を待っています",
              detail: accusedPlayer ? `投票対象: ${accusedPlayer.name}` : "投票結果を確認中",
              className: "border-amber-200 bg-amber-50 text-amber-950",
              pillClassName: "bg-amber-600 text-white",
            }
          : room.phase === "result"
            ? {
                label: "結果発表",
                title: resultTitle,
                detail: "投票結果とお題を確認できます",
                className: "border-emerald-200 bg-emerald-50 text-emerald-950",
                pillClassName: "bg-emerald-600 text-white",
              }
            : {
                label: "ロビー",
                title: "ゲーム開始前です",
                detail: isHost ? "ルールを設定してゲームを開始できます" : "ホストの開始を待っています",
                className: "border-slate-200 bg-slate-50 text-slate-950",
                pillClassName: "bg-slate-800 text-white",
              }
    : null;
  const activeStatusPanelClass = `${panelClass} ${
    isMyActionTurn ? "border-cyan-300 bg-cyan-50/95 shadow-[0_0_0_3px_rgba(34,211,238,0.18),0_18px_50px_rgba(8,145,178,0.18)] animate-pulse" : ""
  }`;

  const setAndSaveRoom = useCallback((nextRoom: Room) => {
    const stampedRoom = stampRoom(nextRoom);
    setRoom(stampedRoom);
    void saveRoomToStore(stampedRoom);
    void saveRoomDefaultsToStore(stampedRoom);
    localStorage.setItem("wordwolf-last-room", stampedRoom.code);
  }, []);

  const createRoom = async () => {
    const name = playerName.trim();
    const passphrase = roomPassphrase.trim();
    if (!name || !playerAccountId) {
      setError("ゲームロビーでプレイヤー登録をしてください。");
      return;
    }

    const ownerId = getOwnerId();
    const fallbackHostId = activePlayerId || localStorage.getItem("wordwolf-last-player") || "";
    await deleteHostedRoomsFromStore(ownerId, fallbackHostId);

    const defaults = await loadRoomDefaultsFromStore(playerAccountId, ownerId);
    const created = createEmptyRoom(name, passphrase, ownerId, avatarColor, avatarImage, playerAccountId, defaults);
    setIsJoinListOpen(false);
    setJoinableRooms([]);
    setActivePlayerId(created.player.id);
    setAndSaveRoom(created.room);
    localStorage.setItem("wordwolf-last-player", created.player.id);
    setError("");
  };

  const showJoinChoices = async () => {
    const rooms = await listJoinableRoomsFromStore();
    setJoinableRooms(rooms);
    setIsJoinListOpen(true);
    setError(rooms.length > 0 ? "" : "参加できる未開始の部屋がありません。");
  };

  const joinRoom = async (selectedCode = joinCode) => {
    const code = selectedCode.trim().toUpperCase();
    const name = playerName.trim();
    const passphrase = roomPassphrase.trim();
    if (!name || !playerAccountId) {
      setError("ゲームロビーでプレイヤー登録をしてください。");
      return;
    }
    if (!code) {
      setError("部屋コードを入力してください。");
      return;
    }

    const targetRoom = await loadRoomFromStore(code);
    if (!targetRoom) {
      setError("その部屋が見つかりません。同じブラウザ内で作った部屋コードを使ってください。");
      return;
    }
    if (targetRoom.phase !== "lobby") {
      setError("開始済みの部屋には参加できません。");
      return;
    }
    if (targetRoom.passphrase && targetRoom.passphrase !== passphrase) {
      setError("合言葉が違います。");
      return;
    }
    const existingPlayer = targetRoom.players.find((player) => player.id === playerAccountId);

    const player = existingPlayer ?? createPlayer(name, avatarColor, avatarImage, playerAccountId);
    const nextRoom = existingPlayer
      ? targetRoom
      : { ...targetRoom, players: [...targetRoom.players, player] };
    setJoinCode(code);
    setIsJoinListOpen(false);
    setJoinableRooms([]);
    setActivePlayerId(player.id);
    setAndSaveRoom(nextRoom);
    localStorage.setItem("wordwolf-last-player", player.id);
    setError("");
  };

  const dissolveRoom = async () => {
    if (!room || !isHost) return;
    if (!window.confirm("部屋を解散しますか？参加者はこの部屋に戻れなくなります。")) return;

    await deleteRoomFromStore(room.code);
    if (localStorage.getItem("wordwolf-last-room") === room.code) {
      localStorage.removeItem("wordwolf-last-room");
      localStorage.removeItem("wordwolf-last-player");
    }
    setRoom(null);
    setActivePlayerId("");
    setError("部屋を解散しました。");
  };

  const logout = () => {
    clearPlayerSession();
    localStorage.removeItem("wordwolf-last-room");
    localStorage.removeItem("wordwolf-last-player");
    setRoom(null);
    setActivePlayerId("");
    setPlayerAccountId("");
    setPlayerName("");
    setRoomPassphrase("");
    setJoinCode("");
    setJoinableRooms([]);
    setIsAvatarPickerOpen(false);
    setError("入力情報をリセットしました。");
  };

  const updatePlayerName = (nextName: string) => {
    setPlayerName(nextName);
    const normalizedName = normalizePlayerName(nextName);

    if (!nextName.trim() || nextName.trim() === "名無し") return;

    void savePersistentPlayerSession({
      name: normalizedName,
      avatarColor,
      avatarImage,
    });

    if (!room || !activePlayerId) return;

    const players = room.players.map((player) =>
      player.id === activePlayerId ? { ...player, name: normalizedName } : player,
    );
    setAndSaveRoom({ ...room, players });
  };

  const commitPlayerName = () => {
    const normalizedName = normalizePlayerName(playerName);
    setPlayerName(normalizedName);
    void savePersistentPlayerSession({
      name: normalizedName,
      avatarColor,
      avatarImage,
    });

    if (!room || !activePlayerId) return;

    const players = room.players.map((player) =>
      player.id === activePlayerId ? { ...player, name: normalizedName } : player,
    );
    setAndSaveRoom({ ...room, players });
  };

  const updateAvatarColor = (nextColor: string) => {
    setAvatarColor(nextColor);
    setIsAvatarPickerOpen(false);
    if (playerName.trim()) {
      void savePersistentPlayerSession({
        name: playerName.trim(),
        avatarColor: nextColor,
        avatarImage,
      });
    }

    if (!room || !activePlayerId) return;

    const players = room.players.map((player) =>
      player.id === activePlayerId ? { ...player, avatarColor: nextColor } : player,
    );
    setAndSaveRoom({ ...room, players });
  };

  const updateAvatarImage = (nextImage: string | null) => {
    setAvatarImage(nextImage);
    if (playerName.trim()) {
      void savePersistentPlayerSession({
        name: playerName.trim(),
        avatarColor,
        avatarImage: nextImage,
      });
    }

    if (!room || !activePlayerId) return;

    const players = room.players.map((player) =>
      player.id === activePlayerId ? { ...player, avatarImage: nextImage || undefined } : player,
    );
    setAndSaveRoom({ ...room, players });
  };

  const uploadAvatarImage = (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("画像ファイルを選んでください。");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string" || !reader.result.startsWith("data:image/")) {
        setError("画像を読み込めませんでした。");
        return;
      }
      updateAvatarImage(reader.result);
      setError("");
    };
    reader.onerror = () => setError("画像を読み込めませんでした。");
    reader.readAsDataURL(file);
  };

  const copyText = async (text: string, successMessage: string) => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const textArea = document.createElement("textarea");
        textArea.value = text;
        textArea.setAttribute("readonly", "");
        textArea.style.position = "fixed";
        textArea.style.opacity = "0";
        document.body.appendChild(textArea);
        try {
          textArea.focus();
          textArea.select();
          document.execCommand("copy");
        } finally {
          document.body.removeChild(textArea);
        }
      }
      setError(successMessage);
    } catch {
      setError("コピーできませんでした。ブラウザの権限を確認してください。");
    }
  };

  const copyRoomCode = () => {
    if (!room) return;
    void copyText(room.code, "ROOMをコピーしました。");
  };

  const copyRoomInvite = () => {
    if (!room) return;
    const passphraseText = room.passphrase ? room.passphrase : "なし";
    void copyText(`ROOM: ${room.code}\n合言葉: ${passphraseText}`, "ROOMと合言葉をコピーしました。");
  };

  const addSeat = () => {
    if (!room) return;
    const playerNumber = room.players.length + 1;
    const player = createPlayer(`Player ${playerNumber}`);
    setAndSaveRoom({ ...room, players: [...room.players, player] });
  };

  const toggleDebugMode = () => {
    if (!room || room.phase !== "lobby") return;

    if (room.debugMode) {
      setAndSaveRoom({ ...room, debugMode: false });
      setError("");
      return;
    }

    setDebugPassword("");
    setDebugPasswordError("");
    setIsDebugPasswordOpen(true);
  };

  const confirmDebugPassword = async () => {
    if (!room || room.phase !== "lobby" || room.debugMode) return;

    setIsDebugAuthing(true);
    setError("");
    setDebugPasswordError("");

    try {
      const response = await fetch("/api/debug-auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: debugPassword }),
      });

      if (!response.ok) {
        setDebugPasswordError(response.status === 503
          ? "デバッグ用パスワードが未設定です。管理者に確認してください。"
          : "デバッグ用パスワードが違います。");
        return;
      }

      setAndSaveRoom({ ...room, debugMode: true });
      setDebugPassword("");
      setIsDebugPasswordOpen(false);
    } catch {
      setError("デバッグモードを切り替えられませんでした。もう一度試してください。");
    } finally {
      setIsDebugAuthing(false);
    }
  };

  const setClueLogVisibility = (clueLogVisibility: ClueLogVisibility) => {
    if (!room || room.phase !== "lobby") return;
    setAndSaveRoom({ ...room, clueLogVisibility });
  };

  const setGameMode = (gameMode: GameMode) => {
    if (!room || room.phase !== "lobby") return;
    setAndSaveRoom({ ...room, gameMode });
  };

  const setWolfCount = (wolfCount: number) => {
    if (!room || room.phase !== "lobby") return;
    setAndSaveRoom({ ...room, wolfCount: normalizeWolfCount(wolfCount, room.players.length) });
  };

  const setClueMode = (clueMode: ClueMode) => {
    if (!room || room.phase !== "lobby") return;
    setAndSaveRoom({ ...room, clueMode });
  };

  const setRandomizeTurnOrder = (randomizeTurnOrder: boolean) => {
    if (!room || room.phase !== "lobby") return;
    setAndSaveRoom({ ...room, randomizeTurnOrder });
  };

  const setTurnTimeLimit = (turnTimeLimitSeconds: number) => {
    if (!room || room.phase !== "lobby") return;
    setAndSaveRoom({ ...room, turnTimeLimitSeconds: normalizeCommonTimeLimit(turnTimeLimitSeconds) });
  };

  const setTopicDictionarySource = (topicDictionarySource: TopicDictionarySource) => {
    if (!room || room.phase !== "lobby") return;
    setAndSaveRoom({ ...room, topicDictionarySource });
  };

  const setTopicPairDistance = (topicPairDistance: TopicPairDistance) => {
    if (!room || room.phase !== "lobby") return;
    setAndSaveRoom({ ...room, topicPairDistance });
  };

  const setTopicHint = (topicHint: string) => {
    if (!room || room.phase !== "lobby") return;
    setAndSaveRoom({ ...room, topicHint: topicHint.slice(0, 80) });
  };

  const startGame = async () => {
    if (!room || isStarting) return;

    setIsStarting(true);
    setError("");

    try {
      if (!room.debugMode && room.players.length < 3) {
        setError("デバッグモードOFFでは3人以上で開始してください。");
        return;
      }

      const topic = await fetchTopicWithFallback(
        room.topicDictionarySource,
        room.topicPairDistance,
        room.topicHint,
        room.code,
        room.gameNumber,
      );
      setError(topic.notice ?? "");
      const basePlayers = room.debugMode ? fillSoloTestPlayers(room.players) : room.players;
      const players = room.randomizeTurnOrder ? shufflePlayers(basePlayers) : basePlayers;
      const roundsTotal = normalizeRoundsTotal(room.roundsTotal);
      const shouldHaveWolf = room.gameMode === "wordwolf" || Math.random() >= noWolfChance;
      const wolfCount = shouldHaveWolf ? normalizeWolfCount(room.wolfCount, players.length) : 0;
      const wolves = shouldHaveWolf ? pickWolves(players, wolfCount) : [];
      const wolfIds = wolves.map((wolf) => wolf.id);
      setAndSaveRoom({
        ...room,
        players,
        debugMode: room.debugMode,
        phase: "clue",
        currentRound: 1,
        roundsTotal,
        currentTurnIndex: 0,
        currentTurnStartedAt: Date.now(),
        wolfId: wolfIds[0] ?? null,
        wolfIds,
        wolfCount: Math.max(1, wolfCount),
        villageWord: topic.villageWord,
        wolfWord: wolves.length > 0 ? topic.wolfWord : topic.villageWord,
        topicReason: topic.reason,
        topicSource: topic.source,
        topicFallbackExhausted: Boolean(topic.fallbackExhausted),
        topicGeneration: topic.generation,
        clues: [],
        votes: {},
        voteHistory: [],
        runoffCandidateIds: null,
        accusedId: null,
        wolfGuess: "",
        wolfGuessJudgement: null,
        winner: null,
        resultText: "",
      });
    } catch {
      setError("お題を取得できませんでした。もう一度試してください。");
    } finally {
      setIsStarting(false);
    }
  };

  // eslint-disable-next-line react-hooks/preserve-manual-memoization
  const submitClue = useCallback(async (isTimeout = false) => {
    if (!room || room.phase !== "clue") return;

    const timeoutText = "\u6642\u9593\u5207\u308c";
    if (room.clueMode === "simultaneous") {
      const latestRoom = await loadRoomFromStore(room.code);
      if (latestRoom && (latestRoom.phase !== "clue" || latestRoom.currentRound !== room.currentRound)) {
        setRoom(latestRoom);
        return;
      }

      const baseRoom =
        latestRoom?.phase === "clue" &&
        latestRoom.clueMode === "simultaneous" &&
        latestRoom.currentRound === room.currentRound
          ? latestRoom
          : room;
      const actorId = clueActorId;
      const actorInBaseRoom = baseRoom.players.find((player) => player.id === actorId);
      const clueTargets = getClueParticipants(baseRoom);
      const targetPlayers = isTimeout
        ? clueTargets.filter((player) => !hasPostedClueThisRound(baseRoom, player.id))
        : actorInBaseRoom && clueTargets.some((player) => player.id === actorInBaseRoom.id) && !hasPostedClueThisRound(baseRoom, actorInBaseRoom.id)
          ? [actorInBaseRoom]
          : [];
      const clueText = isTimeout ? timeoutText : clueInput.trim();
      if (!targetPlayers.length || !clueText) return;

      const nextClues = [
        ...baseRoom.clues,
        ...targetPlayers.map((player) => createClue(player.id, baseRoom.currentRound, clueText)),
      ];
      const submittedIds = new Set(
        nextClues.filter((clue) => clue.round === baseRoom.currentRound).map((clue) => clue.playerId),
      );
      const isRoundComplete = clueTargets.every((player) => submittedIds.has(player.id));
      const isRunoffClue = Boolean(baseRoom.runoffCandidateIds?.length);
      const isLastRound = baseRoom.currentRound >= baseRoom.roundsTotal;

      setClueInput("");
      setAndSaveRoom({
        ...baseRoom,
        clues: nextClues,
        currentTurnIndex: 0,
        currentRound: isRoundComplete && !isRunoffClue && !isLastRound ? baseRoom.currentRound + 1 : baseRoom.currentRound,
        phase: isRoundComplete && (isRunoffClue || isLastRound) ? "vote" : "clue",
        currentTurnStartedAt: isRoundComplete ? Date.now() : baseRoom.currentTurnStartedAt,
      });
      return;
    }

    if (!clueActorId || !currentPlayerId) return;
    const text = isTimeout ? timeoutText : clueInput.trim();
    if (!text || clueActorId !== currentPlayerId) return;

    const { isLastPlayer, nextTurnIndex } = getNextClueTurn(room);
    const isRunoffClue = Boolean(room.runoffCandidateIds?.length);
    const isLastRound = room.currentRound >= room.roundsTotal;
    const nextRoom: Room = {
      ...room,
      clues: [...room.clues, createClue(clueActorId, room.currentRound, text)],
      currentTurnIndex: isLastPlayer ? getFirstClueTurnIndex(room) : nextTurnIndex,
      currentRound: isLastPlayer && !isRunoffClue && !isLastRound ? room.currentRound + 1 : room.currentRound,
      phase: isLastPlayer && (isRunoffClue || isLastRound) ? "vote" : "clue",
      currentTurnStartedAt: Date.now(),
    };

    setClueInput("");
    setAndSaveRoom(nextRoom);
  }, [clueActorId, clueInput, currentPlayerId, room, setAndSaveRoom]); // eslint-disable-line react-hooks/preserve-manual-memoization
  useEffect(() => {
    if (
      !room ||
      room.phase !== "clue" ||
      room.turnTimeLimitSeconds <= 0 ||
      turnSecondsLeft !== 0 ||
      (room.clueMode === "turn" && clueActorId !== currentPlayerId)
    ) {
      return;
    }

    const timer = window.setTimeout(() => void submitClue(true), 0);
    return () => window.clearTimeout(timer);
  }, [clueActorId, currentPlayerId, room, submitClue, turnSecondsLeft]);

  const isComposingEnter = (event: KeyboardEvent<HTMLElement>) =>
    event.nativeEvent.isComposing || event.keyCode === 229;

  const submitClueOnEnter = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.shiftKey || isComposingEnter(event)) return;
    event.preventDefault();
    void submitClue();
  };

  const submitGuessOnEnter = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter" || isComposingEnter(event)) return;
    event.preventDefault();
    void submitWolfGuess();
  };

  const castVote = useCallback(async (targetId: string, isTimeout = false) => {
    if (!room || room.phase !== "vote") return;

    const latestRoom = await loadRoomFromStore(room.code);
    if (latestRoom && latestRoom.phase !== "vote") {
      setRoom(latestRoom);
      return;
    }

    const baseRoom =
      latestRoom?.phase === "vote" &&
      latestRoom.voteHistory.length === room.voteHistory.length &&
      latestRoom.runoffCandidateIds?.join(",") === room.runoffCandidateIds?.join(",")
        ? latestRoom
        : room;
    const candidates = getVoteCandidates(baseRoom);
    if (!candidates.length) return;

    const votes = { ...baseRoom.votes };
    if (isTimeout) {
      getVoteVoters(baseRoom)
        .filter((player) => !votes[player.id])
        .forEach((player) => {
          votes[player.id] = abstainVoteId;
        });
    } else {
      const actorId = voteActor?.id ?? "";
      const actorInBaseRoom = getVoteVoters(baseRoom).find((player) => player.id === actorId);
      if (!actorInBaseRoom || votes[actorInBaseRoom.id]) return;
      if (!candidates.some((player) => player.id === targetId)) return;
      votes[actorInBaseRoom.id] = targetId;
    }

    const nextRoom = { ...baseRoom, votes };

    const requiredVoters = getVoteVoters(baseRoom);
    if (requiredVoters.every((player) => votes[player.id])) {
      const voteRound = createVoteRound(baseRoom, votes);
      const voteHistory = [...baseRoom.voteHistory, voteRound];
      const topTargetIds = getTopVoteTargetIds(nextRoom, votes);

      if (topTargetIds.length > 1) {
        const runoffRoom = {
          ...nextRoom,
          votes: {},
          voteHistory,
          runoffCandidateIds: topTargetIds,
          currentTurnStartedAt: Date.now(),
        };

        const extraRound = baseRoom.currentRound + 1;
        if (getVoteVoters(runoffRoom).length === 0) {
          setAndSaveRoom({
            ...runoffRoom,
            phase: "clue",
            votes: {},
            runoffCandidateIds: null,
            currentRound: extraRound,
            currentTurnIndex: 0,
            currentTurnStartedAt: Date.now(),
          });
          return;
        }

        setAndSaveRoom({
          ...runoffRoom,
          phase: "clue",
          currentRound: extraRound,
          currentTurnIndex: getFirstClueTurnIndex({ ...runoffRoom, phase: "clue", currentRound: extraRound }),
          currentTurnStartedAt: Date.now(),
        });
        return;
      }

      const accusedId = topTargetIds[0] ?? getVoteTarget(nextRoom, votes);
      if (baseRoom.gameMode === "may-no-wolf" && normalizeWolfIds(baseRoom).length === 0) {
        const loserName = nextRoom.players.find((player) => player.id === accusedId)?.name;
        setAndSaveRoom({
          ...nextRoom,
          phase: "result",
          currentTurnStartedAt: null,
          accusedId,
          voteHistory,
          runoffCandidateIds: null,
          winner: "players",
          resultText: accusedId
            ? "\u72fc\u306f\u3044\u307e\u305b\u3093\u3067\u3057\u305f\u3002\u6295\u7968\u3067\u9078\u3070\u308c\u305f" + (loserName ?? "\u30d7\u30ec\u30a4\u30e4\u30fc") + "\u306e\u8ca0\u3051\u3067\u3059\u3002"
            : "\u72fc\u306f\u3044\u307e\u305b\u3093\u3067\u3057\u305f\u3002\u6295\u7968\u304c\u5272\u308c\u305f\u305f\u3081\u6c7a\u7740\u306f\u3064\u304d\u307e\u305b\u3093\u3002",
        });
        return;
      }

      const baseWolfIds = normalizeWolfIds(baseRoom);
      if (accusedId && baseWolfIds.includes(accusedId)) {
        setAndSaveRoom({
          ...nextRoom,
          phase: "wolfGuess",
          accusedId,
          voteHistory,
          runoffCandidateIds: null,
          currentTurnStartedAt: Date.now(),
        });
        return;
      }

      setAndSaveRoom({
        ...nextRoom,
        phase: "result",
        currentTurnStartedAt: null,
        accusedId,
        voteHistory,
        runoffCandidateIds: null,
        winner: "wolf",
        resultText: accusedId
          ? "\u6295\u7968\u3067\u72fc\u3092\u5f53\u3066\u3089\u308c\u307e\u305b\u3093\u3067\u3057\u305f\u3002\u72fc\u306e\u52dd\u5229\u3067\u3059\u3002"
          : "\u6295\u7968\u304c\u5272\u308c\u307e\u3057\u305f\u3002\u72fc\u306e\u52dd\u5229\u3067\u3059\u3002",
      });
      return;
    }

    setAndSaveRoom({ ...nextRoom, currentTurnStartedAt: baseRoom.currentTurnStartedAt });
  }, [room, setAndSaveRoom, voteActor?.id]);

  // eslint-disable-next-line react-hooks/preserve-manual-memoization
  const submitWolfGuess = useCallback(async (isTimeout = false) => {
    if (!room || !guessActorId || !room.accusedId || guessActorId !== room.accusedId || !normalizeWolfIds(room).includes(guessActorId) || isGuessJudging) return;

    const guess = isTimeout ? "\u6642\u9593\u5207\u308c" : guessInput.trim();
    if (!guess) return;

    setIsGuessJudging(true);
    setGuessFeedbackMessage("");

    let judgement: WordWolfGuessJudgement;
    try {
      const response = await fetch("/api/wordwolf/guess", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guess, correct: room.villageWord }),
      });
      const payload = (await response.json()) as { judgement?: WordWolfGuessJudgement };
      if (!response.ok || !payload.judgement) {
        throw new Error("GUESS_JUDGEMENT_FAILED");
      }
      judgement = payload.judgement;
    } catch {
      const accepted = normalizeGuess(guess) === normalizeGuess(room.villageWord);
      judgement = {
        accepted,
        source: accepted ? "exact" : "fuzzy",
        reason: accepted
          ? "\u5b8c\u5168\u4e00\u81f4\u3057\u307e\u3057\u305f\u3002"
          : "\u5224\u5b9a\u306b\u5931\u6557\u3057\u305f\u305f\u3081\u5b8c\u5168\u4e00\u81f4\u306e\u307f\u3067\u5224\u5b9a\u3057\u307e\u3057\u305f\u3002",
        confidence: accepted ? 1 : 0,
        feedbackAccepted: 0,
        feedbackRejected: 0,
      };
    } finally {
      setIsGuessJudging(false);
    }

    setAndSaveRoom({
      ...room,
      phase: "result",
      currentTurnStartedAt: null,
      wolfGuess: guess,
      wolfGuessJudgement: judgement,
      winner: judgement.accepted ? "wolf" : "village",
      resultText: judgement.accepted
        ? "\u9006\u8ee2\u56de\u7b54\u3092\u6b63\u89e3\u6271\u3044\u306b\u3057\u307e\u3057\u305f\u3002\u72fc\u306e\u52dd\u5229\u3067\u3059\u3002"
        : "\u9006\u8ee2\u56de\u7b54\u306f\u4e0d\u6b63\u89e3\u6271\u3044\u3067\u3059\u3002\u6751\u5074\u306e\u52dd\u5229\u3067\u3059\u3002",
    });
  }, [guessActorId, guessInput, isGuessJudging, room, setAndSaveRoom]); // eslint-disable-line react-hooks/preserve-manual-memoization

  useEffect(() => {
    if (
      !room ||
      room.phase !== "vote" ||
      room.turnTimeLimitSeconds <= 0 ||
      turnSecondsLeft !== 0 ||
      getVoteVoters(room).every((player) => room.votes[player.id])
    ) {
      return;
    }

    const timer = window.setTimeout(() => {
      void castVote("", true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [castVote, room, turnSecondsLeft]);

  useEffect(() => {
    if (
      !room ||
      room.phase !== "wolfGuess" ||
      room.turnTimeLimitSeconds <= 0 ||
      turnSecondsLeft !== 0 ||
      !room.accusedId ||
      guessActorId !== room.accusedId ||
      !normalizeWolfIds(room).includes(guessActorId)
    ) {
      return;
    }

    const timer = window.setTimeout(() => void submitWolfGuess(true), 0);
    return () => window.clearTimeout(timer);
  }, [guessActorId, room, submitWolfGuess, turnSecondsLeft]);
  const submitGuessFeedback = async (accepted: boolean) => {
    if (!room || !room.wolfGuess || !room.villageWord) return;

    setGuessFeedbackMessage("");
    try {
      const response = await fetch("/api/wordwolf/guess-feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guess: room.wolfGuess, correct: room.villageWord, accepted }),
      });
      if (!response.ok) throw new Error("GUESS_FEEDBACK_FAILED");
      setGuessFeedbackMessage(
        accepted ? "\u6b63\u89e3\u6271\u3044\u3068\u3057\u3066\u8a18\u61b6\u3057\u307e\u3057\u305f\u3002" : "\u4e0d\u6b63\u89e3\u6271\u3044\u3068\u3057\u3066\u8a18\u61b6\u3057\u307e\u3057\u305f\u3002",
      );
    } catch {
      setGuessFeedbackMessage("\u4fdd\u5b58\u306b\u5931\u6557\u3057\u307e\u3057\u305f\u3002\u3042\u3068\u3067\u3082\u3046\u4e00\u5ea6\u8a66\u3057\u3066\u304f\u3060\u3055\u3044\u3002");
    }
  };

  const resetToLobby = (targetRoom: Room, advanceGame = false): Room => ({
    ...targetRoom,
    phase: "lobby",
    currentRound: 1,
    currentTurnIndex: 0,
    currentTurnStartedAt: null,
    wolfId: null,
    wolfIds: [],
    villageWord: "",
    wolfWord: "",
    topicReason: "",
    topicSource: "pending",
    topicFallbackExhausted: false,
    topicGeneration: undefined,
    clues: [],
    votes: {},
    voteHistory: [],
    runoffCandidateIds: null,
    accusedId: null,
    wolfGuess: "",
    wolfGuessJudgement: null,
    winner: null,
    resultText: "",
    gameNumber: advanceGame ? (targetRoom.gameNumber ?? 1) + 1 : targetRoom.gameNumber,
    statsRecordedAt: undefined,
  });

  const resetRoom = () => {
    if (!room) return;
    setAndSaveRoom(resetToLobby(room, true));
    setGuessInput("");
    setClueInput("");
  };

  const abortGame = () => {
    if (!room || room.phase === "lobby") return;
    setAndSaveRoom(resetToLobby(room));
    setGuessInput("");
    setClueInput("");
  };

  return (
    <main className="min-h-screen bg-slate-950 pt-[104px] text-slate-950 sm:pt-[82px]">
      <section className="fixed inset-x-0 top-0 z-40 border-b border-white/10 bg-[radial-gradient(circle_at_20%_0%,rgba(34,211,238,0.22),transparent_34%),linear-gradient(135deg,#020617_0%,#111827_55%,#3f2b12_100%)] text-white shadow-2xl shadow-slate-950/30">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase text-cyan-200">Room based social deduction</p>
            <h1 className="mt-0.5 text-2xl font-black tracking-normal sm:text-3xl">ワードウルフ・ラウンジ</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Link
              href="/games"
              className="rounded-lg border border-white/15 bg-white/10 px-3 py-1.5 font-semibold text-cyan-50 transition hover:bg-white/15"
            >
              ゲームロビー
            </Link>
            <div className="relative flex min-w-0 items-center gap-2 rounded-lg border border-white/15 bg-white/10 px-3 py-1.5">
              <button
                type="button"
                onClick={() => setIsAvatarPickerOpen((isOpen) => !isOpen)}
                className="grid h-7 w-7 shrink-0 place-items-center overflow-hidden rounded-full border border-white/70 bg-white/10 shadow-sm ring-2 ring-white/10 transition hover:scale-105 focus:outline-none focus:ring-2 focus:ring-cyan-200"
                style={{ backgroundColor: headerAvatarColor }}
                aria-label="アイコン色を選ぶ"
              >
                <span
                  className="h-full w-full bg-cover bg-center"
                  style={{ backgroundImage: `url(${headerAvatarImage})` }}
                  aria-hidden="true"
                />
              </button>
              <span className="max-w-[140px] truncate font-semibold text-cyan-50">{headerName}</span>
              {(activePlayerId || playerName.trim()) && (
                <button
                  type="button"
                  onClick={logout}
                  className="rounded-md border border-white/10 px-2 py-1 text-xs font-semibold text-slate-200 transition hover:bg-white/10 hover:text-white"
                >
                  ログアウト
                </button>
              )}
              {isAvatarPickerOpen && (
                <div className="absolute right-0 top-11 z-50 w-64 rounded-lg border border-white/15 bg-slate-950/95 p-3 shadow-2xl">
                  <label className="block text-xs font-semibold text-cyan-100">
                    プレイヤー名
                    <input
                      value={playerName}
                      onChange={(event) => updatePlayerName(event.target.value)}
                      onBlur={commitPlayerName}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.currentTarget.blur();
                        }
                      }}
                      className="mt-2 w-full rounded-md border border-white/15 bg-white/10 px-2 py-1.5 text-sm font-semibold text-cyan-50 outline-none transition placeholder:text-slate-500 focus:border-cyan-200"
                      placeholder="空欄なら自動生成"
                    />
                  </label>
                  <p className="mt-3 text-xs font-semibold text-cyan-100">アイコン色</p>
                  <div className="mt-2 grid grid-cols-8 gap-2">
                    {avatarColorOptions.map((color) => (
                      <button
                        key={color}
                        type="button"
                        onClick={() => updateAvatarColor(color)}
                        className={`h-8 w-8 rounded-full border transition hover:scale-105 ${
                          headerAvatarColor === color ? "border-white ring-2 ring-cyan-200" : "border-white/30"
                        }`}
                        style={{ backgroundColor: color }}
                        aria-label={`${color} を選択`}
                      />
                    ))}
                  </div>
                  <p className="mt-3 text-xs font-semibold text-cyan-100">デフォルト画像</p>
                  <div className="mt-2 grid grid-cols-5 gap-2">
                    {defaultAvatarImages.map((image, index) => (
                      <button
                        key={image}
                        type="button"
                        onClick={() => updateAvatarImage(image)}
                        className={`h-10 w-10 overflow-hidden rounded-full border bg-cover bg-center transition hover:scale-105 ${
                          headerAvatarImage === image ? "border-white ring-2 ring-cyan-200" : "border-white/30"
                        }`}
                        style={{
                          backgroundColor: headerAvatarColor,
                          backgroundImage: `url(${image})`,
                        }}
                        aria-label={`デフォルト画像 ${index + 1} を選択`}
                      />
                    ))}
                  </div>
                  <label className="mt-3 block cursor-pointer rounded-md border border-white/15 bg-white/10 px-2 py-1.5 text-center text-xs font-semibold text-cyan-50 transition hover:bg-white/15">
                    画像をアップロード
                    <input
                      type="file"
                      accept="image/*"
                      className="sr-only"
                      onChange={(event) => {
                        uploadAvatarImage(event.target.files?.[0]);
                        event.currentTarget.value = "";
                      }}
                    />
                  </label>
                  {avatarImage && (
                    <button
                      type="button"
                      onClick={() => updateAvatarImage(defaultAvatarImage)}
                      className="mt-2 w-full rounded-md border border-white/10 px-2 py-1 text-xs font-semibold text-slate-300 transition hover:bg-white/10"
                    >
                      デフォルト画像に戻す
                    </button>
                  )}
                </div>
              )}
            </div>
            <PaidLlmAccessButton />
            {room && isHost && (
              <button
                type="button"
                onClick={toggleDebugMode}
                disabled={room.phase !== "lobby" || isDebugAuthing}
                className={`rounded-lg border px-3 py-1.5 font-semibold shadow-sm transition disabled:cursor-not-allowed disabled:opacity-50 ${
                  room.debugMode
                    ? "border-cyan-200 bg-cyan-200 text-slate-950 hover:bg-cyan-100"
                    : "border-white/15 bg-white/10 text-cyan-50 hover:bg-white/15"
                }`}
              >
                {isDebugAuthing ? "確認中..." : room.debugMode ? "デバッグ ON" : "デバッグ OFF"}
              </button>
            )}
            <button
              type="button"
              onClick={() => setIsRulesOpen(true)}
              className="rounded-lg border border-amber-200 bg-amber-200 px-3 py-1.5 font-semibold text-slate-950 shadow-sm transition hover:bg-amber-100"
            >
              ルール
            </button>
          </div>
        </div>
      </section>

      {isDebugPasswordOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/70 px-4 py-6 backdrop-blur-sm">
          <form
            className="w-full max-w-sm rounded-lg border border-white/20 bg-white p-5 shadow-2xl"
            onSubmit={(event) => {
              event.preventDefault();
              void confirmDebugPassword();
            }}
          >
            <p className="text-xs font-semibold uppercase text-cyan-700">Debug mode</p>
            <h2 className="mt-1 text-xl font-bold text-slate-950">パスワード確認</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              デバッグモードをONにするにはパスワードが必要です。
            </p>
            <input
              autoFocus
              type="password"
              value={debugPassword}
              onChange={(event) => setDebugPassword(event.target.value)}
              className="mt-4 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-950 outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
              placeholder="パスワード"
              autoComplete="off"
            />
            {debugPasswordError && (
              <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">
                {debugPasswordError}
              </p>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setIsDebugPasswordOpen(false);
                  setDebugPassword("");
                  setDebugPasswordError("");
                }}
                className={subtleButtonClass}
                disabled={isDebugAuthing}
              >
                キャンセル
              </button>
              <button
                type="submit"
                className={cyanButtonClass}
                disabled={!debugPassword || isDebugAuthing}
              >
                {isDebugAuthing ? "確認中..." : "ONにする"}
              </button>
            </div>
          </form>
        </div>
      )}

      {isRulesOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/70 px-4 py-6 backdrop-blur-sm">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="wordwolf-rules-title"
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-white/20 bg-white p-5 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase text-cyan-700">Rules</p>
                <h2 id="wordwolf-rules-title" className="mt-1 text-2xl font-bold text-slate-950">
                  現在のルール
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setIsRulesOpen(false)}
                className={subtleButtonClass}
              >
                閉じる
              </button>
            </div>

            <div className="mt-5 space-y-5 text-sm leading-6 text-slate-700">
              <section>
                <h3 className="text-base font-bold text-slate-950">基本の流れ</h3>
                <ol className="mt-2 list-decimal space-y-1 pl-5">
                  <li>ホストが部屋を作り、参加者が部屋に入ります。</li>
                  <li>ホストがゲームモード、周回数、持ち時間、お題ソースなどを設定します。</li>
                  <li>ゲーム開始後、各プレイヤーに自分のお題が表示されます。</li>
                  <li>順番に、お題そのものを言わず関連する発言を書き込みます。</li>
                  <li>設定した周回が終わったら投票します。</li>
                </ol>
              </section>

              <section>
                <h3 className="text-base font-bold text-slate-950">ワードウルフ</h3>
                <p className="mt-2">
                  設定した人数だけ違うお題を持つ狼になります。投票で狼以外が選ばれたら狼の勝利です。狼が選ばれた場合、その狼は村側のお題を当てると逆転勝利できます。
                </p>
              </section>

              <section>
                <h3 className="text-base font-bold text-slate-950">狼不在設定</h3>
                <p className="mt-2">
                  通常は狼がいますが、10%の確率で狼がいない回になります。狼がいない回では全員が同じお題を持ち、投票で選ばれた人が負けです。同票の場合は決選投票になり、全員同票なら発言をもう1周して再投票します。
                </p>
              </section>

              <section>
                <h3 className="text-base font-bold text-slate-950">デバッグモード</h3>
                <p className="mt-2">
                  デバッグモードでは1人でもテストできます。足りないプレイヤーはテスト用に補完され、発言や投票の操作対象を画面上で切り替えながら確認できます。
                </p>
              </section>

              <section>
                <h3 className="text-base font-bold text-slate-950">お題とログ</h3>
                <p className="mt-2">
                  お題は一般単語または固有名詞から選べます。どちらも型が近い言葉同士になるように生成します。発言ログは部屋設定で、常に表示するかゲーム終了後だけ表示するかを選べます。
                </p>
              </section>
            </div>
          </div>
        </div>
      )}

      <section className={wordwolfLayoutClass}>
        <aside className="space-y-4">
          {!room && (
            <div className={panelClass}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase text-cyan-700">Entry</p>
                  <h2 className="text-lg font-bold text-slate-950">部屋</h2>
                </div>
                <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-500">local</span>
              </div>
              {playerName.trim() ? (
                <div className="mt-3 rounded-lg border border-cyan-100 bg-cyan-50 px-3 py-2 text-sm text-cyan-950">
                  <p className="text-xs font-semibold text-cyan-700">プレイヤー</p>
                  <p className="mt-0.5 font-bold">{playerName.trim()}</p>
                </div>
              ) : (
                <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-950">
                  <p className="font-semibold">先にロビーでプレイヤー登録してください。</p>
                  <Link
                    href="/games"
                    className="mt-2 inline-flex rounded-lg bg-amber-200 px-3 py-2 text-sm font-semibold text-slate-950 transition hover:bg-amber-100"
                  >
                    ゲームロビーへ
                  </Link>
                </div>
              )}
              <label className="mt-3 block text-sm font-medium text-slate-700">
                合言葉（任意）
                <input
                  value={roomPassphrase}
                  onChange={(event) => setRoomPassphrase(event.target.value)}
                  className={`mt-1 ${inputClass}`}
                  placeholder="空欄なら合言葉なし"
                  type="password"
                />
              </label>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  onClick={createRoom}
                  disabled={!playerName.trim()}
                  className={cyanButtonClass}
                >
                  部屋を作成
                </button>
                <button
                  onClick={showJoinChoices}
                  disabled={!playerName.trim()}
                  className={subtleButtonClass}
                >
                  参加
                </button>
              </div>
              <input
                value={joinCode}
                onChange={(event) => setJoinCode(event.target.value.toUpperCase())}
                className={`mt-2 font-mono uppercase ${inputClass}`}
                placeholder="ROOM CODE"
                maxLength={4}
              />
              {isJoinListOpen && (
                <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-800">参加できる部屋</p>
                    <button
                      onClick={showJoinChoices}
                      className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
                    >
                      更新
                    </button>
                  </div>
                  <div className="mt-3 space-y-2">
                    {joinableRooms.length === 0 ? (
                      <p className="rounded-lg bg-white px-3 py-4 text-center text-sm text-slate-500">
                        未開始の部屋はありません。
                      </p>
                    ) : (
                      joinableRooms.map((choice) => (
                        <button
                          key={choice.code}
                          onClick={() => joinRoom(choice.code)}
                          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-sm transition hover:border-cyan-400 hover:bg-cyan-50"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-mono text-base font-bold">{choice.code}</span>
                            <span className="text-xs text-slate-500">
                              {choice.hasPassphrase ? "合言葉あり" : "合言葉なし"}
                            </span>
                          </div>
                          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-600">
                            <span>host: {choice.hostName}</span>
                            <span>{choice.playerCount}人</span>
                            <span>{choice.roundsTotal}周</span>
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                  {joinCode.trim() && (
                    <button
                      onClick={() => joinRoom()}
                      className={`mt-3 w-full ${subtleButtonClass}`}
                    >
                      入力したコードで参加
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {error && <p className="rounded-lg border border-rose-100 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

          {room && (
            <div className={panelClass}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase text-cyan-700">Room</p>
                  <p className="font-mono text-3xl font-black tracking-normal text-slate-950">{room.code}</p>
                </div>
                <div className="flex flex-col items-end gap-1.5">
                  <span className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-900">
                    {room.phase}
                  </span>
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      onClick={copyRoomCode}
                      title="ROOMコードをコピー"
                      aria-label="ROOMコードをコピー"
                      className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-slate-600 shadow-sm transition hover:border-cyan-300 hover:bg-cyan-50 hover:text-cyan-900"
                    >
                      <span className="rounded bg-slate-100 px-1 py-0.5 text-[10px] text-slate-500">コピー</span>
                      <span>ROOM</span>
                    </button>
                    <button
                      type="button"
                      onClick={copyRoomInvite}
                      title="ROOMと合言葉をコピー"
                      aria-label="ROOMと合言葉をコピー"
                      className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-slate-600 shadow-sm transition hover:border-cyan-300 hover:bg-cyan-50 hover:text-cyan-900"
                    >
                      <span className="rounded bg-slate-100 px-1 py-0.5 text-[10px] text-slate-500">コピー</span>
                      <span>ROOM+合言葉</span>
                    </button>
                  </div>
                </div>
              </div>

              <div className="mt-4 space-y-2">
                {room.players.map((player) => (
                  <button
                    key={player.id}
                    onClick={() => {
                      setActivePlayerId(player.id);
                      localStorage.setItem("wordwolf-last-player", player.id);
                    }}
                    className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm ${
                      player.id === activePlayerId
                        ? "border-cyan-500 bg-cyan-50 text-cyan-950"
                        : "border-slate-200 bg-slate-50 text-slate-800 hover:bg-slate-100"
                    }`}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span
                        className="h-4 w-4 shrink-0 rounded-full border border-white bg-cover bg-center shadow-sm"
                        style={{
                          backgroundColor: player.avatarColor || fallbackAvatarColor,
                          backgroundImage: `url(${player.avatarImage || defaultAvatarImage})`,
                        }}
                        aria-hidden="true"
                      />
                      <span className="truncate font-medium">{player.name}</span>
                    </span>
                    {player.id === room.hostId && <span className="text-xs text-slate-500">host</span>}
                  </button>
                ))}
              </div>

              <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-bold text-slate-950">部屋内戦績</p>
                  <span className="rounded-md bg-white px-2 py-1 text-xs font-semibold text-slate-500">
                    {room.gamesPlayed}戦
                  </span>
                </div>
                <div className="mt-3 space-y-2">
                  {roomScoreRows.map(({ player, wins }) => (
                    <div key={player.id} className="flex items-center justify-between gap-3 text-sm">
                      <span className="min-w-0 truncate text-slate-700">{player.name}</span>
                      <span className="shrink-0 rounded-md bg-white px-2 py-1 font-bold text-slate-950">
                        {wins}勝
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {isHost && (
                <button
                  onClick={dissolveRoom}
                  className={`mt-4 w-full ${dangerButtonClass}`}
                >
                  部屋を解散
                </button>
              )}

              {room.phase === "lobby" && (
                <fieldset disabled={!isHost} className="mt-4 space-y-3 disabled:opacity-75">
                  {!isHost && (
                    <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600">
                      ルール設定はホストだけが変更できます。
                    </p>
                  )}
                  <div>
                    <p className="text-sm font-medium text-slate-700">狼不在</p>
                    <div className="mt-1 grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setGameMode("wordwolf")}
                        aria-pressed={room.gameMode === "wordwolf"}
                        className={`rounded-lg border px-3 py-2 text-left text-sm font-semibold ${
                          room.gameMode === "wordwolf"
                            ? "border-cyan-500 bg-cyan-50 text-cyan-950 shadow-sm"
                            : "border-slate-300 bg-slate-50 text-slate-700 hover:bg-slate-100"
                        }`}
                      >
                        なし
                      </button>
                      <button
                        type="button"
                        onClick={() => setGameMode("may-no-wolf")}
                        aria-pressed={room.gameMode === "may-no-wolf"}
                        className={`rounded-lg border px-3 py-2 text-left text-sm font-semibold ${
                          room.gameMode === "may-no-wolf"
                            ? "border-amber-500 bg-amber-50 text-amber-950 shadow-sm"
                            : "border-slate-300 bg-slate-50 text-slate-700 hover:bg-slate-100"
                        }`}
                      >
                        あり
                      </button>
                    </div>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-700">狼の人数</p>
                    <div className="mt-1 grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {wolfCountOptions.map((count) => (
                        <button
                          key={count}
                          type="button"
                          onClick={() => setWolfCount(count)}
                          disabled={count > allowedWolfCount}
                          aria-pressed={room.wolfCount === count}
                          className={`rounded-lg border px-3 py-2 text-left text-sm font-semibold ${
                            room.wolfCount === count
                              ? "border-rose-500 bg-rose-50 text-rose-950 shadow-sm"
                              : count > allowedWolfCount
                                ? "border-slate-200 bg-slate-100 text-slate-400"
                                : "border-slate-300 bg-slate-50 text-slate-700 hover:bg-slate-100"
                          }`}
                        >
                          {count}人
                          {count > allowedWolfCount ? "（人数待ち）" : ""}
                        </button>
                      ))}
                    </div>
                    <p className="mt-1 text-xs font-semibold text-slate-500">
                      5人以上で2人以上にできます。狼不在ありの回で狼が出ない場合は0人になります。
                    </p>
                  </div>
                  <label className="block text-sm font-medium text-slate-700">
                    周回数
                    <select
                      value={room.roundsTotal}
                      onChange={(event) => setAndSaveRoom({ ...room, roundsTotal: normalizeRoundsTotal(Number(event.target.value)) })}
                      className={`mt-1 ${inputClass}`}
                    >
                      {lobbyRounds.map((round) => (
                        <option key={round} value={round}>
                          {round}周
                        </option>
                      ))}
                    </select>
                  </label>
                  <div>
                    <p className="text-sm font-medium text-slate-700">{"\u767a\u8a00\u306e\u9032\u3081\u65b9"}</p>
                    <div className="mt-1 grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setClueMode("turn")}
                        aria-pressed={room.clueMode === "turn"}
                        className={`rounded-lg border px-3 py-2 text-left text-sm font-semibold ${
                          room.clueMode === "turn"
                            ? "border-cyan-500 bg-cyan-50 text-cyan-950 shadow-sm"
                            : "border-slate-300 bg-slate-50 text-slate-700 hover:bg-slate-100"
                        }`}
                      >
                        {"\u9806\u756a"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setClueMode("simultaneous")}
                        aria-pressed={room.clueMode === "simultaneous"}
                        className={`rounded-lg border px-3 py-2 text-left text-sm font-semibold ${
                          room.clueMode === "simultaneous"
                            ? "border-cyan-500 bg-cyan-50 text-cyan-950 shadow-sm"
                            : "border-slate-300 bg-slate-50 text-slate-700 hover:bg-slate-100"
                        }`}
                      >
                        {"\u5168\u54e1\u540c\u6642"}
                      </button>
                    </div>
                  </div>
                  <RoomTimeLimitControl label="持ち時間" value={room.turnTimeLimitSeconds} onChange={setTurnTimeLimit} />
                  <div>
                    <p className="text-sm font-medium text-slate-700">{"\u767a\u8a00\u9806"}</p>
                    <div className="mt-1 grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setRandomizeTurnOrder(true)}
                        aria-pressed={room.randomizeTurnOrder}
                        className={`rounded-lg border px-3 py-2 text-left text-sm font-semibold ${
                          room.randomizeTurnOrder
                            ? "border-cyan-500 bg-cyan-50 text-cyan-950 shadow-sm"
                            : "border-slate-300 bg-slate-50 text-slate-700 hover:bg-slate-100"
                        }`}
                      >
                        {"\u30e9\u30f3\u30c0\u30e0"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setRandomizeTurnOrder(false)}
                        aria-pressed={!room.randomizeTurnOrder}
                        className={`rounded-lg border px-3 py-2 text-left text-sm font-semibold ${
                          !room.randomizeTurnOrder
                            ? "border-cyan-500 bg-cyan-50 text-cyan-950 shadow-sm"
                            : "border-slate-300 bg-slate-50 text-slate-700 hover:bg-slate-100"
                        }`}
                      >
                        {"\u5165\u5ba4\u9806"}
                      </button>
                    </div>
                  </div>
                  <label className="block text-sm font-medium text-slate-700">
                    お題ソース
                    <select
                      value={room.topicDictionarySource}
                      onChange={(event) =>
                        setTopicDictionarySource(normalizeTopicDictionarySource(event.target.value))
                      }
                      className={`mt-1 ${inputClass}`}
                    >
                      <option value="llm">一般単語</option>
                      <option value="proper-noun">固有名詞</option>
                    </select>
                  </label>
                  <label className="block text-sm font-medium text-slate-700">
                    お題の方向性
                    <input
                      value={room.topicHint}
                      onChange={(event) => setTopicHint(event.target.value)}
                      className={`mt-1 ${inputClass}`}
                      maxLength={80}
                      placeholder="例: 夏、映画、食べ物、スポーツ"
                    />
                  </label>
                  <div>
                    <p className="text-sm font-medium text-slate-700">ペアの距離</p>
                    <div className="mt-1 grid grid-cols-3 gap-2">
                      <button
                        type="button"
                        onClick={() => setTopicPairDistance("near")}
                        aria-pressed={room.topicPairDistance === "near"}
                        className={`rounded-lg border px-3 py-2 text-left text-sm font-semibold ${
                          room.topicPairDistance === "near"
                            ? "border-cyan-500 bg-cyan-50 text-cyan-950 shadow-sm"
                            : "border-slate-300 bg-slate-50 text-slate-700 hover:bg-slate-100"
                        }`}
                      >
                        近い
                      </button>
                      <button
                        type="button"
                        onClick={() => setTopicPairDistance("balanced")}
                        aria-pressed={room.topicPairDistance === "balanced"}
                        className={`rounded-lg border px-3 py-2 text-left text-sm font-semibold ${
                          room.topicPairDistance === "balanced"
                            ? "border-cyan-500 bg-cyan-50 text-cyan-950 shadow-sm"
                            : "border-slate-300 bg-slate-50 text-slate-700 hover:bg-slate-100"
                        }`}
                      >
                        普通
                      </button>
                      <button
                        type="button"
                        onClick={() => setTopicPairDistance("wide")}
                        aria-pressed={room.topicPairDistance === "wide"}
                        className={`rounded-lg border px-3 py-2 text-left text-sm font-semibold ${
                          room.topicPairDistance === "wide"
                            ? "border-amber-500 bg-amber-50 text-amber-950 shadow-sm"
                            : "border-slate-300 bg-slate-50 text-slate-700 hover:bg-slate-100"
                        }`}
                      >
                        遠い
                      </button>
                    </div>
                  </div>
                  {room.debugMode && (
                    <button
                      onClick={addSeat}
                      className={`w-full ${subtleButtonClass}`}
                    >
                      テスト用プレイヤー追加
                    </button>
                  )}
                  <label className="block text-sm font-medium text-slate-700">
                    発言ログ
                    <select
                      value={room.clueLogVisibility}
                      onChange={(event) =>
                        setClueLogVisibility(event.target.value as ClueLogVisibility)
                      }
                      className={`mt-1 ${inputClass}`}
                    >
                      <option value="result">ゲーム終了後だけ表示</option>
                      <option value="always">常に表示</option>
                    </select>
                  </label>
                  <button
                    onClick={startGame}
                    disabled={!isHost || isStarting}
                    className={`w-full ${primaryButtonClass}`}
                  >
                    {isStarting ? "お題生成中..." : "ゲーム開始"}
                  </button>
                </fieldset>
              )}
            </div>
          )}
        </aside>

        <section className="space-y-4">
          {!room ? (
            <div className="min-h-[560px] rounded-lg border border-white/10 bg-white/[0.96] p-6 shadow-[0_18px_50px_rgba(15,23,42,0.16)]">
              <div className="grid min-h-[500px] place-items-center rounded-lg border border-dashed border-cyan-200 bg-[radial-gradient(circle_at_50%_20%,rgba(34,211,238,0.18),transparent_34%),linear-gradient(135deg,#ffffff_0%,#f8fafc_55%,#ecfeff_100%)]">
                <div className="max-w-md text-center">
                  <p className="text-sm font-semibold text-cyan-700">準備完了</p>
                  <h2 className="mt-2 text-3xl font-black text-slate-950">名前を入れて部屋を作成</h2>
                  <p className="mt-3 text-sm leading-6 text-slate-600">
                    まずは名前を入力して、部屋を作成するか参加できる部屋を選んでください。1人で動作確認するときは、部屋作成後にデバッグモードをONにすると流れを確認できます。
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <>
              {phaseVisual && (
                <div className={`rounded-lg border p-4 shadow-[0_18px_50px_rgba(15,23,42,0.12)] ${phaseVisual.className}`}>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className={`inline-flex rounded-full px-3 py-1 text-xs font-black ${phaseVisual.pillClassName}`}>
                        {phaseVisual.label}
                      </p>
                      <h2 className="mt-3 text-3xl font-black tracking-normal">{phaseVisual.title}</h2>
                      <p className="mt-1 text-sm font-semibold opacity-80">{phaseVisual.detail}</p>
                    </div>
                    {isMyActionTurn && (
                      <div className="rounded-lg border border-white/70 bg-white/80 px-4 py-3 text-center shadow-sm">
                        <span className="inline-flex h-3 w-3 animate-ping rounded-full bg-cyan-500" aria-hidden="true" />
                        <p className="mt-2 text-sm font-black text-slate-950">あなたの番です</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className={activeStatusPanelClass}>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase text-cyan-700">Active player</p>
                    <p className="text-2xl font-black text-slate-950">{activePlayer?.name ?? "未選択"}</p>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center text-sm sm:w-[360px]">
                    <div className="rounded-lg bg-slate-100 px-2 py-2">
                      <p className="text-xs text-slate-500">人数</p>
                      <p className="font-bold text-slate-950">{room.players.length}</p>
                    </div>
                    <div className="rounded-lg bg-slate-100 px-2 py-2">
                      <p className="text-xs text-slate-500">周回</p>
                      <p className="font-bold text-slate-950">{roundProgressLabel}</p>
                    </div>
                    <div className="rounded-lg bg-slate-100 px-2 py-2">
                      <p className="text-xs text-slate-500">投票</p>
                      <p className="font-bold text-slate-950">{votedCount}/{voteVoters.length}</p>
                    </div>
                  </div>
                </div>

                {ownWord && (
                  <div className={`mt-4 rounded-lg border p-4 ${isMyActionTurn ? "border-cyan-300 bg-white shadow-sm" : "border-cyan-200 bg-cyan-50"}`}>
                    <p className="text-xs font-semibold uppercase text-cyan-700">Your topic</p>
                    <p className="mt-1 text-3xl font-black text-cyan-950">{ownWord}</p>
                  </div>
                )}

                {isDebugMode && (
                  <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
                    <p className="font-semibold">デバッグモード</p>
                    {room.phase === "clue" && currentPlayer && (
                      <p className="mt-1">現在の手番「{currentPlayer.name}」として投稿します。</p>
                    )}
                    {room.phase === "vote" && nextVotePlayer && (
                      <p className="mt-1">次の投票者「{nextVotePlayer.name}」として投票します。</p>
                    )}
                    {room.phase === "wolfGuess" && finalAnswerPlayer && (
                      <p className="mt-1">狼「{finalAnswerPlayer.name}」として逆転回答します。</p>
                    )}
                    {room.phase !== "lobby" && (
                      <button
                        onClick={abortGame}
                        className={`mt-3 ${dangerButtonClass}`}
                      >
                        ゲームを中断
                      </button>
                    )}
                  </div>
                )}
              </div>

              {room.phase === "lobby" && (
                <div className={panelClass}>
                  <p className="text-xs font-semibold uppercase text-cyan-700">Lobby</p>
                  <h2 className="mt-1 text-2xl font-black text-slate-950">ロビー</h2>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    部屋コードを共有して参加してもらいます。1人で動作確認するときは、デバッグモードをONにしてください。
                  </p>
                </div>
              )}

              {room.phase === "clue" && (
                <div className={`rounded-lg border p-4 shadow-[0_18px_50px_rgba(15,23,42,0.16)] ${isMyClueTurn ? "border-cyan-300 bg-cyan-50/95" : "border-white/10 bg-white/[0.96]"}`}>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase text-cyan-700">
                        {room.clueMode === "simultaneous" ? "Simultaneous post" : "Current turn"}
                      </p>
                      <h2 className="mt-1 text-3xl font-black text-slate-950">
                        {room.runoffCandidateIds?.length
                        ? "\u6c7a\u9078\u524d\u306e\u8ffd\u52a0\u767a\u8a00"
                        : room.clueMode === "simultaneous"
                          ? "\u5168\u54e1\u540c\u6642\u6295\u7a3f"
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
                      <p className="mt-1 font-semibold">
                        対象: {runoffCandidateNames || "同率の候補"}
                      </p>
                    </div>
                  ) : null}
                  {room.clueMode === "simultaneous" && (
                    <p className="mt-3 text-sm leading-6 text-slate-600">
                      {"\u3053\u306e\u5468\u306e\u6295\u7a3f"}: {clueSubmittedCount}/{clueParticipants.length}
                    </p>
                  )}
                  {turnSecondsLeft !== null && (
                    <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-950">
                      {"\u6b8b\u308a"} {turnSecondsLeft} {"\u79d2"}
                    </div>
                  )}
                  <textarea
                    value={clueInput}
                    onChange={(event) => setClueInput(event.target.value)}
                    onKeyDown={submitClueOnEnter}
                    disabled={!canSubmitClue}
                    className={`mt-4 min-h-28 resize-y ${inputClass} ${isMyClueTurn ? "border-cyan-400 bg-white ring-2 ring-cyan-400/20" : ""}`}
                    placeholder="\u304a\u984c\u305d\u306e\u3082\u306e\u3092\u8a00\u308f\u305a\u306b\u95a2\u9023\u3059\u308b\u3053\u3068\u3092\u66f8\u304d\u8fbc\u3080"
                  />
                  <button
                    onClick={() => void submitClue()}
                    disabled={!clueInput.trim() || !canSubmitClue}
                    className={`mt-3 ${cyanButtonClass}`}
                  >
                    {room.clueMode === "simultaneous" ? "\u6295\u7a3f\u3059\u308b" : "\u6295\u7a3f\u3057\u3066\u6b21\u3078"}
                  </button>
                </div>
              )}
              {room.phase === "vote" && (
                <div className={`rounded-lg border p-4 shadow-[0_18px_50px_rgba(15,23,42,0.16)] ${isMyVoteTurn ? "border-violet-300 bg-violet-50/95" : "border-white/10 bg-white/[0.96]"}`}>
                  <p className="text-xs font-semibold uppercase text-violet-700">Vote</p>
                  <h2 className="mt-1 text-2xl font-black text-slate-950">
                    {isRunoffVote ? "\u6c7a\u9078\u6295\u7968" : room.gameMode === "may-no-wolf" ? "\u8ffd\u653e\u6295\u7968" : "\u8ab0\u304c\u72fc\u304b\u6295\u7968"}
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    {"\u5168\u54e1\u304c\u540c\u6642\u306b\u6295\u7968\u3067\u304d\u307e\u3059\u3002\u6295\u7968"}: {votedCount}/{voteVoters.length}
                  </p>
                  {voteDisplayPlayer && room.votes[voteDisplayPlayer.id] ? (
                    <p className="mt-1 text-sm font-semibold text-cyan-700">{"\u6295\u7968\u6e08\u307f\u3067\u3059\u3002\u4ed6\u306e\u30d7\u30ec\u30a4\u30e4\u30fc\u3092\u5f85\u3063\u3066\u3044\u307e\u3059\u3002"}</p>
                  ) : null}
                  {isDebugMode && voteActor ? (
                    <p className="mt-1 text-sm font-semibold text-slate-600">
                      {voteActor.name}{"\u306e\u6295\u7968\u3092\u64cd\u4f5c\u4e2d"}
                    </p>
                  ) : null}
                  {isRunoffVote && (
                    <div className="mt-3 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-sm leading-6 text-violet-950">
                      <p className="font-black">同率投票のため決選投票です。</p>
                      <p className="mt-1 font-semibold">
                        対象: {runoffCandidateNames || "同率の候補"}。候補以外のプレイヤーだけが投票します。
                      </p>
                    </div>
                  )}
                  {turnSecondsLeft !== null && (
                    <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-950">
                      {"\u6b8b\u308a"} {turnSecondsLeft} {"\u79d2"}
                    </div>
                  )}
                  <div className="mt-4 grid gap-2 sm:grid-cols-2">
                    {voteCandidates.map((player) => (
                      <button
                        key={player.id}
                        onClick={() => void castVote(player.id)}
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
              )}
              {room.phase === "wolfGuess" && (
                <div className={`rounded-lg border border-amber-200 bg-amber-50 p-5 shadow-[0_18px_50px_rgba(120,53,15,0.16)] ${isMyFinalAnswerTurn ? "animate-pulse ring-4 ring-amber-300/30" : ""}`}>
                  <p className="text-xs font-semibold uppercase text-amber-700">Final chance</p>
                  <h2 className="mt-1 text-2xl font-black text-slate-950">{"\u72fc\u304c\u898b\u3064\u304b\u308a\u307e\u3057\u305f"}</h2>
                  <p className="mt-2 text-sm leading-6 text-slate-700">
                    {"\u6295\u7968\u5bfe\u8c61\u306f"} {accusedPlayer?.name} {"\u3067\u3059\u3002\u72fc\u306f\u6751\u5074\u306e\u304a\u984c\u3092\u5f53\u3066\u308c\u3070\u9006\u8ee2\u52dd\u5229\u3067\u3059\u3002"}
                  </p>
                  {turnSecondsLeft !== null && (
                    <div className="mt-4 rounded-lg border border-amber-300 bg-white/70 px-3 py-2 text-sm font-semibold text-amber-950">
                      {"\u6b8b\u308a"} {turnSecondsLeft} {"\u79d2"}
                    </div>
                  )}
                  <input
                    value={guessInput}
                    onChange={(event) => setGuessInput(event.target.value)}
                    onKeyDown={submitGuessOnEnter}
                    disabled={!isMyFinalAnswerTurn}
                    className="mt-4 w-full rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 disabled:bg-amber-100"
                    placeholder="\u6751\u5074\u306e\u304a\u984c\u3092\u5165\u529b"
                  />
                  <button
                    onClick={() => void submitWolfGuess()}
                    disabled={isGuessJudging || !guessInput.trim() || !isMyFinalAnswerTurn}
                    className="mt-3 rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-amber-500 disabled:bg-slate-300"
                  >
                    {isGuessJudging ? "\u5224\u5b9a\u4e2d..." : "\u56de\u7b54\u3059\u308b"}
                  </button>
                </div>
              )}
              {room.phase === "result" && (
                <div className={panelClass}>
                  <p className="text-xs font-semibold uppercase text-cyan-700">Result</p>
                  <h2 className="mt-1 text-3xl font-black text-slate-950">{resultTitle}</h2>
                  <p className="mt-3 text-sm leading-6 text-slate-700">{room.resultText}</p>
                  <VoteHistoryPanel room={room} />
                  {hasWolfInCurrentGame && room.wolfGuess && (
                    <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="text-xs font-semibold uppercase text-amber-700">Final answer review</p>
                          <h3 className="mt-1 text-lg font-black text-slate-950">{"\u9006\u8ee2\u56de\u7b54\u306e\u5224\u5b9a"}</h3>
                        </div>
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-bold ${
                            room.wolfGuessJudgement?.accepted
                              ? "bg-cyan-100 text-cyan-900"
                              : "bg-rose-100 text-rose-900"
                          }`}
                        >
                          {room.wolfGuessJudgement?.accepted ? "\u6b63\u89e3\u6271\u3044" : "\u4e0d\u6b63\u89e3\u6271\u3044"}
                        </span>
                      </div>
                      <dl className="mt-3 grid gap-3 sm:grid-cols-2">
                        <div className="rounded-lg bg-white/70 p-3">
                          <dt className="text-xs font-semibold text-slate-500">{"\u5b9f\u56de\u7b54"}</dt>
                          <dd className="mt-1 text-lg font-bold text-slate-950">{room.wolfGuess}</dd>
                        </div>
                        <div className="rounded-lg bg-white/70 p-3">
                          <dt className="text-xs font-semibold text-slate-500">{"\u6b63\u89e3"}</dt>
                          <dd className="mt-1 text-lg font-bold text-slate-950">{room.villageWord}</dd>
                        </div>
                      </dl>
                      {room.wolfGuessJudgement && (
                        <p className="mt-3 text-sm leading-6 text-slate-700">
                          {"\u5224\u5b9a\u7406\u7531"}: {room.wolfGuessJudgement.reason} / source: {room.wolfGuessJudgement.source} / confidence: {Math.round(room.wolfGuessJudgement.confidence * 100)}%
                        </p>
                      )}
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => void submitGuessFeedback(true)}
                          className="rounded-lg border border-cyan-200 bg-cyan-100 px-3 py-2 text-sm font-bold text-cyan-950 transition hover:bg-cyan-50"
                        >
                          {"\u6b63\u89e3\u6271\u3044\u3067\u8a18\u61b6"}
                        </button>
                        <button
                          type="button"
                          onClick={() => void submitGuessFeedback(false)}
                          className="rounded-lg border border-rose-200 bg-rose-100 px-3 py-2 text-sm font-bold text-rose-950 transition hover:bg-rose-50"
                        >
                          {"\u4e0d\u6b63\u89e3\u6271\u3044\u3067\u8a18\u61b6"}
                        </button>
                      </div>
                      {guessFeedbackMessage && <p className="mt-2 text-sm font-semibold text-slate-700">{guessFeedbackMessage}</p>}
                    </div>
                  )}
                  <dl className="mt-4 grid gap-3 sm:grid-cols-3">
                    <div className="rounded-lg bg-slate-100 p-3">
                      <dt className="text-xs text-slate-500">村側のお題</dt>
                      <dd className="mt-1 text-lg font-bold text-slate-950">{room.villageWord}</dd>
                    </div>
                    {hasWolfInCurrentGame ? (
                      <>
                        <div className="rounded-lg bg-slate-100 p-3">
                          <dt className="text-xs text-slate-500">狼のお題</dt>
                          <dd className="mt-1 text-lg font-bold text-slate-950">{room.wolfWord}</dd>
                        </div>
                        <div className="rounded-lg bg-slate-100 p-3">
                          <dt className="text-xs text-slate-500">狼</dt>
                          <dd className="mt-1 text-lg font-bold text-slate-950">
                            {wolfPlayers.map((player) => player.name).join("、") || "なし"}
                          </dd>
                        </div>
                      </>
                    ) : (
                      <div className="rounded-lg bg-slate-100 p-3 sm:col-span-2">
                        <dt className="text-xs text-slate-500">投票で選ばれた人</dt>
                        <dd className="mt-1 text-lg font-bold text-slate-950">{accusedPlayer?.name ?? "なし"}</dd>
                      </div>
                    )}
                  </dl>
                  <p className="mt-3 text-xs leading-5 text-slate-500">
                    お題理由: {room.topicReason} / 取得元: {topicSourceLabel}
                  </p>
                  {room.topicGeneration && (activePlayerId || playerAccountId) && (
                    <GameFeedbackPanel
                      artifactId={`wordwolf:${room.code}:${room.gameNumber}:${room.villageWord}:${room.wolfWord}`}
                      artifactText={`村側=${room.villageWord} / 狼側=${room.wolfWord} / 理由=${room.topicReason}`}
                      game="wordwolf"
                      task="wordwolf.topic"
                      playerId={activePlayerId || playerAccountId}
                      generation={room.topicGeneration}
                      reasonOptions={wordwolfFeedbackReasons}
                      settings={{
                        dictionarySource: room.topicDictionarySource,
                        pairDistance: room.topicPairDistance,
                        topicHint: room.topicHint,
                        playerCount: room.players.length,
                        wolfCount: wolfIds.length,
                      }}
                      outcome={{
                        winner: room.winner ?? "unknown",
                        accusedIsWolf,
                        voteRounds: room.voteHistory.length,
                      }}
                    />
                  )}
                  {isHost && (
                    <div className="mt-4">
                      <p className="text-sm leading-6 text-slate-600">
                        同じ卓のままロビーに戻り、周数やログ表示を設定し直して続行できます。
                      </p>
                      <button
                        onClick={resetRoom}
                        className={`mt-3 ${primaryButtonClass}`}
                      >
                        ルール設定に戻って卓を続行
                      </button>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </section>
        {shouldShowClueLog && room && (
          <aside className="lg:col-span-2 xl:col-span-1 xl:sticky xl:top-[104px] xl:self-start">
            <ClueLogPanel room={room} />
          </aside>
        )}
      </section>
    </main>
  );
}

"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import {
  avatarColorOptions,
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
import { createGameTimerEventId } from "@/lib/game-timer/event";
import {
  isValidWordWolfTopic,
  normalizeTopicDictionarySource,
  normalizeTopicPairDistance,
  type TopicDictionarySource,
  type TopicPairDistance,
  type WordWolfTopic,
} from "@/lib/wordwolf";
import { PaidLlmAccessButton } from "../components/PaidLlmAccessButton";
import { DebugModeButton } from "../components/DebugModeButton";
import { GamePlayerMenu } from "../components/GamePlayerMenu";
import { FullScreenPageOverlay } from "../components/FullScreenPageOverlay";
import { GameTopBanner, gameTopBannerOffsetClass } from "../components/GameTopBanner";
import { GameTopMenu, gameTopBannerActionClass, gameTopBannerDangerActionClass, gameTopMenuItemClass } from "../components/GameTopMenu";
import { DebugWordGenerationTest, type DebugWordGenerationResult } from "../components/DebugWordGenerationTest";
import { GameFeedbackPanel } from "../components/GameFeedbackPanel";
import { GameRulesDialog } from "../components/GameRulesDialog";
import { RoomResultActions } from "../components/RoomResultActions";
import { RoomTimeLimitControl } from "../components/RoomTimeLimitControl";
import { onlineRoomPollingIntervals, useOnlineRoomPolling } from "../hooks/use-online-room-polling";
import type {
  ClueLogVisibility,
  ClueMode,
  GameMode,
  Player,
  Room,
  RoomChoice,
  VoteRound,
  WordWolfRoomAction,
} from "@/lib/wordwolf-game-types";
import {
  getClueParticipants,
  getClueSubmittedCount,
  getNextSimultaneousCluePlayer,
  getNextVotePlayer,
  getVoteCandidates,
  getVoteVoters,
  hasPostedClueThisRound,
} from "./game-flow";
import { ClueLogPanel, VoteHistoryPanel } from "./WordWolfPanels";
import { WordWolfActionPanels } from "./WordWolfActionPanels";
import {
  fetchWordWolfRoom,
  fetchActiveWordWolfRoom,
  fetchJoinableWordWolfRooms,
  expireWordWolfPhase,
  castWordWolfVote,
  joinWordWolfRoom,
  createWordWolfRoom,
  applyWordWolfRoomAction,
  removeHostedWordWolfRooms,
  removeWordWolfRoom,
  startWordWolfGame,
  submitWordWolfClue,
  submitWordWolfGuessCommand,
} from "./wordwolf-room-api-client";
import { useWordWolfPhaseClock } from "./use-wordwolf-phase-clock";
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

const roomStoragePrefix = "wordwolf-room-";
const roomDefaultsStoragePrefix = "wordwolf-room-defaults-";

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
  localStorage.setItem(getRoomKey(room.code), JSON.stringify(room));
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
      revision: room.revision ?? 0,
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

async function loadRoomFromStore(code: string) {
  try {
    const remoteRoom = await fetchWordWolfRoom(code);
    if (!remoteRoom) return null;

    const normalizedRoom = {
      ...remoteRoom,
      passphrase: remoteRoom.passphrase ?? "",
      gameMode: normalizeGameMode(remoteRoom.gameMode),
      clueLogVisibility: remoteRoom.clueLogVisibility ?? "result",
      clueMode: normalizeClueMode(remoteRoom.clueMode),
      randomizeTurnOrder: remoteRoom.randomizeTurnOrder ?? true,
      roundsTotal: normalizeRoundsTotal(remoteRoom.roundsTotal),
      turnTimeLimitSeconds: remoteRoom.turnTimeLimitSeconds ?? 0,
      currentTurnStartedAt: remoteRoom.currentTurnStartedAt ?? null,
      wolfIds: normalizeWolfIds(remoteRoom),
      wolfCount: normalizeWolfCount(remoteRoom.wolfCount, remoteRoom.players.length),
      voteHistory: normalizeVoteHistory(remoteRoom.voteHistory),
      runoffCandidateIds: normalizeRunoffCandidateIds(remoteRoom.runoffCandidateIds),
      topicDictionarySource: normalizeTopicDictionarySource(remoteRoom.topicDictionarySource ?? remoteRoom.topicSourceMode),
      topicPairDistance: normalizeTopicPairDistance(remoteRoom.topicPairDistance ?? remoteRoom.topicSourceMode),
      topicHint: typeof remoteRoom.topicHint === "string" ? remoteRoom.topicHint : "",
      scores: normalizeRoomScores(remoteRoom.scores),
      gamesPlayed: remoteRoom.gamesPlayed ?? 0,
      gameNumber: remoteRoom.gameNumber ?? Math.max(1, (remoteRoom.gamesPlayed ?? 0) + 1),
    };
    saveRoom(normalizedRoom);
    return normalizedRoom;
  } catch {
    return loadRoom(code);
  }
}

async function loadActiveRoomFromStore(playerId: string) {
  try {
    const activeRoom = await fetchActiveWordWolfRoom(playerId);
    if (!activeRoom) return null;

    const normalizedRoom = {
      ...activeRoom,
      passphrase: activeRoom.passphrase ?? "",
      gameMode: normalizeGameMode(activeRoom.gameMode),
      clueLogVisibility: activeRoom.clueLogVisibility ?? "result",
      clueMode: normalizeClueMode(activeRoom.clueMode),
      randomizeTurnOrder: activeRoom.randomizeTurnOrder ?? true,
      roundsTotal: normalizeRoundsTotal(activeRoom.roundsTotal),
      turnTimeLimitSeconds: activeRoom.turnTimeLimitSeconds ?? 0,
      currentTurnStartedAt: activeRoom.currentTurnStartedAt ?? null,
      wolfIds: normalizeWolfIds(activeRoom),
      wolfCount: normalizeWolfCount(activeRoom.wolfCount, activeRoom.players.length),
      voteHistory: normalizeVoteHistory(activeRoom.voteHistory),
      runoffCandidateIds: normalizeRunoffCandidateIds(activeRoom.runoffCandidateIds),
      topicDictionarySource: normalizeTopicDictionarySource(activeRoom.topicDictionarySource ?? activeRoom.topicSourceMode),
      topicPairDistance: normalizeTopicPairDistance(activeRoom.topicPairDistance ?? activeRoom.topicSourceMode),
      topicHint: typeof activeRoom.topicHint === "string" ? activeRoom.topicHint : "",
      scores: normalizeRoomScores(activeRoom.scores),
      gamesPlayed: activeRoom.gamesPlayed ?? 0,
      gameNumber: activeRoom.gameNumber ?? Math.max(1, (activeRoom.gamesPlayed ?? 0) + 1),
    };
    saveRoom(normalizedRoom);
    return normalizedRoom;
  } catch {
    return null;
  }
}

async function listJoinableRoomsFromStore() {
  try {
    return await fetchJoinableWordWolfRooms();
  } catch {
    return listJoinableRooms();
  }
}

async function deleteRoomFromStore(code: string) {
  deleteRoom(code);

  try {
    await removeWordWolfRoom(code);
  } catch {
    // Already removed locally; remote cleanup can be retried by host actions later.
  }
}

async function deleteHostedRoomsFromStore(ownerId: string, fallbackHostId: string) {
  try {
    await removeHostedWordWolfRooms(ownerId, fallbackHostId);
    deleteHostedRooms(ownerId, fallbackHostId);
    return true;
  } catch {
    return false;
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
    revision: 0,
    code: makeRoomCode(),
    hostId: player.id,
    ownerId,
    passphrase,
    phase: "lobby",
    debugReplayEnabled: false,
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
  const [isRulesOpen, setIsRulesOpen] = useState(false);
  const [isMyPageOpen, setIsMyPageOpen] = useState(false);
  const timeoutActionKeyRef = useRef("");
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
        let savedRoom = accountId ? await loadActiveRoomFromStore(accountId) : null;
        if (!savedRoom && lastCode) savedRoom = await loadRoomFromStore(lastCode);

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

  useOnlineRoomPolling({
    roomCode,
    intervalMs: roomPhase === "lobby" || roomPhase === "result" ? onlineRoomPollingIntervals.idle : onlineRoomPollingIntervals.active,
    fetchRoom: loadRoomFromStore,
    onRoom: (latest) => setRoom((current) => {
      if (!current || current.code !== latest.code) return current;
      return latest.updatedAt !== current.updatedAt ||
        latest.statsRecordedAt !== current.statsRecordedAt ||
        latest.gamesPlayed !== current.gamesPlayed
        ? latest
        : current;
    }),
    onMissing: () => {
      setRoom(null);
      setActivePlayerId("");
      setError("部屋が解散されました。");
    },
    storageKey: getRoomKey,
  });

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
  const { secondsLeft: turnSecondsLeft } = useWordWolfPhaseClock({
    phase: room?.phase,
    configuredSeconds: room?.turnTimeLimitSeconds ?? 0,
    startedAt: room?.currentTurnStartedAt,
  });
  const shouldShowClueLog = Boolean(
    room &&
      room.phase !== "lobby" &&
      (room.clueLogVisibility === "always" || room.clueMode === "simultaneous" || room.phase === "result"),
  );
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

  const runRoomAction = useCallback(async (action: WordWolfRoomAction, persistDefaults = false) => {
    if (!room) return null;
    try {
      const saved = await applyWordWolfRoomAction(room.code, action);
      saveRoom(saved);
      setRoom(saved);
      if (persistDefaults) void saveRoomDefaultsToStore(saved);
      localStorage.setItem("wordwolf-last-room", saved.code);
      setError("");
      return saved;
    } catch {
      setError("部屋の更新に失敗しました。最新状態を確認してもう一度お試しください。");
      return null;
    }
  }, [room]);

  const createRoom = async () => {
    const name = playerName.trim();
    const passphrase = roomPassphrase.trim();
    if (!name || !playerAccountId) {
      setError("ゲームロビーでプレイヤー登録をしてください。");
      return;
    }

    const ownerId = getOwnerId();
    const fallbackHostId = activePlayerId || localStorage.getItem("wordwolf-last-player") || "";
    if (!await deleteHostedRoomsFromStore(ownerId, fallbackHostId)) {
      setError("プレイ中の部屋があるため、新しい部屋は作れません。その部屋へ戻ってください。");
      return;
    }

    const defaults = await loadRoomDefaultsFromStore(playerAccountId, ownerId);
    const created = createEmptyRoom(name, passphrase, ownerId, avatarColor, avatarImage, playerAccountId, defaults);
    setIsJoinListOpen(false);
    setJoinableRooms([]);
    setActivePlayerId(created.player.id);
    try {
      const saved = await createWordWolfRoom(created.room);
      saveRoom(saved.room);
      setRoom(saved.room);
      void saveRoomDefaultsToStore(saved.room);
      localStorage.setItem("wordwolf-last-room", saved.room.code);
    } catch {
      setError("部屋を作成できませんでした。");
      return;
    }
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

    try {
      const { room: joinedRoom } = await joinWordWolfRoom(code, passphrase);
      setJoinCode(code);
      setIsJoinListOpen(false);
      setJoinableRooms([]);
      setActivePlayerId(playerAccountId);
      saveRoom(joinedRoom);
      setRoom(joinedRoom);
      localStorage.setItem("wordwolf-last-player", playerAccountId);
      localStorage.setItem("wordwolf-last-room", joinedRoom.code);
      setError("");
    } catch {
      setError("部屋が見つからないか、合言葉が違います。");
    }
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

    void runRoomAction({ type: "update-player", name: normalizedName, avatarColor, avatarImage: avatarImage ?? undefined });
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

    void runRoomAction({ type: "update-player", name: normalizedName, avatarColor, avatarImage: avatarImage ?? undefined });
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

    void runRoomAction({ type: "update-player", name: playerName.trim(), avatarColor: nextColor, avatarImage: avatarImage ?? undefined });
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

    void runRoomAction({ type: "update-player", name: playerName.trim(), avatarColor, avatarImage: nextImage });
  };

  const uploadAvatarImage = (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("画像ファイルを選んでください。");
      return;
    }
    if (file.size > 150_000) {
      setError("画像は150KB以下にしてください。");
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
    const passphraseText = roomPassphrase.trim() || (room.passphrase ? "設定済み（再表示不可）" : "なし");
    void copyText(`ROOM: ${room.code}\n合言葉: ${passphraseText}`, "ROOMと合言葉をコピーしました。");
  };

  const addSeat = () => {
    if (!room) return;
    void runRoomAction({ type: "debug-add-player" });
  };

  const setClueLogVisibility = (clueLogVisibility: ClueLogVisibility) => {
    if (!room || room.phase !== "lobby") return;
    void runRoomAction({ type: "update-config", config: { clueLogVisibility } }, true);
  };

  const setGameMode = (gameMode: GameMode) => {
    if (!room || room.phase !== "lobby") return;
    void runRoomAction({ type: "update-config", config: { gameMode } }, true);
  };

  const setWolfCount = (wolfCount: number) => {
    if (!room || room.phase !== "lobby") return;
    void runRoomAction({ type: "update-config", config: { wolfCount: normalizeWolfCount(wolfCount, room.players.length) } }, true);
  };

  const setClueMode = (clueMode: ClueMode) => {
    if (!room || room.phase !== "lobby") return;
    void runRoomAction({ type: "update-config", config: { clueMode } }, true);
  };

  const setRandomizeTurnOrder = (randomizeTurnOrder: boolean) => {
    if (!room || room.phase !== "lobby") return;
    void runRoomAction({ type: "update-config", config: { randomizeTurnOrder } }, true);
  };

  const setTurnTimeLimit = (turnTimeLimitSeconds: number) => {
    if (!room || room.phase !== "lobby") return;
    void runRoomAction({ type: "update-config", config: { turnTimeLimitSeconds: normalizeCommonTimeLimit(turnTimeLimitSeconds) } }, true);
  };

  const setTopicDictionarySource = (topicDictionarySource: TopicDictionarySource) => {
    if (!room || room.phase !== "lobby") return;
    void runRoomAction({ type: "update-config", config: { topicDictionarySource } }, true);
  };

  const setTopicPairDistance = (topicPairDistance: TopicPairDistance) => {
    if (!room || room.phase !== "lobby") return;
    void runRoomAction({ type: "update-config", config: { topicPairDistance } }, true);
  };

  const setTopicHint = (topicHint: string) => {
    if (!room || room.phase !== "lobby") return;
    void runRoomAction({ type: "update-config", config: { topicHint: topicHint.slice(0, 80) } }, true);
  };

  const testWordGeneration = async (forceNew: boolean): Promise<DebugWordGenerationResult> => {
    if (!room) throw new Error("部屋の設定を読み込めませんでした。");
    const params = new URLSearchParams({
      test: "1",
      roomCode: room.code,
      source: room.topicDictionarySource,
      distance: room.topicPairDistance,
    });
    if (forceNew) params.set("forceNew", "1");
    if (room.topicHint.trim()) params.set("hint", room.topicHint.trim().slice(0, 80));
    const response = await fetch(`/api/wordwolf/topic?${params.toString()}`, { cache: "no-store" });
    const topic = (await response.json()) as WordWolfTopic & { error?: string };
    if (!response.ok || !isValidWordWolfTopic(topic)) {
      throw new Error(topic.notice || topic.error || "ワードを生成できませんでした。");
    }
    return {
      fields: [
        { label: "市民ワード", value: topic.villageWord },
        { label: "ウルフワード", value: topic.wolfWord },
        { label: "組み合わせの意図", value: topic.reason },
      ],
      notice: topic.notice,
      generation: topic.generation,
    };
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

      const result = await startWordWolfGame(room.code, crypto.randomUUID());
      setRoom(result.room);
      setError("");
    } catch {
      setError("ゲームを開始できませんでした。もう一度試してください。");
    } finally {
      setIsStarting(false);
    }
  };

  // eslint-disable-next-line react-hooks/preserve-manual-memoization
  const submitClue = useCallback(async () => {
    if (!room || room.phase !== "clue") return;
    // 0秒表示後の手動投稿と自動時間切れ処理が同時に部屋を更新するのを防ぐ。
    if (turnSecondsLeft === 0 && room.turnTimeLimitSeconds > 0) return;
    const text = clueInput.trim();
    if (!clueActorId || !text) return;
    try {
      const result = await submitWordWolfClue(room.code, clueActorId, text, crypto.randomUUID());
      setClueInput("");
      saveRoom(result.room);
      setRoom(result.room);
    } catch {
      const latest = await loadRoomFromStore(room.code);
      if (latest) setRoom(latest);
      setError("発言を反映できませんでした。最新の状態を読み込みました。");
    }
  }, [clueActorId, clueInput, room, turnSecondsLeft]); // eslint-disable-line react-hooks/preserve-manual-memoization
  const expireCurrentPhase = useCallback(async (commandId: string) => {
    if (!room) return;
    const attempt = async (): Promise<void> => {
      try {
        const result = await expireWordWolfPhase(room.code, commandId);
        if (result.room) {
          saveRoom(result.room);
          setRoom(result.room);
        }
        if (!result.applied && result.retryAfterMs && result.retryAfterMs > 0) {
          window.setTimeout(() => void attempt(), result.retryAfterMs + 50);
        }
      } catch {
        const latest = await loadRoomFromStore(room.code);
        if (latest) setRoom(latest);
      }
    };
    await attempt();
  }, [room]);
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

    const actionKey = createGameTimerEventId({ game: "wordwolf", roomCode: room.code, phase: room.phase, revision: room.revision, startedAt: room.currentTurnStartedAt });
    if (timeoutActionKeyRef.current === actionKey) return;
    timeoutActionKeyRef.current = actionKey;
    const timer = window.setTimeout(() => void expireCurrentPhase(actionKey), 0);
    return () => window.clearTimeout(timer);
  }, [clueActorId, currentPlayerId, expireCurrentPhase, room, turnSecondsLeft]);

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

  const castVote = useCallback(async (targetId: string) => {
    if (!room || room.phase !== "vote") return;
    if (turnSecondsLeft === 0 && room.turnTimeLimitSeconds > 0) return;
    const actorId = voteActor?.id ?? "";
    if (!actorId || !targetId) return;
    try {
      const result = await castWordWolfVote(room.code, actorId, targetId, crypto.randomUUID());
      saveRoom(result.room);
      setRoom(result.room);
    } catch {
      const latest = await loadRoomFromStore(room.code);
      if (latest) setRoom(latest);
      setError("投票を反映できませんでした。最新の状態を読み込みました。");
    }
  }, [room, turnSecondsLeft, voteActor?.id]);

  // eslint-disable-next-line react-hooks/preserve-manual-memoization
  const submitWolfGuess = useCallback(async (isTimeout = false) => {
    if (!room || !guessActorId || !room.accusedId || guessActorId !== room.accusedId || !normalizeWolfIds(room).includes(guessActorId) || isGuessJudging) return;
    if (!isTimeout && turnSecondsLeft === 0 && room.turnTimeLimitSeconds > 0) return;

    const guess = isTimeout ? "\u6642\u9593\u5207\u308c" : guessInput.trim();
    if (!guess) return;

    setIsGuessJudging(true);
    setGuessFeedbackMessage("");

    try {
      const result = await submitWordWolfGuessCommand(room.code, guess, crypto.randomUUID());
      setRoom(result.room);
    } catch {
      setError("逆転回答を判定できませんでした。もう一度試してください。");
    } finally {
      setIsGuessJudging(false);
    }
  }, [guessActorId, guessInput, isGuessJudging, room, turnSecondsLeft]); // eslint-disable-line react-hooks/preserve-manual-memoization

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

    const actionKey = createGameTimerEventId({ game: "wordwolf", roomCode: room.code, phase: room.phase, revision: room.revision, startedAt: room.currentTurnStartedAt });
    if (timeoutActionKeyRef.current === actionKey) return;
    timeoutActionKeyRef.current = actionKey;
    const timer = window.setTimeout(() => {
      void expireCurrentPhase(actionKey);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [expireCurrentPhase, room, turnSecondsLeft]);

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

    const actionKey = createGameTimerEventId({ game: "wordwolf", roomCode: room.code, phase: room.phase, revision: room.revision, startedAt: room.currentTurnStartedAt });
    if (timeoutActionKeyRef.current === actionKey) return;
    timeoutActionKeyRef.current = actionKey;
    const timer = window.setTimeout(() => void expireCurrentPhase(actionKey), 0);
    return () => window.clearTimeout(timer);
  }, [expireCurrentPhase, guessActorId, room, turnSecondsLeft]);
  const submitGuessFeedback = async (accepted: boolean) => {
    if (!room || !room.wolfGuess || !room.villageWord) return;

    setGuessFeedbackMessage("");
    try {
      const response = await fetch("/api/wordwolf/guess-feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomCode: room.code, guess: room.wolfGuess, accepted }),
      });
      if (!response.ok) throw new Error("GUESS_FEEDBACK_FAILED");
      setGuessFeedbackMessage(
        accepted ? "\u6b63\u89e3\u6271\u3044\u3068\u3057\u3066\u8a18\u61b6\u3057\u307e\u3057\u305f\u3002" : "\u4e0d\u6b63\u89e3\u6271\u3044\u3068\u3057\u3066\u8a18\u61b6\u3057\u307e\u3057\u305f\u3002",
      );
    } catch {
      setGuessFeedbackMessage("\u4fdd\u5b58\u306b\u5931\u6557\u3057\u307e\u3057\u305f\u3002\u3042\u3068\u3067\u3082\u3046\u4e00\u5ea6\u8a66\u3057\u3066\u304f\u3060\u3055\u3044\u3002");
    }
  };

  const resetRoom = () => {
    if (!room) return;
    void runRoomAction({ type: "reset-game" });
    setGuessInput("");
    setClueInput("");
  };

  const abortGame = () => {
    if (!room || room.phase === "lobby") return;
    void runRoomAction({ type: "abort-game" });
    setGuessInput("");
    setClueInput("");
  };

  return (
    <main className={`min-h-screen bg-slate-950 text-slate-950 ${gameTopBannerOffsetClass}`}>
      <GameTopBanner eyebrow="Room based social deduction" title="ワードウルフ・ラウンジ">
        {(!room || room.phase === "lobby") && (room && isHost
          ? <button type="button" onClick={() => void dissolveRoom()} className={gameTopBannerDangerActionClass}>部屋を解散</button>
          : <Link href="/games" className={gameTopBannerActionClass}>ゲームロビーへ戻る</Link>)}
        <GameTopMenu>
            {room && room.phase !== "lobby" && <Link href="/games" data-menu-close="true" className={gameTopMenuItemClass}>ゲームロビーへ戻る</Link>}
            <button
              type="button"
              data-menu-close="true"
              onClick={() => setIsRulesOpen(true)}
              className={gameTopMenuItemClass}
            >
              ルール
            </button>
            <PaidLlmAccessButton variant="menu" />
            {room && isHost && (
              <DebugModeButton
                variant="menu"
                enabled={Boolean(room.debugMode)}
                disabled={room.phase !== "lobby"}
                onAbort={room.debugMode && room.phase !== "lobby" ? abortGame : undefined}
                replayEnabled={Boolean(room.debugReplayEnabled)}
                onReplayChange={(enabled) => void runRoomAction({ type: "set-debug-replay", enabled })}
                onChange={(enabled) => {
                  void runRoomAction({ type: "set-debug", enabled });
                  setError("");
                }}
              />
            )}
        </GameTopMenu>
            <div className="relative hidden min-w-0 items-center gap-2 rounded-lg border border-white/15 bg-white/10 px-3 py-1.5">
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
                  <button type="button" onClick={() => setIsMyPageOpen(true)} className="mt-3 flex w-full items-center justify-center rounded-md bg-cyan-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-cyan-500">
                    マイページを開く
                  </button>
                </div>
              )}
            </div>
            <GamePlayerMenu id={playerAccountId || undefined} name={headerName} avatarColor={headerAvatarColor} avatarImage={headerAvatarImage} />
      </GameTopBanner>

      <FullScreenPageOverlay open={isMyPageOpen} href="/users/me" title="マイページ" onClose={() => setIsMyPageOpen(false)} />

      <GameRulesDialog open={isRulesOpen} title="ワードウルフのルール" onClose={() => setIsRulesOpen(false)}>
        <p>ほとんどの人には同じお題が配られ、少数の「狼」だけには少し違うお題が配られます。会話から違うお題を持つ人を見つける、正体隠匿ゲームです。</p>
        <p className="mt-2">自分が市民か狼かは表示されません。自分だけ違うお題かもしれない、と考えながら遊びます。</p>
        <h3 className="mt-4 font-black text-white">ゲームの流れ</h3>
        <ol className="mt-2 list-decimal space-y-2 pl-5">
          <li>自分だけに表示されるお題を確認します。</li>
          <li>順番に、お題について短く話します。お題そのものを言うのは禁止です。自分のお題が周りと同じか、会話を聞いて見極めます。</li>
          <li>設定された回数の会話が終わったら、狼だと思う人へ1票を入れます。</li>
          <li>最も多く票を集めた人が選ばれます。同数なら、その人たちが追加で話してから決選投票をします。</li>
        </ol>
        <h3 className="mt-4 font-black text-white">勝ち方</h3>
        <ul className="mt-2 list-disc space-y-2 pl-5">
          <li>市民が投票で狼を選べなかった場合は、狼の勝ちです。</li>
          <li>市民が狼を選んだ場合、狼には最後の逆転チャンスがあります。市民のお題を完全に当てれば狼の逆転勝ち、外せば市民の勝ちです。</li>
        </ul>
        <details className="mt-4 rounded-xl border border-white/10 bg-white/[0.04] p-3">
          <summary className="cursor-pointer font-bold text-slate-200">「狼なしの可能性あり」の部屋</summary>
          <p className="mt-3 text-slate-300">10%の確率で狼がおらず、全員に同じお題が配られます。この場合は投票で選ばれた人だけが負けです。全員が同じ票数なら、もう1周話してから再投票します。</p>
        </details>
        <p className="mt-4 text-amber-200">制限時間が来ると、その時点で提出されている発言や投票を使って自動で進みます。発言内容が全員に公開される時期は、部屋の設定で変わります。</p>
      </GameRulesDialog>

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
                      onChange={(event) => void runRoomAction({ type: "update-config", config: { roundsTotal: normalizeRoundsTotal(Number(event.target.value)) } }, true)}
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
                    <>
                      <DebugWordGenerationTest onGenerate={testWordGeneration} />
                      <button
                        onClick={addSeat}
                        className={`w-full ${subtleButtonClass}`}
                      >
                        テスト用プレイヤー追加
                      </button>
                    </>
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

              <WordWolfActionPanels
                room={room}
                currentPlayer={currentPlayer}
                runoffCandidateNames={runoffCandidateNames}
                clueSubmittedCount={clueSubmittedCount}
                clueParticipantCount={clueParticipants.length}
                turnSecondsLeft={turnSecondsLeft}
                clueInput={clueInput}
                setClueInput={setClueInput}
                onClueKeyDown={submitClueOnEnter}
                onSubmitClue={() => void submitClue()}
                canSubmitClue={canSubmitClue}
                isMyClueTurn={isMyClueTurn}
                isMyVoteTurn={isMyVoteTurn}
                isRunoffVote={isRunoffVote}
                votedCount={votedCount}
                voteVoterCount={voteVoters.length}
                voteDisplayPlayer={voteDisplayPlayer}
                voteActor={voteActor}
                isDebugMode={isDebugMode}
                voteCandidates={voteCandidates}
                selectedVoteTargetId={selectedVoteTargetId}
                onCastVote={(playerId) => void castVote(playerId)}
                isMyFinalAnswerTurn={isMyFinalAnswerTurn}
                accusedPlayer={accusedPlayer}
                guessInput={guessInput}
                setGuessInput={setGuessInput}
                onGuessKeyDown={submitGuessOnEnter}
                onSubmitGuess={() => void submitWolfGuess()}
                isGuessJudging={isGuessJudging}
              />
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
                      <RoomResultActions onPlayAgain={resetRoom} onDissolve={() => void dissolveRoom()} />
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

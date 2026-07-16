import { loadPlayerRoomDefaults, savePlayerRoomDefaults } from "@/lib/game-room-defaults-client";
import { normalizeCommonTimeLimit } from "@/lib/game-room-config";
import { makeRandomAvatarColor } from "@/lib/player-session";
import {
  normalizeTopicDictionarySource,
  normalizeTopicPairDistance,
} from "@/lib/wordwolf";
import type {
  ClueMode,
  GameMode,
  Player,
  Room,
  RoomChoice,
  VoteRound,
} from "@/lib/wordwolf-game-types";
import {
  fetchActiveWordWolfRoom,
  fetchJoinableWordWolfRooms,
  fetchWordWolfRoom,
  removeHostedWordWolfRooms,
  removeWordWolfRoom,
} from "./wordwolf-room-api-client";

export function normalizeGameMode(value: unknown): GameMode {
  return value === "may-no-wolf" || value === "no-wolf" ? "may-no-wolf" : "wordwolf";
}

export function normalizeClueMode(value: unknown): ClueMode {
  return value === "simultaneous" ? "simultaneous" : "turn";
}

export function normalizeRoomScores(value: unknown) {
  if (!value || typeof value !== "object") return {};

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([playerId, score]) => playerId && typeof score === "number" && Number.isFinite(score))
      .map(([playerId, score]) => [playerId, Math.max(0, Math.floor(score as number))]),
  );
}

export function normalizeVoteHistory(value: unknown): VoteRound[] {
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

export function normalizeRunoffCandidateIds(value: unknown) {
  return Array.isArray(value) ? value.filter((candidateId): candidateId is string => typeof candidateId === "string") : null;
}

export function normalizeWolfIds(room: Partial<Room>) {
  const wolfIds = Array.isArray(room.wolfIds)
    ? room.wolfIds.filter((wolfId): wolfId is string => typeof wolfId === "string")
    : [];
  if (wolfIds.length > 0) return [...new Set(wolfIds)];
  return typeof room.wolfId === "string" ? [room.wolfId] : [];
}

export function maxWolfCount(playerCount: number) {
  return Math.max(1, Math.floor((Math.max(3, playerCount) - 1) / 2));
}

export function normalizeWolfCount(value: unknown, playerCount: number) {
  const count = typeof value === "number" && Number.isFinite(value) ? Math.floor(value) : 1;
  return Math.max(1, Math.min(maxWolfCount(playerCount), count));
}

export function normalizeStoredWolfCount(value: unknown) {
  const count = typeof value === "number" && Number.isFinite(value) ? Math.floor(value) : 1;
  return Math.max(1, Math.min(20, count));
}

export const lobbyRounds = [1, 2, 3, 4];

export function normalizeRoundsTotal(value: unknown) {
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

export function makeId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

export function getOwnerId() {
  const savedOwnerId = localStorage.getItem("wordwolf-owner-id");
  if (savedOwnerId) return savedOwnerId;

  const ownerId = makeId("owner");
  localStorage.setItem("wordwolf-owner-id", ownerId);
  return ownerId;
}

export function makeRoomCode() {
  return Math.random().toString(36).slice(2, 6).toUpperCase();
}

export function getRoomKey(code: string) {
  return `${roomStoragePrefix}${code.toUpperCase()}`;
}

export function getRoomDefaultsKey(playerId: string, ownerId: string) {
  return `${roomDefaultsStoragePrefix}${playerId || ownerId || "local"}`;
}

export function getDefaultRoomSettings(): WordWolfRoomDefaults {
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

export function normalizeRoomDefaults(value: unknown): WordWolfRoomDefaults {
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

export function loadRoomDefaults(playerId: string, ownerId: string) {
  const raw = localStorage.getItem(getRoomDefaultsKey(playerId, ownerId));
  if (!raw) return getDefaultRoomSettings();

  try {
    return normalizeRoomDefaults(JSON.parse(raw));
  } catch {
    return getDefaultRoomSettings();
  }
}

export async function loadRoomDefaultsFromStore(playerId: string, ownerId: string) {
  return loadPlayerRoomDefaults({
    game: "wordwolf",
    playerId,
    localStorageKey: getRoomDefaultsKey(playerId, ownerId),
    normalize: normalizeRoomDefaults,
  });
}

export async function saveRoomDefaultsToStore(room: Room) {
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

export function saveRoom(room: Room) {
  localStorage.setItem(getRoomKey(room.code), JSON.stringify(room));
}

export function deleteRoom(code: string) {
  localStorage.removeItem(getRoomKey(code));
}

export function loadRoom(code: string): Room | null {
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

export function listRooms(): Room[] {
  const rooms: Room[] = [];

  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (!key?.startsWith(roomStoragePrefix)) continue;

    const room = loadRoom(key.slice(roomStoragePrefix.length));
    if (room) rooms.push(room);
  }

  return rooms;
}

export function listJoinableRooms(): RoomChoice[] {
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

export function deleteHostedRooms(ownerId: string, fallbackHostId: string) {
  listRooms()
    .filter((room) => room.ownerId === ownerId || (!room.ownerId && room.hostId === fallbackHostId))
    .forEach((room) => deleteRoom(room.code));
}

export async function loadRoomFromStore(code: string) {
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

export async function loadActiveRoomFromStore(playerId: string) {
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

export async function listJoinableRoomsFromStore() {
  try {
    return await fetchJoinableWordWolfRooms();
  } catch {
    return listJoinableRooms();
  }
}

export async function deleteRoomFromStore(code: string) {
  deleteRoom(code);

  try {
    await removeWordWolfRoom(code);
  } catch {
    // Already removed locally; remote cleanup can be retried by host actions later.
  }
}

export async function deleteHostedRoomsFromStore(ownerId: string, fallbackHostId: string) {
  try {
    await removeHostedWordWolfRooms(ownerId, fallbackHostId);
    deleteHostedRooms(ownerId, fallbackHostId);
    return true;
  } catch {
    return false;
  }
}

export function createEmptyRoom(
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
    playerTimeouts: { [player.id]: { consecutiveTimeouts: 0, reducedTime: false } },
    playerTimeoutNotice: null,
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

export function createPlayer(
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

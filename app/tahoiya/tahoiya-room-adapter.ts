import { makeRandomAvatarColor } from "@/lib/player-session";
import { loadPlayerRoomDefaults, savePlayerRoomDefaults } from "@/lib/game-room-defaults-client";
import { normalizeCommonTimeLimit } from "@/lib/game-room-config";
import { OnlineRoomApiError } from "@/lib/online-room-api-client";
import type { TahoiyaPlayer, TahoiyaRoom, TahoiyaRoomAction } from "@/lib/tahoiya-types";
import { TAHOIYA_CORRECT_VOTE_POINTS, TAHOIYA_FOOLED_VOTE_POINTS } from "@/lib/tahoiya-scoring";
import { applyTahoiyaRoomAction, createTahoiyaRoom, tahoiyaRoomApi } from "./tahoiya-room-api-client";

const roomStoragePrefix = "tahoiya-room-";
const roomDefaultsStoragePrefix = "tahoiya-room-defaults-";

type TahoiyaRoomDefaults = Pick<TahoiyaRoom, "playMode" | "topicDifficulty" | "answererMode" | "showRealDefinitionToWriters" | "actionTimeLimitSeconds">;

export function makeId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

export function makeRoomCode() {
  return Math.random().toString(36).slice(2, 6).toUpperCase();
}

export function getOwnerId() {
  const saved = localStorage.getItem("tahoiya-owner-id");
  if (saved) return saved;

  const ownerId = makeId("owner");
  localStorage.setItem("tahoiya-owner-id", ownerId);
  return ownerId;
}

export function getRoomKey(code: string) {
  return `${roomStoragePrefix}${code.toUpperCase()}`;
}

export function getRoomDefaultsKey(playerId: string, ownerId: string) {
  return `${roomDefaultsStoragePrefix}${playerId || ownerId || "local"}`;
}

export function normalizeRoomDefaults(value: unknown): TahoiyaRoomDefaults {
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

export function loadRoomDefaults(playerId: string, ownerId: string) {
  const raw = localStorage.getItem(getRoomDefaultsKey(playerId, ownerId));
  if (!raw) return normalizeRoomDefaults(null);

  try {
    return normalizeRoomDefaults(JSON.parse(raw));
  } catch {
    return normalizeRoomDefaults(null);
  }
}

export async function loadRoomDefaultsFromStore(playerId: string, ownerId: string) {
  return loadPlayerRoomDefaults({
    game: "tahoiya",
    playerId,
    localStorageKey: getRoomDefaultsKey(playerId, ownerId),
    normalize: normalizeRoomDefaults,
  });
}

export async function saveRoomDefaultsToStore(room: TahoiyaRoom) {
  const defaults = normalizeRoomDefaults(room);
  await savePlayerRoomDefaults({
    game: "tahoiya",
    playerId: room.hostId,
    localStorageKey: getRoomDefaultsKey(room.hostId, room.ownerId ?? ""),
    defaults,
  });
}

export function stampRoom(room: TahoiyaRoom) {
  return { ...room, updatedAt: Date.now() };
}

export function createPlayer(name: string, avatarColor = makeRandomAvatarColor(), avatarImage?: string | null, id?: string): TahoiyaPlayer {
  return {
    id: id ?? makeId("player"),
    name,
    avatarColor,
    avatarImage: avatarImage || undefined,
    joinedAt: Date.now(),
  };
}

export function normalizeRoom(room: TahoiyaRoom): TahoiyaRoom {
  const playMode = room.playMode === "all-vote" ? "all-vote" : "single-answerer";
  return {
    ...room,
    revision: typeof room.revision === "number" ? room.revision : 0,
    passphrase: room.passphrase ?? "",
    debugMode: Boolean(room.debugMode),
    debugReplayEnabled: Boolean(room.debugMode && room.debugReplayEnabled),
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

export function saveRoomLocally(room: TahoiyaRoom) {
  localStorage.setItem(getRoomKey(room.code), JSON.stringify(stampRoom(room)));
}

export function loadRoomLocally(code: string): TahoiyaRoom | null {
  const raw = localStorage.getItem(getRoomKey(code));
  if (!raw) return null;

  try {
    return normalizeRoom(JSON.parse(raw) as TahoiyaRoom);
  } catch {
    return null;
  }
}

export function listRoomsLocally() {
  const rooms: TahoiyaRoom[] = [];
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (!key?.startsWith(roomStoragePrefix)) continue;
    const room = loadRoomLocally(key.slice(roomStoragePrefix.length));
    if (room) rooms.push(room);
  }
  return rooms;
}

export function deleteRoomLocally(code: string) {
  localStorage.removeItem(getRoomKey(code));
}

export async function createRoomInStore(room: TahoiyaRoom, actorId: string) {
  try {
    const data = await createTahoiyaRoom(room, actorId);
    if (!data.room) return null;
    const saved = normalizeRoom(data.room);
    saveRoomLocally(saved);
    return saved;
  } catch {
    return null;
  }
}

export async function applyRoomActionToStore(code: string, action: TahoiyaRoomAction) {
  try {
    const saved = normalizeRoom(await applyTahoiyaRoomAction(code, action));
    saveRoomLocally(saved);
    return saved;
  } catch {
    return null;
  }
}

export async function applyTahoiyaSpecialAction(code: string, action: { type: "join-room"; passphrase: string } | { type: "start-round" }) {
  try {
    const saved = normalizeRoom(await applyTahoiyaRoomAction(code, action));
    saveRoomLocally(saved);
    return saved;
  } catch (error) {
    if (error instanceof OnlineRoomApiError && error.payload && typeof error.payload === "object") {
      throw new Error((error.payload as { error?: string }).error || "ROOM_ACTION_FAILED");
    }
    throw error instanceof Error ? error : new Error("ROOM_ACTION_FAILED");
  }
}

export async function loadRoomFromStore(code: string) {
  try {
    const room = await tahoiyaRoomApi.fetchRoom(code);
    if (!room) return null;
    const normalized = normalizeRoom(room);
    saveRoomLocally(normalized);
    return normalized;
  } catch {
    return null;
  }
}

export async function loadActiveRoomFromStore(playerId: string) {
  try {
    const room = await tahoiyaRoomApi.fetchActiveRoom(playerId);
    if (!room) return null;
    const normalized = normalizeRoom(room);
    saveRoomLocally(normalized);
    return normalized;
  } catch {
    return null;
  }
}

export async function listJoinableRoomsFromStore() {
  try {
    return await tahoiyaRoomApi.fetchJoinableRooms();
  } catch {
    return [];
  }
}

export async function deleteRoomFromStore(code: string, actorId: string) {
  deleteRoomLocally(code);
  try {
    await tahoiyaRoomApi.remove({ code, actorId });
  } catch {
    // Local delete already happened.
  }
}

export async function deleteHostedRoomsFromStore(ownerId: string, fallbackHostId: string) {
  try {
    await tahoiyaRoomApi.remove({ ownerId, fallbackHostId });
    for (const localRoom of listRoomsLocally()) {
      if (localRoom.ownerId === ownerId || (!localRoom.ownerId && localRoom.hostId === fallbackHostId)) {
        deleteRoomLocally(localRoom.code);
      }
    }
    return true;
  } catch {
    return false;
  }
}

export function createEmptyRoom(
  host: TahoiyaPlayer,
  passphrase: string,
  ownerId: string,
  savedDefaults?: TahoiyaRoomDefaults,
): TahoiyaRoom {
  const defaults = savedDefaults ?? loadRoomDefaults(host.id, ownerId);
  return {
    playerTimeouts: { [host.id]: { consecutiveTimeouts: 0, reducedTime: false } },
    playerTimeoutNotice: null,
    code: makeRoomCode(),
    revision: 0,
    hostId: host.id,
    ownerId,
    passphrase,
    phase: "lobby",
    debugMode: false,
    debugReplayEnabled: false,
    lobbyReturn: undefined,
    players: [host],
    parentId: host.id,
    playMode: defaults.playMode,
    topicDifficulty: defaults.topicDifficulty,
    answererMode: defaults.answererMode,
    showRealDefinitionToWriters: defaults.showRealDefinitionToWriters,
    actionTimeLimitSeconds: defaults.actionTimeLimitSeconds,
    correctVotePoints: TAHOIYA_CORRECT_VOTE_POINTS,
    fooledVotePoints: TAHOIYA_FOOLED_VOTE_POINTS,
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


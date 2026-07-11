import { redisCommand } from "@/lib/redis-store";
import type { TahoiyaDefinitionOption, TahoiyaPhase, TahoiyaPlayer, TahoiyaRoom, TahoiyaRoomChoice } from "@/lib/tahoiya-types";

const roomKeyPrefix = "tahoiya:room:";
const roomIndexKey = "tahoiya:rooms";
const playerActiveRoomKeyPrefix = "tahoiya:player-active-room:";

function roomKey(code: string) {
  return `${roomKeyPrefix}${code.trim().toUpperCase()}`;
}

function playerActiveRoomKey(playerId: string) {
  return `${playerActiveRoomKeyPrefix}${playerId}`;
}

function isPhase(value: unknown): value is TahoiyaPhase {
  return value === "lobby" || value === "writing" || value === "voting" || value === "result";
}

function normalizeScores(value: unknown) {
  if (!value || typeof value !== "object") return {};

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([playerId, score]) => playerId && typeof score === "number" && Number.isFinite(score))
      .map(([playerId, score]) => [playerId, Math.max(0, Math.floor(score as number))]),
  );
}

function normalizePlayers(value: unknown): TahoiyaPlayer[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter((player): player is TahoiyaPlayer => Boolean(player?.id && player?.name))
    .map((player) => ({
      id: String(player.id),
      name: String(player.name),
      joinedAt: typeof player.joinedAt === "number" ? player.joinedAt : Date.now(),
      avatarColor: typeof player.avatarColor === "string" ? player.avatarColor : undefined,
      avatarImage: typeof player.avatarImage === "string" ? player.avatarImage : undefined,
    }));
}

function normalizeOptions(value: unknown): TahoiyaDefinitionOption[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter((option): option is TahoiyaDefinitionOption => Boolean(option?.id && option?.text))
    .map((option) => ({
      id: String(option.id),
      text: String(option.text),
      authorId: typeof option.authorId === "string" ? option.authorId : null,
      isReal: Boolean(option.isReal),
    }));
}

function normalizeStringRecord(value: unknown) {
  if (!value || typeof value !== "object") return {};

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key, item]) => key && typeof item === "string")
      .map(([key, item]) => [key, item as string]),
  );
}

function normalizeRoom(value: unknown): TahoiyaRoom | null {
  if (!value || typeof value !== "object") return null;

  const parsed = value as Partial<TahoiyaRoom>;
  const code = typeof parsed.code === "string" ? parsed.code.trim().toUpperCase() : "";
  const hostId = typeof parsed.hostId === "string" ? parsed.hostId : "";
  const players = normalizePlayers(parsed.players);
  const parentId = typeof parsed.parentId === "string" ? parsed.parentId : hostId;

  if (!code || !hostId || players.length === 0) return null;

  return {
    code,
    hostId,
    ownerId: typeof parsed.ownerId === "string" ? parsed.ownerId : undefined,
    passphrase: typeof parsed.passphrase === "string" ? parsed.passphrase : "",
    phase: isPhase(parsed.phase) ? parsed.phase : "lobby",
    debugMode: Boolean(parsed.debugMode),
    players,
    parentId,
    round: typeof parsed.round === "number" ? Math.max(1, Math.floor(parsed.round)) : 1,
    word: typeof parsed.word === "string" ? parsed.word : "",
    reading: typeof parsed.reading === "string" ? parsed.reading : undefined,
    realDefinition: typeof parsed.realDefinition === "string" ? parsed.realDefinition : "",
    topicNote: typeof parsed.topicNote === "string" ? parsed.topicNote : "",
    topicSource: parsed.topicSource === "llm" || parsed.topicSource === "fallback" ? parsed.topicSource : "pending",
    fakeDefinitions: normalizeStringRecord(parsed.fakeDefinitions),
    options: normalizeOptions(parsed.options),
    votes: normalizeStringRecord(parsed.votes),
    scores: normalizeScores(parsed.scores),
    resultText: typeof parsed.resultText === "string" ? parsed.resultText : "",
    createdAt: typeof parsed.createdAt === "number" ? parsed.createdAt : Date.now(),
    updatedAt: typeof parsed.updatedAt === "number" ? parsed.updatedAt : Date.now(),
  };
}

function makeChoice(room: TahoiyaRoom): TahoiyaRoomChoice {
  return {
    code: room.code,
    hostName: room.players.find((player) => player.id === room.hostId)?.name ?? "Unknown",
    playerCount: room.players.length,
    phase: room.phase,
    hasPassphrase: Boolean(room.passphrase),
    updatedAt: room.updatedAt,
  };
}

async function savePlayerActiveRooms(room: TahoiyaRoom) {
  await Promise.all(room.players.map((player) => redisCommand<"OK">(["SET", playerActiveRoomKey(player.id), room.code])));
}

async function deletePlayerActiveRoom(playerId: string, roomCode: string) {
  const savedCode = await redisCommand<string | null>(["GET", playerActiveRoomKey(playerId)]);
  if (savedCode?.trim().toUpperCase() === roomCode.trim().toUpperCase()) {
    await redisCommand<number>(["DEL", playerActiveRoomKey(playerId)]);
  }
}

export async function loadStoredTahoiyaRoom(code: string) {
  const raw = await redisCommand<string | null>(["GET", roomKey(code)]);
  if (!raw) return null;

  try {
    return normalizeRoom(JSON.parse(raw));
  } catch {
    return null;
  }
}

export async function loadStoredTahoiyaPlayerActiveRoom(playerId: string) {
  const normalizedPlayerId = playerId.trim();
  if (!normalizedPlayerId) return null;

  const code = await redisCommand<string | null>(["GET", playerActiveRoomKey(normalizedPlayerId)]);
  if (!code) return null;

  const room = await loadStoredTahoiyaRoom(code);
  if (!room || !room.players.some((player) => player.id === normalizedPlayerId)) {
    await redisCommand<number>(["DEL", playerActiveRoomKey(normalizedPlayerId)]);
    return null;
  }

  return room;
}

export async function saveStoredTahoiyaRoom(room: unknown) {
  const normalizedRoom = normalizeRoom(room);
  if (!normalizedRoom) {
    throw new Error("INVALID_TAHOIYA_ROOM");
  }

  await redisCommand<"OK">(["SET", roomKey(normalizedRoom.code), JSON.stringify(normalizedRoom)]);
  await redisCommand<number>(["SADD", roomIndexKey, normalizedRoom.code]);
  await savePlayerActiveRooms(normalizedRoom);

  return normalizedRoom;
}

export async function deleteStoredTahoiyaRoom(code: string) {
  const normalizedCode = code.trim().toUpperCase();
  const room = await loadStoredTahoiyaRoom(normalizedCode);
  await redisCommand<number>(["DEL", roomKey(normalizedCode)]);
  await redisCommand<number>(["SREM", roomIndexKey, normalizedCode]);

  if (room) {
    await Promise.all(room.players.map((player) => deletePlayerActiveRoom(player.id, normalizedCode)));
  }
}

export async function listStoredTahoiyaRooms() {
  const codes = await redisCommand<string[]>(["SMEMBERS", roomIndexKey]);
  const rooms = await Promise.all(codes.map((code) => loadStoredTahoiyaRoom(code)));
  return rooms.filter((room): room is TahoiyaRoom => Boolean(room));
}

export async function listStoredJoinableTahoiyaRooms() {
  const rooms = await listStoredTahoiyaRooms();
  return rooms
    .filter((room) => room.phase === "lobby" && room.players.length < 8)
    .map(makeChoice)
    .sort((left, right) => right.updatedAt - left.updatedAt);
}

export async function deleteStoredHostedTahoiyaRooms(ownerId: string, fallbackHostId: string) {
  const rooms = await listStoredTahoiyaRooms();
  const deletions = rooms
    .filter((room) => room.ownerId === ownerId || (!room.ownerId && room.hostId === fallbackHostId))
    .map((room) => deleteStoredTahoiyaRoom(room.code));

  await Promise.all(deletions);
  return deletions.length;
}

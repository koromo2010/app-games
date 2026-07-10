import {
  normalizeTopicDictionarySource,
  normalizeTopicPairDistance,
  type TopicDictionarySource,
  type TopicPairDistance,
  type TopicSourceMode,
  type WordWolfTopic,
} from "@/lib/wordwolf";
import { redisCommand } from "@/lib/redis-store";

type Phase = "lobby" | "clue" | "vote" | "wolfGuess" | "result";
type ClueLogVisibility = "always" | "result";
type GameMode = "wordwolf" | "may-no-wolf";

type Player = {
  id: string;
  name: string;
  joinedAt: number;
  avatarColor?: string;
  avatarImage?: string;
};

type Clue = {
  playerId: string;
  round: number;
  text: string;
  at: number;
};

export type WordWolfRoom = {
  code: string;
  hostId: string;
  ownerId?: string;
  passphrase: string;
  phase: Phase;
  gameMode: GameMode;
  debugMode?: boolean;
  clueLogVisibility: ClueLogVisibility;
  players: Player[];
  roundsTotal: number;
  turnTimeLimitSeconds: number;
  currentRound: number;
  currentTurnIndex: number;
  currentTurnStartedAt: number | null;
  wolfId: string | null;
  villageWord: string;
  wolfWord: string;
  topicReason: string;
  topicSource: WordWolfTopic["source"] | "pending";
  topicDictionarySource: TopicDictionarySource;
  topicPairDistance: TopicPairDistance;
  topicSourceMode?: TopicSourceMode;
  clues: Clue[];
  votes: Record<string, string>;
  accusedId: string | null;
  wolfGuess: string;
  winner: "village" | "wolf" | "players" | null;
  resultText: string;
  createdAt: number;
  updatedAt: number;
};

export type WordWolfRoomChoice = {
  code: string;
  hostName: string;
  playerCount: number;
  roundsTotal: number;
  hasPassphrase: boolean;
  updatedAt: number;
};

const roomKeyPrefix = "wordwolf:room:";
const roomIndexKey = "wordwolf:rooms";

function roomKey(code: string) {
  return `${roomKeyPrefix}${code.trim().toUpperCase()}`;
}

function normalizeGameMode(value: unknown): GameMode {
  return value === "may-no-wolf" || value === "no-wolf" ? "may-no-wolf" : "wordwolf";
}

function isPhase(value: unknown): value is Phase {
  return value === "lobby" || value === "clue" || value === "vote" || value === "wolfGuess" || value === "result";
}

function normalizeRoom(value: unknown): WordWolfRoom | null {
  if (!value || typeof value !== "object") return null;

  const parsed = value as Partial<WordWolfRoom>;
  const code = typeof parsed.code === "string" ? parsed.code.trim().toUpperCase() : "";
  const hostId = typeof parsed.hostId === "string" ? parsed.hostId : "";
  const players = Array.isArray(parsed.players) ? parsed.players.filter((player) => player?.id && player?.name) : [];

  if (!code || !hostId || players.length === 0) return null;

  return {
    code,
    hostId,
    ownerId: typeof parsed.ownerId === "string" ? parsed.ownerId : undefined,
    passphrase: typeof parsed.passphrase === "string" ? parsed.passphrase : "",
    phase: isPhase(parsed.phase) ? parsed.phase : "lobby",
    gameMode: normalizeGameMode(parsed.gameMode),
    debugMode: Boolean(parsed.debugMode),
    clueLogVisibility: parsed.clueLogVisibility === "always" ? "always" : "result",
    players: players as Player[],
    roundsTotal: typeof parsed.roundsTotal === "number" ? parsed.roundsTotal : 3,
    turnTimeLimitSeconds: typeof parsed.turnTimeLimitSeconds === "number" ? parsed.turnTimeLimitSeconds : 0,
    currentRound: typeof parsed.currentRound === "number" ? parsed.currentRound : 1,
    currentTurnIndex: typeof parsed.currentTurnIndex === "number" ? parsed.currentTurnIndex : 0,
    currentTurnStartedAt: typeof parsed.currentTurnStartedAt === "number" ? parsed.currentTurnStartedAt : null,
    wolfId: typeof parsed.wolfId === "string" ? parsed.wolfId : null,
    villageWord: typeof parsed.villageWord === "string" ? parsed.villageWord : "",
    wolfWord: typeof parsed.wolfWord === "string" ? parsed.wolfWord : "",
    topicReason: typeof parsed.topicReason === "string" ? parsed.topicReason : "",
    topicSource: parsed.topicSource === "llm" || parsed.topicSource === "fallback" ? parsed.topicSource : "pending",
    topicDictionarySource: normalizeTopicDictionarySource(parsed.topicDictionarySource ?? parsed.topicSourceMode),
    topicPairDistance: normalizeTopicPairDistance(parsed.topicPairDistance ?? parsed.topicSourceMode),
    clues: Array.isArray(parsed.clues) ? (parsed.clues as Clue[]) : [],
    votes: parsed.votes && typeof parsed.votes === "object" ? (parsed.votes as Record<string, string>) : {},
    accusedId: typeof parsed.accusedId === "string" ? parsed.accusedId : null,
    wolfGuess: typeof parsed.wolfGuess === "string" ? parsed.wolfGuess : "",
    winner: parsed.winner === "village" || parsed.winner === "wolf" || parsed.winner === "players" ? parsed.winner : null,
    resultText: typeof parsed.resultText === "string" ? parsed.resultText : "",
    createdAt: typeof parsed.createdAt === "number" ? parsed.createdAt : Date.now(),
    updatedAt: typeof parsed.updatedAt === "number" ? parsed.updatedAt : Date.now(),
  };
}

function makeChoice(room: WordWolfRoom): WordWolfRoomChoice {
  return {
    code: room.code,
    hostName: room.players.find((player) => player.id === room.hostId)?.name ?? "Unknown",
    playerCount: room.players.length,
    roundsTotal: room.roundsTotal,
    hasPassphrase: Boolean(room.passphrase),
    updatedAt: room.updatedAt,
  };
}

export async function loadStoredWordWolfRoom(code: string) {
  const raw = await redisCommand<string | null>(["GET", roomKey(code)]);
  if (!raw) return null;

  try {
    return normalizeRoom(JSON.parse(raw));
  } catch {
    return null;
  }
}

export async function saveStoredWordWolfRoom(room: unknown) {
  const normalizedRoom = normalizeRoom(room);
  if (!normalizedRoom) {
    throw new Error("INVALID_WORDWOLF_ROOM");
  }

  await redisCommand<"OK">(["SET", roomKey(normalizedRoom.code), JSON.stringify(normalizedRoom)]);
  await redisCommand<number>(["SADD", roomIndexKey, normalizedRoom.code]);

  return normalizedRoom;
}

export async function deleteStoredWordWolfRoom(code: string) {
  const normalizedCode = code.trim().toUpperCase();
  await redisCommand<number>(["DEL", roomKey(normalizedCode)]);
  await redisCommand<number>(["SREM", roomIndexKey, normalizedCode]);
}

export async function listStoredWordWolfRooms() {
  const codes = await redisCommand<string[]>(["SMEMBERS", roomIndexKey]);
  const rooms = await Promise.all(codes.map((code) => loadStoredWordWolfRoom(code)));
  return rooms.filter((room): room is WordWolfRoom => Boolean(room));
}

export async function listStoredJoinableWordWolfRooms() {
  const rooms = await listStoredWordWolfRooms();
  return rooms
    .filter((room) => room.phase === "lobby" && room.players.length < 6)
    .map(makeChoice)
    .sort((left, right) => right.updatedAt - left.updatedAt);
}

export async function deleteStoredHostedWordWolfRooms(ownerId: string, fallbackHostId: string) {
  const rooms = await listStoredWordWolfRooms();
  const deletions = rooms
    .filter((room) => room.ownerId === ownerId || (!room.ownerId && room.hostId === fallbackHostId))
    .map((room) => deleteStoredWordWolfRoom(room.code));

  await Promise.all(deletions);
  return deletions.length;
}

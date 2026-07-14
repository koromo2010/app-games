import {
  normalizeTopicDictionarySource,
  normalizeTopicPairDistance,
} from "@/lib/wordwolf";
import type { Clue, ClueMode, GameMode, Phase, Player, Room, RoomChoice, VoteRound } from "@/lib/wordwolf-game-types";
import type { WordWolfGuessJudgement } from "@/lib/wordwolf-guess-judgement";
import { redisCommand, redisPipeline } from "@/lib/redis-store";
import { recordWordWolfGameResults } from "@/lib/player-stats-store";
import { recordWordWolfReplay } from "@/lib/game-replay-store";
import { normalizeGameGenerationMeta } from "@/lib/game-ai-types";
import { normalizeCommonTimeLimit } from "@/lib/game-room-config";
import { isMultiplayerRoomExpired, multiplayerRoomExpiryArgs } from "@/lib/multiplayer-room-lifecycle";
import { canDissolveOnlineRoom, canMoveFromOnlineRoom } from "@/lib/room-dissolve-policy";
import { claimPlayerActiveRoom, releasePlayerActiveRoom } from "@/lib/player-active-room";
import { normalizeOnlineRoomCode, onlineRoomPassphraseMaximumLength } from "@/lib/online-room-input";
import { isAvatarColor, isAvatarImage } from "@/lib/player-session";

export type WordWolfRoom = Room;
export type WordWolfRoomChoice = RoomChoice;

const roomKeyPrefix = "wordwolf:room:";
const roomIndexKey = "wordwolf:rooms";
const playerActiveRoomKeyPrefix = "wordwolf:player-active-room:";

function roomKey(code: string) {
  return `${roomKeyPrefix}${code.trim().toUpperCase()}`;
}

function playerActiveRoomKey(playerId: string) {
  return `${playerActiveRoomKeyPrefix}${playerId}`;
}

function normalizeGameMode(value: unknown): GameMode {
  return value === "may-no-wolf" || value === "no-wolf" ? "may-no-wolf" : "wordwolf";
}

function normalizeClueMode(value: unknown): ClueMode {
  return value === "simultaneous" ? "simultaneous" : "turn";
}

function isPhase(value: unknown): value is Phase {
  return value === "lobby" || value === "clue" || value === "vote" || value === "wolfGuess" || value === "result";
}

function normalizeScores(value: unknown) {
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

function normalizeWolfIds(room: Partial<WordWolfRoom>) {
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

const allowedRoundsTotal = [1, 2, 3, 4];

function normalizeRoundsTotal(value: unknown) {
  const round = typeof value === "number" && Number.isFinite(value) ? Math.floor(value) : 3;
  return allowedRoundsTotal.includes(round) ? round : 3;
}

function normalizeGuessJudgement(value: unknown): WordWolfGuessJudgement | null {
  if (!value || typeof value !== "object") return null;

  const parsed = value as Partial<WordWolfGuessJudgement>;
  const source =
    parsed.source === "exact" || parsed.source === "feedback" || parsed.source === "llm" || parsed.source === "fuzzy"
      ? parsed.source
      : "fuzzy";

  if (typeof parsed.accepted !== "boolean") return null;

  return {
    accepted: parsed.accepted,
    source,
    reason: typeof parsed.reason === "string" ? parsed.reason : "",
    confidence: typeof parsed.confidence === "number" ? Math.max(0, Math.min(1, parsed.confidence)) : 0,
    feedbackAccepted: typeof parsed.feedbackAccepted === "number" ? Math.max(0, Math.floor(parsed.feedbackAccepted)) : 0,
    feedbackRejected: typeof parsed.feedbackRejected === "number" ? Math.max(0, Math.floor(parsed.feedbackRejected)) : 0,
  };
}

function didPlayerWin(room: WordWolfRoom, playerId: string) {
  if (room.winner === "players") {
    return room.accusedId ? playerId !== room.accusedId : true;
  }

  if (room.winner === "village") {
    return !normalizeWolfIds(room).includes(playerId);
  }

  return normalizeWolfIds(room).includes(playerId);
}

function addRoomScore(room: WordWolfRoom) {
  if (room.phase !== "result" || !room.winner) return room;

  const scores = { ...room.scores };
  for (const player of room.players) {
    if (didPlayerWin(room, player.id)) {
      scores[player.id] = (scores[player.id] ?? 0) + 1;
    }
  }

  return {
    ...room,
    scores,
    gamesPlayed: room.gamesPlayed + 1,
  };
}

function normalizeRoom(value: unknown): WordWolfRoom | null {
  if (!value || typeof value !== "object") return null;

  const parsed = value as Partial<WordWolfRoom>;
  const code = normalizeOnlineRoomCode(parsed.code);
  const hostId = typeof parsed.hostId === "string" ? parsed.hostId : "";
  const players = Array.isArray(parsed.players) ? parsed.players.filter((player) => player?.id && player?.name) : [];
  const gamesPlayed = typeof parsed.gamesPlayed === "number" ? Math.max(0, Math.floor(parsed.gamesPlayed)) : 0;

  if (!code || !hostId || players.length === 0) return null;

  return {
    revision: typeof parsed.revision === "number" ? Math.max(0, Math.floor(parsed.revision)) : 0,
    code,
    hostId,
    ownerId: typeof parsed.ownerId === "string" ? parsed.ownerId : undefined,
    passphrase: typeof parsed.passphrase === "string" ? parsed.passphrase.slice(0, onlineRoomPassphraseMaximumLength) : "",
    phase: isPhase(parsed.phase) ? parsed.phase : "lobby",
    gameMode: normalizeGameMode(parsed.gameMode),
    debugMode: Boolean(parsed.debugMode),
    debugReplayEnabled: Boolean(parsed.debugMode && parsed.debugReplayEnabled),
    clueLogVisibility: parsed.clueLogVisibility === "always" ? "always" : "result",
    clueMode: normalizeClueMode(parsed.clueMode),
    randomizeTurnOrder: parsed.randomizeTurnOrder ?? true,
    players: players.slice(0, 20).map((player) => ({
      ...player,
      id: String(player.id).slice(0, 80),
      name: String(player.name).trim().slice(0, 40),
      avatarColor: isAvatarColor(player.avatarColor ?? null) ? player.avatarColor : undefined,
      avatarImage: isAvatarImage(player.avatarImage ?? null) ? player.avatarImage : undefined,
    })) as Player[],
    roundsTotal: normalizeRoundsTotal(parsed.roundsTotal),
    turnTimeLimitSeconds: normalizeCommonTimeLimit(parsed.turnTimeLimitSeconds),
    currentRound: typeof parsed.currentRound === "number" ? parsed.currentRound : 1,
    currentTurnIndex: typeof parsed.currentTurnIndex === "number" ? parsed.currentTurnIndex : 0,
    currentTurnStartedAt: typeof parsed.currentTurnStartedAt === "number" ? parsed.currentTurnStartedAt : null,
    wolfId: typeof parsed.wolfId === "string" ? parsed.wolfId : null,
    wolfIds: normalizeWolfIds(parsed),
    wolfCount: normalizeWolfCount(parsed.wolfCount, players.length),
    villageWord: typeof parsed.villageWord === "string" ? parsed.villageWord : "",
    wolfWord: typeof parsed.wolfWord === "string" ? parsed.wolfWord : "",
    topicReason: typeof parsed.topicReason === "string" ? parsed.topicReason : "",
    topicSource: parsed.topicSource === "llm" || parsed.topicSource === "fallback" ? parsed.topicSource : "pending",
    topicFallbackExhausted: Boolean(parsed.topicFallbackExhausted),
    topicGeneration: normalizeGameGenerationMeta(parsed.topicGeneration),
    topicDictionarySource: normalizeTopicDictionarySource(parsed.topicDictionarySource ?? parsed.topicSourceMode),
    topicPairDistance: normalizeTopicPairDistance(parsed.topicPairDistance ?? parsed.topicSourceMode),
    topicHint: typeof parsed.topicHint === "string" ? parsed.topicHint.slice(0, 80) : "",
    clues: Array.isArray(parsed.clues) ? (parsed.clues as Clue[]) : [],
    votes: parsed.votes && typeof parsed.votes === "object" ? (parsed.votes as Record<string, string>) : {},
    voteHistory: normalizeVoteHistory(parsed.voteHistory),
    runoffCandidateIds: normalizeRunoffCandidateIds(parsed.runoffCandidateIds),
    accusedId: typeof parsed.accusedId === "string" ? parsed.accusedId : null,
    wolfGuess: typeof parsed.wolfGuess === "string" ? parsed.wolfGuess : "",
    wolfGuessJudgement: normalizeGuessJudgement(parsed.wolfGuessJudgement),
    winner: parsed.winner === "village" || parsed.winner === "wolf" || parsed.winner === "players" ? parsed.winner : null,
    resultText: typeof parsed.resultText === "string" ? parsed.resultText : "",
    scores: normalizeScores(parsed.scores),
    gamesPlayed,
    gameNumber: typeof parsed.gameNumber === "number" ? Math.max(1, Math.floor(parsed.gameNumber)) : gamesPlayed + 1,
    statsRecordedAt: typeof parsed.statsRecordedAt === "number" ? parsed.statsRecordedAt : undefined,
    createdAt: typeof parsed.createdAt === "number" ? parsed.createdAt : Date.now(),
    updatedAt: typeof parsed.updatedAt === "number" ? parsed.updatedAt : Date.now(),
  };
}

export function sanitizeWordWolfRoom(room: WordWolfRoom, playerId: string) {
  const revealAll = room.phase === "result" || (room.debugMode && room.hostId === playerId);
  const playerIsWolf = normalizeWolfIds(room).includes(playerId);
  const ownWord = playerIsWolf ? room.wolfWord : room.villageWord;
  const votes = revealAll
    ? room.votes
    : room.votes[playerId]
      ? { [playerId]: room.votes[playerId] }
      : {};
  return {
    ...room,
    passphrase: room.passphrase ? "設定済み" : "",
    wolfId: revealAll ? room.wolfId : playerIsWolf ? playerId : null,
    wolfIds: revealAll ? room.wolfIds : playerIsWolf ? [playerId] : [],
    villageWord: revealAll ? room.villageWord : ownWord,
    wolfWord: revealAll ? room.wolfWord : ownWord,
    topicReason: revealAll ? room.topicReason : "",
    clues: revealAll || room.clueLogVisibility === "always"
      ? room.clues
      : room.clues.map((clue) => clue.playerId === playerId ? clue : { ...clue, text: "投稿済み" }),
    votes,
    voteHistory: revealAll
      ? room.voteHistory
      : room.voteHistory.map((round) => ({
          ...round,
          votes: round.votes[playerId] ? { [playerId]: round.votes[playerId] } : {},
        })),
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
    const room = normalizeRoom(JSON.parse(raw));
    if (!room) return null;
    if (isMultiplayerRoomExpired(room.updatedAt)) {
      await redisCommand<number>(["DEL", roomKey(room.code)]);
      await redisCommand<number>(["SREM", roomIndexKey, room.code]);
      await Promise.all(room.players.map((player) => deletePlayerActiveRoom(player.id, room.code)));
      return null;
    }
    return room;
  } catch {
    return null;
  }
}

async function deletePlayerActiveRoom(playerId: string, roomCode: string) {
  const savedCode = await redisCommand<string | null>(["GET", playerActiveRoomKey(playerId)]);
  if (savedCode?.trim().toUpperCase() === roomCode.trim().toUpperCase()) {
    await redisCommand<number>(["DEL", playerActiveRoomKey(playerId)]);
  }
}

export async function loadStoredPlayerActiveRoom(playerId: string) {
  const normalizedPlayerId = playerId.trim();
  if (!normalizedPlayerId) return null;

  const code = await redisCommand<string | null>(["GET", playerActiveRoomKey(normalizedPlayerId)]);
  if (!code) return null;

  const room = await loadStoredWordWolfRoom(code);
  if (!room || !room.players.some((player) => player.id === normalizedPlayerId)) {
    await redisCommand<number>(["DEL", playerActiveRoomKey(normalizedPlayerId)]);
    return null;
  }

  return room;
}

export async function saveStoredWordWolfRoom(room: unknown) {
  let normalizedRoom = normalizeRoom(room);
  if (!normalizedRoom) {
    throw new Error("INVALID_WORDWOLF_ROOM");
  }

  const shouldRecordResults = normalizedRoom.phase === "result" && Boolean(normalizedRoom.winner) && !normalizedRoom.statsRecordedAt;
  if (shouldRecordResults) {
    normalizedRoom = addRoomScore(normalizedRoom);
    normalizedRoom = {
      ...normalizedRoom,
      statsRecordedAt: Date.now(),
    };
  }

  // revisionをRedis内で比較し、遅れて届いた画面から部屋全体が巻き戻るのを防ぐ。
  const saved = await redisCommand<number>([
    "EVAL",
    "local raw=redis.call('GET',KEYS[1]); if raw then local current=cjson.decode(raw); local rev=tonumber(current.revision or 0); if tonumber(ARGV[1])<=rev then return 0 end end; redis.call('SET',KEYS[1],ARGV[2],'EX',ARGV[3]); return 1",
    "1", roomKey(normalizedRoom.code), String(normalizedRoom.revision), JSON.stringify(normalizedRoom), multiplayerRoomExpiryArgs()[1],
  ]);
  if (saved !== 1) throw new Error("WORDWOLF_ROOM_CONFLICT");

  if (shouldRecordResults) await Promise.all([recordWordWolfGameResults(normalizedRoom), recordWordWolfReplay(normalizedRoom)]);

  // 残る索引更新は1回のHTTP pipelineにまとめる。
  await redisPipeline<unknown[]>([
    ["SADD", roomIndexKey, normalizedRoom.code],
    ...normalizedRoom.players.map((player) =>
      ["SET", playerActiveRoomKey(player.id), normalizedRoom.code, ...multiplayerRoomExpiryArgs()],
    ),
  ]);

  return normalizedRoom;
}

export async function saveStoredWordWolfRoomAsHost(room: unknown, actorId: string) {
  let normalizedRoom = normalizeRoom(room);
  if (!normalizedRoom) throw new Error("INVALID_WORDWOLF_ROOM");
  const current = await loadStoredWordWolfRoom(normalizedRoom.code);
  if (current) {
    if (current.hostId !== actorId || normalizedRoom.hostId !== current.hostId) throw new Error("WORDWOLF_ROOM_FORBIDDEN");
    normalizedRoom = { ...normalizedRoom, passphrase: current.passphrase };
  } else if (normalizedRoom.hostId !== actorId || !normalizedRoom.players.some((player) => player.id === actorId)) {
    throw new Error("WORDWOLF_ROOM_FORBIDDEN");
  }
  if (current) return saveStoredWordWolfRoom(normalizedRoom);
  const activeRoom = await loadStoredPlayerActiveRoom(actorId);
  if (activeRoom && activeRoom.code !== normalizedRoom.code) {
    if (!canMoveFromOnlineRoom("wordwolf", activeRoom)) throw new Error("WORDWOLF_PLAYER_ALREADY_ACTIVE");
    await releasePlayerActiveRoom(playerActiveRoomKey(actorId), activeRoom.code);
  }
  const claim = await claimPlayerActiveRoom(playerActiveRoomKey(actorId), normalizedRoom.code);
  if (!claim) throw new Error("WORDWOLF_PLAYER_ALREADY_ACTIVE");
  try {
    return await saveStoredWordWolfRoom(normalizedRoom);
  } catch (error) {
    if (claim === "claimed") await releasePlayerActiveRoom(playerActiveRoomKey(actorId), normalizedRoom.code);
    throw error;
  }
}

export async function joinStoredWordWolfRoom(code: string, player: Player, passphrase: string) {
  const normalizedCode = code.trim().toUpperCase();
  const activeRoom = await loadStoredPlayerActiveRoom(player.id);
  if (activeRoom && activeRoom.code !== normalizedCode) {
    if (!canMoveFromOnlineRoom("wordwolf", activeRoom)) throw new Error("WORDWOLF_PLAYER_ALREADY_ACTIVE");
    await releasePlayerActiveRoom(playerActiveRoomKey(player.id), activeRoom.code);
  }
  const claim = await claimPlayerActiveRoom(playerActiveRoomKey(player.id), normalizedCode);
  if (!claim) throw new Error("WORDWOLF_PLAYER_ALREADY_ACTIVE");
  try {
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const room = await loadStoredWordWolfRoom(normalizedCode);
      if (!room) throw new Error("WORDWOLF_ROOM_NOT_FOUND");
      if (room.phase !== "lobby") throw new Error("WORDWOLF_ROOM_STARTED");
      if (room.passphrase && room.passphrase !== passphrase.trim()) throw new Error("WORDWOLF_BAD_PASSPHRASE");
      if (room.players.some((item) => item.id === player.id)) return room;
      try {
        return await saveStoredWordWolfRoom({
          ...room,
          players: [...room.players, player],
          revision: room.revision + 1,
          updatedAt: Date.now(),
        });
      } catch (error) {
        if (!(error instanceof Error) || error.message !== "WORDWOLF_ROOM_CONFLICT") throw error;
      }
    }
    throw new Error("WORDWOLF_ROOM_CONFLICT");
  } catch (error) {
    if (claim === "claimed") await releasePlayerActiveRoom(playerActiveRoomKey(player.id), normalizedCode);
    throw error;
  }
}

export async function deleteStoredWordWolfRoom(code: string) {
  const normalizedCode = code.trim().toUpperCase();
  const room = await loadStoredWordWolfRoom(normalizedCode);
  if (room && !canDissolveOnlineRoom("wordwolf", room)) throw new Error("WORDWOLF_ROOM_IN_PROGRESS");
  await redisCommand<number>(["DEL", roomKey(normalizedCode)]);
  await redisCommand<number>(["SREM", roomIndexKey, normalizedCode]);

  if (room) {
    await Promise.all(room.players.map((player) => deletePlayerActiveRoom(player.id, normalizedCode)));
  }
}

export async function listStoredWordWolfRooms() {
  const codes = await redisCommand<string[]>(["SMEMBERS", roomIndexKey]);
  const rooms = await Promise.all(codes.map((code) => loadStoredWordWolfRoom(code)));
  const missingCodes = codes.filter((_, index) => !rooms[index]);
  if (missingCodes.length > 0) await redisCommand<number>(["SREM", roomIndexKey, ...missingCodes]);
  return rooms.filter((room): room is WordWolfRoom => Boolean(room));
}

export async function listStoredJoinableWordWolfRooms() {
  const rooms = await listStoredWordWolfRooms();
  return rooms
    .filter((room) => room.phase === "lobby")
    .map(makeChoice)
    .sort((left, right) => right.updatedAt - left.updatedAt);
}

export async function deleteStoredHostedWordWolfRooms(hostId: string) {
  const rooms = await listStoredWordWolfRooms();
  const hostedRooms = rooms.filter((room) => room.hostId === hostId);
  if (hostedRooms.some((room) => !canDissolveOnlineRoom("wordwolf", room))) throw new Error("WORDWOLF_ROOM_IN_PROGRESS");
  const deletions = rooms
    .filter((room) => room.hostId === hostId)
    .map((room) => deleteStoredWordWolfRoom(room.code));

  await Promise.all(deletions);
  return deletions.length;
}

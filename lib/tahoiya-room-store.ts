import { redisCommand } from "@/lib/redis-store";
import { randomUUID } from "node:crypto";
import type { TahoiyaAnswererMode, TahoiyaDefinitionOption, TahoiyaPhase, TahoiyaPlayer, TahoiyaRoom, TahoiyaRoomAction, TahoiyaRoomChoice, TahoiyaTopic } from "@/lib/tahoiya-types";
import { calculateTahoiyaRoundScores, tahoiyaRuntimeScoring, TAHOIYA_CORRECT_VOTE_POINTS, TAHOIYA_FOOLED_VOTE_POINTS } from "@/lib/tahoiya-scoring";
import { normalizeGameGenerationMeta } from "@/lib/game-ai-types";
import { recordTahoiyaRoundResults } from "@/lib/player-stats-store";
import { recordTahoiyaReplay } from "@/lib/game-replay-store";
import { normalizeCommonTimeLimit } from "@/lib/game-room-config";
import { isMultiplayerRoomExpired, multiplayerRoomTtlSeconds } from "@/lib/multiplayer-room-lifecycle";
import { commonGameTimeoutGraceMs } from "@/lib/game-timer/policy";
import { canDissolveOnlineRoom, canMoveFromOnlineRoom } from "@/lib/room-dissolve-policy";
import { claimPlayerActiveRoom, releasePlayerActiveRoom } from "@/lib/player-active-room";
import { normalizeOnlineRoomCode, onlineRoomPassphraseMaximumLength } from "@/lib/online-room-input";
import { isAvatarColor, isAvatarImage } from "@/lib/player-session";
import { onlineRoomPlayerLimits } from "@/lib/online-room-policy";
import { loadOnlineRoomValues, scanOnlineRoomCodes } from "@/lib/online-room-list";
import { normalizePlayerTimeoutFields, playerTimeLimitSeconds, recordPlayerActivity, recordPlayerTimeout, recoverPlayerTimeout } from "@/lib/player-timeout-policy";

const timeoutSubmission = "__timeout__";

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

function isAnswererMode(value: unknown): value is TahoiyaAnswererMode {
  return value === "manual" || value === "random";
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
    .slice(0, onlineRoomPlayerLimits.tahoiya)
    .map((player) => ({
      id: String(player.id).slice(0, 80),
      name: String(player.name).trim().slice(0, 40),
      joinedAt: typeof player.joinedAt === "number" ? player.joinedAt : Date.now(),
      avatarColor: isAvatarColor(player.avatarColor ?? null) ? player.avatarColor : undefined,
      avatarImage: isAvatarImage(player.avatarImage ?? null) ? player.avatarImage : undefined,
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
  const code = normalizeOnlineRoomCode(parsed.code);
  const hostId = typeof parsed.hostId === "string" ? parsed.hostId : "";
  const players = normalizePlayers(parsed.players);
  const parentId = typeof parsed.parentId === "string" ? parsed.parentId : hostId;
  const playMode = parsed.playMode === "all-vote" ? "all-vote" : "single-answerer";

  if (!code || !hostId || players.length === 0) return null;

  return {
    code,
    revision: typeof parsed.revision === "number" ? Math.max(0, Math.floor(parsed.revision)) : 0,
    hostId,
    ownerId: typeof parsed.ownerId === "string" ? parsed.ownerId : undefined,
    passphrase: typeof parsed.passphrase === "string" ? parsed.passphrase.slice(0, onlineRoomPassphraseMaximumLength) : "",
    phase: isPhase(parsed.phase) ? parsed.phase : "lobby",
    debugMode: Boolean(parsed.debugMode),
    debugReplayEnabled: Boolean(parsed.debugMode && parsed.debugReplayEnabled),
    players,
    ...normalizePlayerTimeoutFields(parsed, players.map((player) => player.id)),
    parentId,
    playMode,
    topicDifficulty: parsed.topicDifficulty === "extreme" ? "extreme" : "standard",
    answererMode: isAnswererMode(parsed.answererMode) ? parsed.answererMode : "random",
    showRealDefinitionToWriters: playMode === "single-answerer" && parsed.showRealDefinitionToWriters !== false,
    actionTimeLimitSeconds: normalizeCommonTimeLimit(parsed.actionTimeLimitSeconds),
    correctVotePoints: typeof parsed.correctVotePoints === "number" && Number.isInteger(parsed.correctVotePoints) ? Math.max(0, Math.min(10, parsed.correctVotePoints)) : TAHOIYA_CORRECT_VOTE_POINTS,
    fooledVotePoints: typeof parsed.fooledVotePoints === "number" && Number.isInteger(parsed.fooledVotePoints) ? Math.max(0, Math.min(10, parsed.fooledVotePoints)) : TAHOIYA_FOOLED_VOTE_POINTS,
    phaseStartedAt: typeof parsed.phaseStartedAt === "number" ? parsed.phaseStartedAt : null,
    answererId: typeof parsed.answererId === "string" ? parsed.answererId : "",
    round: typeof parsed.round === "number" ? Math.max(1, Math.floor(parsed.round)) : 1,
    word: typeof parsed.word === "string" ? parsed.word : "",
    reading: typeof parsed.reading === "string" ? parsed.reading : undefined,
    realDefinition: typeof parsed.realDefinition === "string" ? parsed.realDefinition : "",
    topicNote: typeof parsed.topicNote === "string" ? parsed.topicNote : "",
    topicSourceDetail: typeof parsed.topicSourceDetail === "string" ? parsed.topicSourceDetail : "",
    topicSource: parsed.topicSource === "llm" || parsed.topicSource === "fallback" ? parsed.topicSource : "pending",
    topicGeneration: normalizeGameGenerationMeta(parsed.topicGeneration),
    fakeDefinitions: normalizeStringRecord(parsed.fakeDefinitions),
    options: normalizeOptions(parsed.options),
    votes: normalizeStringRecord(parsed.votes),
    scores: normalizeScores(parsed.scores),
    resultText: typeof parsed.resultText === "string" ? parsed.resultText : "",
    createdAt: typeof parsed.createdAt === "number" ? parsed.createdAt : Date.now(),
    updatedAt: typeof parsed.updatedAt === "number"
      ? parsed.updatedAt
      : typeof parsed.createdAt === "number" ? parsed.createdAt : Date.now(),
  };
}

export function sanitizeTahoiyaRoom(room: TahoiyaRoom, playerId: string): TahoiyaRoom {
  const revealAll = room.phase === "result" || (room.debugMode === true && room.hostId === playerId);
  const canSeeRealDefinition = revealAll || (
    room.phase === "writing" &&
    room.playMode === "single-answerer" &&
    room.showRealDefinitionToWriters &&
    room.answererId !== playerId
  );
  const submittedMarker = "__submitted__";
  return {
    ...room,
    passphrase: room.passphrase ? "••••••••" : "",
    realDefinition: canSeeRealDefinition ? room.realDefinition : "",
    topicNote: canSeeRealDefinition ? room.topicNote : "",
    topicSourceDetail: canSeeRealDefinition ? room.topicSourceDetail : "",
    fakeDefinitions: revealAll
      ? room.fakeDefinitions
      : Object.fromEntries(Object.entries(room.fakeDefinitions).map(([authorId, text]) => [authorId, authorId === playerId ? text : submittedMarker])),
    options: revealAll
      ? room.options
      : room.options.map((option) => ({ ...option, authorId: option.authorId === playerId ? playerId : null, isReal: false })),
    votes: revealAll
      ? room.votes
      : Object.fromEntries(Object.entries(room.votes).map(([voterId, optionId]) => [voterId, voterId === playerId ? optionId : submittedMarker])),
  };
}

function definitionWriterIds(room: TahoiyaRoom) {
  return room.playMode === "all-vote"
    ? room.players.map((player) => player.id)
    : room.players.filter((player) => player.id !== room.answererId).map((player) => player.id);
}

function voterIds(room: TahoiyaRoom) {
  return room.playMode === "all-vote"
    ? room.players.map((player) => player.id)
    : room.answererId ? [room.answererId] : [];
}

function shuffle<T>(items: T[]) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

function createDefinitionOptions(room: TahoiyaRoom): TahoiyaDefinitionOption[] {
  return shuffle([
    { id: `real-${randomUUID()}`, text: room.realDefinition, authorId: null, isReal: true },
    ...Object.entries(room.fakeDefinitions).filter(([, text]) => text !== timeoutSubmission).map(([playerId, text]) => ({
      id: `fake-${randomUUID()}`,
      text,
      authorId: playerId,
      isReal: false,
    })),
  ]);
}

function scoreRoom(room: TahoiyaRoom) {
  const scores = { ...room.scores };
  const roundScores = calculateTahoiyaRoundScores(room);
  const scoreLines: string[] = [];
  const voteCounts = Object.values(room.votes).reduce<Record<string, number>>((counts, optionId) => {
    counts[optionId] = (counts[optionId] ?? 0) + 1;
    return counts;
  }, {});
  const maxVotes = Math.max(0, ...Object.values(voteCounts));
  const leaders = room.options.filter((option) => maxVotes > 0 && (voteCounts[option.id] ?? 0) === maxVotes);
  const leaderNames = leaders.map((option) => option.isReal
    ? "本物の説明"
    : `${room.players.find((player) => player.id === option.authorId)?.name ?? "Unknown"}の偽説明`);
  const leadResult = leaderNames.length > 0
    ? `最多得票: ${leaderNames.join("・")}（${maxVotes}票）${leaderNames.length > 1 ? " 同率" : ""}`
    : "投票はありませんでした。";

  for (const [voterId, optionId] of Object.entries(room.votes)) {
    const option = room.options.find((item) => item.id === optionId);
    const voter = room.players.find((player) => player.id === voterId);
    if (!option || !voter) continue;
    if (option.isReal) {
      scoreLines.push(`${voter.name} が本物を当てて +${room.correctVotePoints}`);
    } else if (option.authorId) {
      const author = room.players.find((player) => player.id === option.authorId);
      scoreLines.push(`${author?.name ?? "Unknown"} の偽説明に票が入り +${room.fooledVotePoints}`);
    }
  }
  for (const player of room.players) scores[player.id] = (scores[player.id] ?? 0) + (roundScores[player.id] ?? 0);

  return {
    ...room,
    phase: "result" as const,
    phaseStartedAt: null,
    scores,
    resultText: `${leadResult} / ${scoreLines.length > 0 ? scoreLines.join(" / ") : "得点は入りませんでした。"}`,
  };
}

function writingComplete(room: TahoiyaRoom) {
  const writers = definitionWriterIds(room);
  return writers.length > 0 && writers.every((playerId) => Boolean(room.fakeDefinitions[playerId]));
}

function votingComplete(room: TahoiyaRoom) {
  const voters = voterIds(room);
  return voters.length > 0 && voters.every((playerId) => Boolean(room.votes[playerId]));
}

function timedOut(room: TahoiyaRoom, seconds = room.actionTimeLimitSeconds, now = Date.now()) {
  return Boolean(
    room.phaseStartedAt &&
    seconds > 0 &&
    now >= room.phaseStartedAt + seconds * 1000 + commonGameTimeoutGraceMs()
  );
}

function advanceToVoting(room: TahoiyaRoom) {
  return {
    ...room,
    phase: "voting" as const,
    options: createDefinitionOptions(room),
    votes: {},
    phaseStartedAt: Date.now(),
  };
}

function reconcileProgress(room: TahoiyaRoom) {
  if (room.phase === "writing") {
    let next = room;
    for (const playerId of definitionWriterIds(room).filter((id) => !room.fakeDefinitions[id])) {
      if (timedOut(room, playerTimeLimitSeconds(room.actionTimeLimitSeconds, room.playerTimeouts, playerId))) {
        const player = room.players.find((item) => item.id === playerId);
        next = recordPlayerTimeout(next, playerId, player?.name ?? "プレイヤー");
        next = { ...next, fakeDefinitions: { ...next.fakeDefinitions, [playerId]: timeoutSubmission } };
      }
    }
    if (writingComplete(next) || timedOut(room)) return advanceToVoting(next);
    return next;
  }
  if (room.phase === "voting") {
    let next = room;
    for (const playerId of voterIds(room).filter((id) => !room.votes[id])) {
      if (timedOut(room, playerTimeLimitSeconds(room.actionTimeLimitSeconds, room.playerTimeouts, playerId))) {
        const player = room.players.find((item) => item.id === playerId);
        next = recordPlayerTimeout(next, playerId, player?.name ?? "プレイヤー");
        next = { ...next, votes: { ...next.votes, [playerId]: timeoutSubmission } };
      }
    }
    if (votingComplete(next) || timedOut(room)) return scoreRoom(next);
    return next;
  }
  return room;
}

async function compareAndSetRoom(expectedRevision: number, room: TahoiyaRoom) {
  return redisCommand<number>([
    "EVAL",
    "local raw=redis.call('GET',KEYS[1]); if not raw then return -1 end; local current=cjson.decode(raw); if tonumber(current.revision or 0)~=tonumber(ARGV[1]) then return 0 end; redis.call('SET',KEYS[1],ARGV[2],'EX',ARGV[3]); return 1",
    "1",
    roomKey(room.code),
    String(expectedRevision),
    JSON.stringify(room),
    String(multiplayerRoomTtlSeconds),
  ]);
}

async function mutateStoredTahoiyaRoom(code: string, mutate: (room: TahoiyaRoom) => TahoiyaRoom) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const current = await loadStoredTahoiyaRoom(code);
    if (!current) throw new Error("TAHOIYA_ROOM_NOT_FOUND");
    const changed = mutate(current);
    if (changed === current) return current;
    const next = normalizeRoom({
      ...changed,
      revision: current.revision + 1,
      updatedAt: Date.now(),
    });
    if (!next) throw new Error("INVALID_TAHOIYA_ROOM");
    const saved = await compareAndSetRoom(current.revision, next);
    if (saved === 1) {
      await Promise.all([recordTahoiyaRoundResults(next), recordTahoiyaReplay(next)]);
      return next;
    }
    if (saved === -1) throw new Error("TAHOIYA_ROOM_NOT_FOUND");
  }
  throw new Error("TAHOIYA_ROOM_CONFLICT");
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
  await Promise.all(room.players.map((player) => redisCommand<"OK">([
    "SET", playerActiveRoomKey(player.id), room.code, "EX", String(multiplayerRoomTtlSeconds),
  ])));
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

function parseStoredTahoiyaRoom(raw: string | null) {
  if (!raw) return null;
  try {
    return normalizeRoom(JSON.parse(raw));
  } catch {
    return null;
  }
}

export async function loadAndReconcileStoredTahoiyaRoom(code: string) {
  const room = await loadStoredTahoiyaRoom(code);
  if (!room) return null;
  if (reconcileProgress(room) === room) {
    await Promise.all([recordTahoiyaRoundResults(room), recordTahoiyaReplay(room)]);
    return room;
  }
  return mutateStoredTahoiyaRoom(code, reconcileProgress);
}

export async function loadStoredTahoiyaPlayerActiveRoom(playerId: string) {
  const normalizedPlayerId = playerId.trim();
  if (!normalizedPlayerId) return null;

  const code = await redisCommand<string | null>(["GET", playerActiveRoomKey(normalizedPlayerId)]);
  if (!code) return null;

  const room = await loadAndReconcileStoredTahoiyaRoom(code);
  if (!room || !room.players.some((player) => player.id === normalizedPlayerId)) {
    await redisCommand<number>(["DEL", playerActiveRoomKey(normalizedPlayerId)]);
    return null;
  }

  return room;
}

export async function createStoredTahoiyaRoom(room: unknown, actorId = "") {
  const normalizedRoom = normalizeRoom(room);
  if (!normalizedRoom) {
    throw new Error("INVALID_TAHOIYA_ROOM");
  }

  const existingRoom = await loadStoredTahoiyaRoom(normalizedRoom.code).catch(() => null);
  if (existingRoom) throw new Error("TAHOIYA_ROOM_CONFLICT");
  if (actorId && actorId !== normalizedRoom.hostId) throw new Error("TAHOIYA_ROOM_FORBIDDEN");
  const createdRoom = { ...normalizedRoom, ...tahoiyaRuntimeScoring(), revision: 0, updatedAt: Date.now() };
  const activeRoom = actorId ? await loadStoredTahoiyaPlayerActiveRoom(actorId) : null;
  if (activeRoom && activeRoom.code !== createdRoom.code) {
    if (!canMoveFromOnlineRoom("tahoiya", activeRoom)) throw new Error("TAHOIYA_PLAYER_ALREADY_ACTIVE");
    await releasePlayerActiveRoom(playerActiveRoomKey(actorId), activeRoom.code);
  }
  const claim = actorId ? await claimPlayerActiveRoom(playerActiveRoomKey(actorId), createdRoom.code) : "already-claimed";
  if (!claim) throw new Error("TAHOIYA_PLAYER_ALREADY_ACTIVE");
  try {
    const created = await redisCommand<"OK" | null>([
      "SET", roomKey(createdRoom.code), JSON.stringify(createdRoom), "NX", "EX", String(multiplayerRoomTtlSeconds),
    ]);
    if (created !== "OK") throw new Error("TAHOIYA_ROOM_CONFLICT");
    await redisCommand<number>(["SADD", roomIndexKey, createdRoom.code]);
    await savePlayerActiveRooms(createdRoom);
    return createdRoom;
  } catch (error) {
    if (actorId && claim === "claimed") await releasePlayerActiveRoom(playerActiveRoomKey(actorId), createdRoom.code);
    throw error;
  }
}

export async function joinStoredTahoiyaRoom(code: string, player: TahoiyaPlayer, passphrase: string) {
  const normalizedCode = code.trim().toUpperCase();
  const activeRoom = await loadStoredTahoiyaPlayerActiveRoom(player.id);
  if (activeRoom && activeRoom.code !== normalizedCode) {
    if (!canMoveFromOnlineRoom("tahoiya", activeRoom)) throw new Error("TAHOIYA_PLAYER_ALREADY_ACTIVE");
    await releasePlayerActiveRoom(playerActiveRoomKey(player.id), activeRoom.code);
  }
  const claim = await claimPlayerActiveRoom(playerActiveRoomKey(player.id), normalizedCode);
  if (!claim) throw new Error("TAHOIYA_PLAYER_ALREADY_ACTIVE");
  try {
    const joined = await mutateStoredTahoiyaRoom(normalizedCode, (current) => {
      if (current.phase !== "lobby") throw new Error("TAHOIYA_ROOM_STARTED");
      if (current.passphrase && current.passphrase !== passphrase.trim()) throw new Error("TAHOIYA_BAD_PASSPHRASE");
      if (current.players.some((item) => item.id === player.id)) return current;
      if (current.players.length >= onlineRoomPlayerLimits.tahoiya) throw new Error("TAHOIYA_ROOM_FULL");
      return { ...current, players: [...current.players, player] };
    });
    await savePlayerActiveRooms(joined);
    return joined;
  } catch (error) {
    if (claim === "claimed") await releasePlayerActiveRoom(playerActiveRoomKey(player.id), normalizedCode);
    throw error;
  }
}

export async function startStoredTahoiyaRound(code: string, actorId: string, topic: TahoiyaTopic) {
  return mutateStoredTahoiyaRoom(code, (current) => {
    if (current.hostId !== actorId || current.phase !== "lobby") throw new Error("TAHOIYA_ROOM_FORBIDDEN");
    const players = [...current.players];
    while (current.debugMode && players.length < 2) {
      players.push({ id: `dummy-${randomUUID()}`, name: `テスト${players.length + 1}`, joinedAt: Date.now() });
    }
    if (players.length < 2) throw new Error("TAHOIYA_NOT_ENOUGH_PLAYERS");
    const answererId = current.playMode === "all-vote"
      ? ""
      : current.answererMode === "random"
        ? players[Math.floor(Math.random() * players.length)]?.id ?? ""
        : players.some((player) => player.id === current.answererId) ? current.answererId : "";
    if (current.playMode === "single-answerer" && !answererId) throw new Error("TAHOIYA_ANSWERER_REQUIRED");
    return {
      ...current,
      players,
      answererId,
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
    };
  });
}

export async function applyStoredTahoiyaRoomAction(code: string, action: TahoiyaRoomAction) {
  return mutateStoredTahoiyaRoom(code, (current) => {
    const actorIsHost = action.actorId === current.hostId;
    const actorIsMember = current.players.some((player) => player.id === action.actorId);
    if (!actorIsMember) throw new Error("TAHOIYA_ROOM_FORBIDDEN");
    if (action.type === "recover-player") {
      return recoverPlayerTimeout(current, action.actorId, current.players.find((player) => player.id === action.actorId)?.name ?? "プレイヤー") ?? current;
    }
    if (action.type === "abort-game") {
      if (!actorIsHost || !current.debugMode || current.phase === "lobby") throw new Error("TAHOIYA_ROOM_FORBIDDEN");
      const answererId = current.playMode === "single-answerer" && current.answererMode === "manual" ? current.answererId : "";
      return { ...current, phase: "lobby", debugReplayEnabled: false, phaseStartedAt: null, answererId, word: "", reading: "", realDefinition: "", topicNote: "", topicSourceDetail: "", topicSource: "pending", topicGeneration: undefined, fakeDefinitions: {}, options: [], votes: {}, resultText: "" };
    }
    if (action.type === "update-config") {
      if (!actorIsHost || current.phase !== "lobby") throw new Error("TAHOIYA_ROOM_FORBIDDEN");
      const playMode = action.config.playMode === "all-vote" ? "all-vote" : action.config.playMode === "single-answerer" ? "single-answerer" : current.playMode;
      const answererMode = action.config.answererMode === "manual" || action.config.answererMode === "random" ? action.config.answererMode : current.answererMode;
      const requestedAnswererId = typeof action.config.answererId === "string" ? action.config.answererId : current.answererId;
      return {
        ...current,
        playMode,
        topicDifficulty: action.config.topicDifficulty === "extreme" ? "extreme" : action.config.topicDifficulty === "standard" ? "standard" : current.topicDifficulty,
        answererMode,
        answererId: playMode === "all-vote" || answererMode === "random" ? "" : current.players.some((player) => player.id === requestedAnswererId) ? requestedAnswererId : "",
        showRealDefinitionToWriters: playMode === "single-answerer" && (typeof action.config.showRealDefinitionToWriters === "boolean" ? action.config.showRealDefinitionToWriters : current.showRealDefinitionToWriters),
        actionTimeLimitSeconds: action.config.actionTimeLimitSeconds === undefined ? current.actionTimeLimitSeconds : normalizeCommonTimeLimit(action.config.actionTimeLimitSeconds),
      };
    }
    if (action.type === "set-debug") {
      if (!actorIsHost || current.phase !== "lobby") throw new Error("TAHOIYA_ROOM_FORBIDDEN");
      return { ...current, debugMode: action.enabled, debugReplayEnabled: action.enabled ? current.debugReplayEnabled : false };
    }
    if (action.type === "set-debug-replay") {
      if (!actorIsHost || !current.debugMode) throw new Error("TAHOIYA_ROOM_FORBIDDEN");
      return { ...current, debugReplayEnabled: action.enabled };
    }
    if (action.type === "debug-add-player") {
      if (!actorIsHost || !current.debugMode || current.phase !== "lobby" || current.players.length >= onlineRoomPlayerLimits.tahoiya) throw new Error("TAHOIYA_ROOM_FORBIDDEN");
      const number = current.players.length + 1;
      return { ...current, players: [...current.players, { id: `dummy-${randomUUID()}`, name: `テスト${number}`, joinedAt: Date.now() }] };
    }
    if (action.type === "next-round") {
      if (!actorIsHost || current.phase !== "result") throw new Error("TAHOIYA_ROOM_FORBIDDEN");
      const answererId = current.playMode === "single-answerer" && current.answererMode === "manual" ? current.answererId : "";
      return { ...current, phase: "lobby", debugReplayEnabled: false, answererId, round: current.round + 1, word: "", reading: "", realDefinition: "", topicNote: "", topicSourceDetail: "", topicSource: "pending", topicGeneration: undefined, phaseStartedAt: null, fakeDefinitions: {}, options: [], votes: {}, resultText: "" };
    }
    if (action.type === "debug-replace-topic") {
      if (!actorIsHost || !current.debugMode || current.phase === "lobby" || action.round !== current.round + 1 || !action.topic.word.trim() || !action.topic.realDefinition.trim()) throw new Error("TAHOIYA_ROOM_FORBIDDEN");
      const answererId = current.playMode === "all-vote"
        ? ""
        : current.answererMode === "random"
          ? current.players[Math.floor(Math.random() * current.players.length)]?.id ?? ""
          : current.answererId;
      return { ...current, phase: "writing", phaseStartedAt: Date.now(), answererId, round: action.round, word: action.topic.word, reading: action.topic.reading, realDefinition: action.topic.realDefinition, topicNote: action.topic.note, topicSourceDetail: action.topic.sourceDetail, topicSource: action.topic.source, topicGeneration: action.topic.generation, fakeDefinitions: {}, options: [], votes: {}, resultText: "" };
    }
    const reconciled = reconcileProgress(current);
    if (reconciled !== current) return reconciled;
    if (!("round" in action)) throw new Error("TAHOIYA_ROOM_FORBIDDEN");
    if (action.round !== current.round) return current;

    if (action.type === "submit-definition") {
      const canActForPlayer = action.actorId === action.playerId || (current.debugMode && actorIsHost);
      if (!canActForPlayer || current.phase !== "writing" || !definitionWriterIds(current).includes(action.playerId)) {
        return current;
      }
      const text = action.text.trim().replace(/\s+/g, " ").slice(0, 240);
      if (!text) return current;
      return reconcileProgress(recordPlayerActivity({
        ...current,
        fakeDefinitions: { ...current.fakeDefinitions, [action.playerId]: text },
      }, action.playerId));
    }

    if (action.type === "cast-vote") {
      const canActForPlayer = action.actorId === action.playerId || (current.debugMode && actorIsHost);
      if (!canActForPlayer || current.phase !== "voting" || !voterIds(current).includes(action.playerId)) return current;
      const option = current.options.find((item) => item.id === action.optionId);
      if (!option || option.authorId === action.playerId) return current;
      return reconcileProgress(recordPlayerActivity({
        ...current,
        votes: { ...current.votes, [action.playerId]: option.id },
      }, action.playerId));
    }

    if (action.type === "advance-phase") {
      if (!actorIsHost) throw new Error("TAHOIYA_ROOM_FORBIDDEN");
      if (action.target === "voting" && current.phase === "writing") {
        return action.force || writingComplete(current) || timedOut(current) ? advanceToVoting(current) : current;
      }
      if (action.target === "result" && current.phase === "voting") {
        return action.force || votingComplete(current) || timedOut(current) ? scoreRoom(current) : current;
      }
      return current;
    }

    if (!actorIsHost || !current.debugMode) throw new Error("TAHOIYA_ROOM_FORBIDDEN");
    if (action.type === "debug-fill-definitions" && current.phase === "writing") {
      const fakeDefinitions = { ...current.fakeDefinitions };
      for (const playerId of definitionWriterIds(current)) {
        fakeDefinitions[playerId] ||= "特定の作業に使われる古い道具の一種。";
      }
      return reconcileProgress({ ...current, fakeDefinitions });
    }
    if (action.type === "debug-fill-votes" && current.phase === "voting") {
      const votes = { ...current.votes };
      for (const playerId of voterIds(current)) {
        const option = current.options.find((item) => item.authorId !== playerId);
        if (option) votes[playerId] = option.id;
      }
      return reconcileProgress({ ...current, votes });
    }
    return current;
  });
}

export async function deleteStoredTahoiyaRoom(code: string, actorId = "") {
  const normalizedCode = code.trim().toUpperCase();
  const room = await loadStoredTahoiyaRoom(normalizedCode);
  if (room && actorId && actorId !== room.hostId) throw new Error("TAHOIYA_ROOM_FORBIDDEN");
  if (room && !canDissolveOnlineRoom("tahoiya", room)) throw new Error("TAHOIYA_ROOM_IN_PROGRESS");
  await redisCommand<number>(["DEL", roomKey(normalizedCode)]);
  await redisCommand<number>(["SREM", roomIndexKey, normalizedCode]);

  if (room) {
    await Promise.all(room.players.map((player) => deletePlayerActiveRoom(player.id, normalizedCode)));
  }
}

export async function listStoredTahoiyaRooms() {
  const codes = await redisCommand<string[]>(["SMEMBERS", roomIndexKey]);
  const rooms = await Promise.all(codes.map((code) => loadStoredTahoiyaRoom(code)));
  const missingCodes = codes.filter((_, index) => !rooms[index]);
  if (missingCodes.length > 0) await redisCommand<number>(["SREM", roomIndexKey, ...missingCodes]);
  return rooms.filter((room): room is TahoiyaRoom => Boolean(room));
}

export async function listStoredJoinableTahoiyaRooms(cursor?: unknown) {
  const page = await scanOnlineRoomCodes(roomIndexKey, cursor);
  const values = await loadOnlineRoomValues(page.codes, roomKey);
  const parsedRooms = values.map(parseStoredTahoiyaRoom);
  const expiredCodes = page.codes.filter((_, index) => parsedRooms[index] && isMultiplayerRoomExpired(parsedRooms[index]!.updatedAt));
  const missingCodes = page.codes.filter((_, index) => !parsedRooms[index]);
  if (expiredCodes.length > 0) await Promise.all(expiredCodes.map(loadStoredTahoiyaRoom));
  if (missingCodes.length > 0) await redisCommand<number>(["SREM", roomIndexKey, ...missingCodes]);
  const rooms = parsedRooms
    .filter((room): room is TahoiyaRoom => Boolean(room && !isMultiplayerRoomExpired(room.updatedAt)))
    .filter((room) => room.phase === "lobby" && room.players.length < onlineRoomPlayerLimits.tahoiya)
    .map(makeChoice)
    .sort((left, right) => right.updatedAt - left.updatedAt);
  return { rooms, nextCursor: page.nextCursor };
}

export async function deleteStoredHostedTahoiyaRooms(authenticatedHostId: string) {
  const rooms = await listStoredTahoiyaRooms();
  const hostedRooms = rooms.filter((room) => room.hostId === authenticatedHostId);
  if (hostedRooms.some((room) => !canDissolveOnlineRoom("tahoiya", room))) throw new Error("TAHOIYA_ROOM_IN_PROGRESS");
  const deletions = rooms
    .filter((room) => room.hostId === authenticatedHostId)
    .map((room) => deleteStoredTahoiyaRoom(room.code));

  await Promise.all(deletions);
  return deletions.length;
}

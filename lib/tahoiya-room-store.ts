import { redisCommand } from "@/lib/redis-store";
import { randomUUID } from "node:crypto";
import type { TahoiyaPlayer, TahoiyaRoom, TahoiyaRoomAction, TahoiyaTopic, TahoiyaTopicGenerationStage } from "@/lib/tahoiya-types";
import { tahoiyaRuntimeScoring } from "@/lib/tahoiya-scoring";
import { recordTahoiyaRoundResults } from "@/lib/player-stats-store";
import { recordTahoiyaReplay } from "@/lib/game-replay-store";
import { recordTahoiyaDecoyCandidates } from "@/lib/tahoiya-decoy-candidate-store";
import { normalizeCommonTimeLimit } from "@/lib/game-room-config";
import { isMultiplayerRoomExpired } from "@/lib/multiplayer-room-lifecycle";
import { canDissolveOnlineRoom } from "@/lib/room-dissolve-policy";
import { allRoomPlayersReturned, beginRoomLobbyReturn, canRemoveWaitingRoomPlayer, confirmRoomLobbyReturn } from "@/lib/room-lobby-return";
import { claimOnlineRoomForPlayer, loadPlayerActiveOnlineRoom, releasePlayerActiveRoom } from "@/lib/player-active-room";
import { onlineRoomPlayerLimits } from "@/lib/online-room-policy";
import { loadIndexedOnlineRoomPage } from "@/lib/online-room-list";
import { createIndexedOnlineRoom, mutateOnlineRoomWithRetry } from "@/lib/online-room-persistence";
import { deleteIndexedOnlineRoomStorage } from "@/lib/online-room-dissolution";
import { schedulePostResponseWork } from "@/lib/post-response-work";
import { normalizeTahoiyaRoom } from "@/lib/tahoiya-room-normalizer";
import { sanitizeTahoiyaRoom, tahoiyaRoomChoice } from "@/lib/tahoiya-room-presentation";
import { advanceToVoting, canAdvanceTahoiyaPhase, definitionWriterIds, reconcileProgress, scoreRoom, voterIds } from "@/lib/tahoiya-room-domain";
import { recordPlayerActivity, recoverPlayerTimeout } from "@/lib/player-timeout-policy";
import { isTahoiyaTopicGenerationProgressFresh } from "@/lib/tahoiya-topic-generation-progress";
import { normalizeTahoiyaFakeDefinitionsPerPlayer } from "@/lib/tahoiya-definitions";
import { canRemoveOnlineRoomDebugPlayer, isOnlineRoomDebugPlayer } from "@/lib/online-room-access";
import { nextTahoiyaDebugPlayerName, removeTahoiyaDebugParticipants } from "@/lib/tahoiya-debug-participants";

const roomKeyPrefix = "tahoiya:room:";
const roomIndexKey = "tahoiya:rooms";
const playerActiveRoomKeyPrefix = "tahoiya:player-active-room:";

export { sanitizeTahoiyaRoom };

function roomKey(code: string) {
  return `${roomKeyPrefix}${code.trim().toUpperCase()}`;
}

function playerActiveRoomKey(playerId: string) {
  return `${playerActiveRoomKeyPrefix}${playerId}`;
}



async function mutateStoredTahoiyaRoom(code: string, mutate: (room: TahoiyaRoom) => TahoiyaRoom) {
  return mutateOnlineRoomWithRetry({ code, roomKey, loadRoom: loadStoredTahoiyaRoom, mutate, normalize: normalizeTahoiyaRoom, activeRoomKeys: (room) => room.players.filter((player) => !isOnlineRoomDebugPlayer(player)).map((player) => playerActiveRoomKey(player.id)), errors: { notFound: "TAHOIYA_ROOM_NOT_FOUND", invalid: "INVALID_TAHOIYA_ROOM", conflict: "TAHOIYA_ROOM_CONFLICT" }, realtimeGame: "tahoiya", afterSave: (room) => Promise.all([recordTahoiyaRoundResults(room), recordTahoiyaReplay(room), recordTahoiyaDecoyCandidates(room)]) });
}

async function deleteTahoiyaRoomStorage(roomCode: string, playerIds: string[]) {
  await deleteIndexedOnlineRoomStorage({
    roomCode,
    roomKey: roomKey(roomCode),
    roomIndexKey,
    playerActiveRoomKeys: playerIds.map(playerActiveRoomKey),
  });
}

export async function loadStoredTahoiyaRoom(code: string) {
  const raw = await redisCommand<string | null>(["GET", roomKey(code)]);
  if (!raw) return null;

  try {
    const room = normalizeTahoiyaRoom(JSON.parse(raw));
    if (!room) return null;
    if (isMultiplayerRoomExpired(room.updatedAt)) {
      await deleteTahoiyaRoomStorage(room.code, room.players.map((player) => player.id));
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
    return normalizeTahoiyaRoom(JSON.parse(raw));
  } catch {
    return null;
  }
}

export async function loadAndReconcileStoredTahoiyaRoom(code: string) {
  const room = await loadStoredTahoiyaRoom(code);
  if (!room) return null;
  const reconcileRoom = (current: TahoiyaRoom) => reconcileProgress(
    current.topicGenerationProgress && !isTahoiyaTopicGenerationProgressFresh(current.topicGenerationProgress)
      ? { ...current, topicGenerationProgress: undefined }
      : current,
  );
  if (reconcileRoom(room) === room) {
    await schedulePostResponseWork("tahoiya-result-persistence", () => Promise.all([recordTahoiyaRoundResults(room), recordTahoiyaReplay(room), recordTahoiyaDecoyCandidates(room)]));
    return room;
  }
  return mutateStoredTahoiyaRoom(code, reconcileRoom);
}

export async function loadStoredTahoiyaPlayerActiveRoom(playerId: string) {
  return loadPlayerActiveOnlineRoom(playerId, { key: playerActiveRoomKey, loadRoom: loadAndReconcileStoredTahoiyaRoom, isMember: (room, id) => room.players.some((player) => player.id === id) });
}

export async function createStoredTahoiyaRoom(room: unknown, actorId = "") {
  const normalizedRoom = normalizeTahoiyaRoom(room);
  if (!normalizedRoom) {
    throw new Error("INVALID_TAHOIYA_ROOM");
  }

  const existingRoom = await loadStoredTahoiyaRoom(normalizedRoom.code).catch(() => null);
  if (existingRoom) throw new Error("TAHOIYA_ROOM_CONFLICT");
  if (actorId && actorId !== normalizedRoom.hostId) throw new Error("TAHOIYA_ROOM_FORBIDDEN");
  const createdRoom = { ...normalizedRoom, ...tahoiyaRuntimeScoring(), revision: 0, updatedAt: Date.now() };
  const activeRoom = actorId ? await loadStoredTahoiyaPlayerActiveRoom(actorId) : null;
  const claim = actorId
    ? await claimOnlineRoomForPlayer({ key: playerActiveRoomKey(actorId), targetCode: createdRoom.code, currentRoom: activeRoom, gameId: "tahoiya", conflictError: "TAHOIYA_PLAYER_ALREADY_ACTIVE" })
    : "already-claimed";
  try {
    await createIndexedOnlineRoom(createdRoom, { roomKey, roomIndexKey, activeRoomKeys: (room) => room.players.filter((player) => !isOnlineRoomDebugPlayer(player)).map((player) => playerActiveRoomKey(player.id)), conflictError: "TAHOIYA_ROOM_CONFLICT" });
    return createdRoom;
  } catch (error) {
    if (actorId && claim === "claimed") await releasePlayerActiveRoom(playerActiveRoomKey(actorId), createdRoom.code);
    throw error;
  }
}

export async function joinStoredTahoiyaRoom(code: string, player: TahoiyaPlayer, passphrase: string) {
  const normalizedCode = code.trim().toUpperCase();
  const activeRoom = await loadStoredTahoiyaPlayerActiveRoom(player.id);
  const claim = await claimOnlineRoomForPlayer({ key: playerActiveRoomKey(player.id), targetCode: normalizedCode, currentRoom: activeRoom, gameId: "tahoiya", conflictError: "TAHOIYA_PLAYER_ALREADY_ACTIVE" });
  try {
    const joined = await mutateStoredTahoiyaRoom(normalizedCode, (current) => {
      if (current.phase !== "lobby") throw new Error("TAHOIYA_ROOM_STARTED");
      if (isTahoiyaTopicGenerationProgressFresh(current.topicGenerationProgress)) throw new Error("TAHOIYA_TOPIC_GENERATION_IN_PROGRESS");
      if (current.passphrase && current.passphrase !== passphrase.trim()) throw new Error("TAHOIYA_BAD_PASSPHRASE");
      if (current.players.some((item) => item.id === player.id)) {
        return { ...current, lobbyReturn: confirmRoomLobbyReturn(current.lobbyReturn, current.players, player.id) };
      }
      if (current.players.length >= onlineRoomPlayerLimits.tahoiya) throw new Error("TAHOIYA_ROOM_FULL");
      const players = [...current.players, player];
      return { ...current, players, lobbyReturn: confirmRoomLobbyReturn(current.lobbyReturn, players, player.id) };
    });
    return joined;
  } catch (error) {
    if (claim === "claimed") await releasePlayerActiveRoom(playerActiveRoomKey(player.id), normalizedCode);
    throw error;
  }
}

export async function beginStoredTahoiyaTopicGeneration(code: string, actorId: string) {
  const generationId = randomUUID();
  const room = await mutateStoredTahoiyaRoom(code, (current) => {
    if (current.hostId !== actorId || current.phase !== "lobby") throw new Error("TAHOIYA_ROOM_FORBIDDEN");
    if (!allRoomPlayersReturned(current.lobbyReturn, current.players)) throw new Error("TAHOIYA_PLAYERS_NOT_RETURNED");
    if (isTahoiyaTopicGenerationProgressFresh(current.topicGenerationProgress)) throw new Error("TAHOIYA_TOPIC_GENERATION_IN_PROGRESS");
    const now = Date.now();
    return {
      ...current,
      topicGenerationProgress: {
        id: generationId,
        stage: "checking-reusable",
        startedAt: now,
        updatedAt: now,
      },
    };
  });
  return { room, generationId };
}

export async function updateStoredTahoiyaTopicGeneration(
  code: string,
  generationId: string,
  progress: { stage: TahoiyaTopicGenerationStage; batchNumber?: number; batchLimit?: number; newCandidateFlow?: boolean },
) {
  return mutateStoredTahoiyaRoom(code, (current) => {
    if (current.phase !== "lobby" || current.topicGenerationProgress?.id !== generationId) return current;
    return {
      ...current,
      topicGenerationProgress: {
        ...current.topicGenerationProgress,
        ...progress,
        updatedAt: Date.now(),
      },
    };
  });
}

export async function clearStoredTahoiyaTopicGeneration(code: string, generationId: string) {
  return mutateStoredTahoiyaRoom(code, (current) => (
    current.topicGenerationProgress?.id === generationId
      ? { ...current, topicGenerationProgress: undefined }
      : current
  ));
}

export async function startStoredTahoiyaRound(code: string, actorId: string, topic: TahoiyaTopic, generationId?: string) {
  return mutateStoredTahoiyaRoom(code, (current) => {
    if (current.hostId !== actorId || current.phase !== "lobby") throw new Error("TAHOIYA_ROOM_FORBIDDEN");
    if (generationId && current.topicGenerationProgress?.id !== generationId) throw new Error("TAHOIYA_TOPIC_GENERATION_IN_PROGRESS");
    if (!allRoomPlayersReturned(current.lobbyReturn, current.players)) throw new Error("TAHOIYA_PLAYERS_NOT_RETURNED");
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
    const now = Date.now();
    return {
      ...current,
      players,
      lobbyReturn: undefined,
      answererId,
      phase: "writing",
      phaseStartedAt: now,
      gameStartedAt: now,
      word: topic.word,
      reading: topic.reading,
      realDefinition: topic.realDefinition,
      topicNote: topic.note,
      topicSourceDetail: topic.sourceDetail,
      topicSource: topic.source,
      topicGeneration: topic.generation,
      topicGenerationProgress: undefined,
      fakeDefinitions: {},
      options: [],
      votes: {},
      resultText: "",
    };
  });
}

export async function applyStoredTahoiyaRoomAction(code: string, action: TahoiyaRoomAction) {
  const removedDebugPlayerIds = new Set<string>();
  const room = await mutateStoredTahoiyaRoom(code, (current) => {
    const actorIsHost = action.actorId === current.hostId;
    const actorIsMember = current.players.some((player) => player.id === action.actorId);
    if (!actorIsMember) throw new Error("TAHOIYA_ROOM_FORBIDDEN");
    if (action.type === "recover-player") {
      return recoverPlayerTimeout(current, action.actorId, current.players.find((player) => player.id === action.actorId)?.name ?? "プレイヤー") ?? current;
    }
    if (action.type === "confirm-lobby-return") {
      if (current.phase !== "lobby" || !current.lobbyReturn) return current;
      return { ...current, lobbyReturn: confirmRoomLobbyReturn(current.lobbyReturn, current.players, action.actorId) };
    }
    if (action.type === "remove-waiting-player") {
      if (!actorIsHost || current.phase !== "lobby" || !canRemoveWaitingRoomPlayer(current.lobbyReturn, current.players, current.hostId, action.targetPlayerId)) throw new Error("TAHOIYA_ROOM_FORBIDDEN");
      const players = current.players.filter((player) => player.id !== action.targetPlayerId);
      return { ...current, players, answererId: current.answererId === action.targetPlayerId ? "" : current.answererId };
    }
    if (action.type === "abort-game") {
      if (!actorIsHost || !current.debugMode || current.phase === "lobby") throw new Error("TAHOIYA_ROOM_FORBIDDEN");
      const answererId = current.playMode === "single-answerer" && current.answererMode === "manual" ? current.answererId : "";
      return { ...current, phase: "lobby", gameStartedAt: null, debugReplayEnabled: false, lobbyReturn: beginRoomLobbyReturn(current.players, action.actorId, "debug-abort", current.round), phaseStartedAt: null, answererId, word: "", reading: "", realDefinition: "", topicNote: "", topicSourceDetail: "", topicSource: "pending", topicGeneration: undefined, topicGenerationProgress: undefined, fakeDefinitions: {}, options: [], votes: {}, resultText: "" };
    }
    if (action.type === "update-config") {
      if (!actorIsHost || current.phase !== "lobby") throw new Error("TAHOIYA_ROOM_FORBIDDEN");
      if (isTahoiyaTopicGenerationProgressFresh(current.topicGenerationProgress)) throw new Error("TAHOIYA_TOPIC_GENERATION_IN_PROGRESS");
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
        fakeDefinitionsPerPlayer: action.config.fakeDefinitionsPerPlayer === undefined
          ? current.fakeDefinitionsPerPlayer
          : normalizeTahoiyaFakeDefinitionsPerPlayer(action.config.fakeDefinitionsPerPlayer),
        actionTimeLimitSeconds: action.config.actionTimeLimitSeconds === undefined ? current.actionTimeLimitSeconds : normalizeCommonTimeLimit(action.config.actionTimeLimitSeconds),
      };
    }
    if (action.type === "set-debug") {
      if (!actorIsHost || current.phase !== "lobby") throw new Error("TAHOIYA_ROOM_FORBIDDEN");
      if (isTahoiyaTopicGenerationProgressFresh(current.topicGenerationProgress)) throw new Error("TAHOIYA_TOPIC_GENERATION_IN_PROGRESS");
      if (action.enabled) return { ...current, debugMode: true };
      for (const player of current.players) {
        if (isOnlineRoomDebugPlayer(player)) removedDebugPlayerIds.add(player.id);
      }
      return {
        ...removeTahoiyaDebugParticipants(current),
        debugMode: false,
        debugReplayEnabled: false,
      };
    }
    if (action.type === "set-debug-replay") {
      if (!actorIsHost || !current.debugMode) throw new Error("TAHOIYA_ROOM_FORBIDDEN");
      return { ...current, debugReplayEnabled: action.enabled };
    }
    if (action.type === "debug-add-player") {
      if (!actorIsHost || !current.debugMode || current.phase !== "lobby" || current.players.length >= onlineRoomPlayerLimits.tahoiya) throw new Error("TAHOIYA_ROOM_FORBIDDEN");
      if (isTahoiyaTopicGenerationProgressFresh(current.topicGenerationProgress)) throw new Error("TAHOIYA_TOPIC_GENERATION_IN_PROGRESS");
      const player = { id: `dummy-${randomUUID()}`, name: nextTahoiyaDebugPlayerName(current.players), joinedAt: Date.now() };
      const players = [...current.players, player];
      return { ...current, players, lobbyReturn: confirmRoomLobbyReturn(current.lobbyReturn, players, player.id) };
    }
    if (action.type === "debug-remove-player") {
      if (!canRemoveOnlineRoomDebugPlayer({
        actorId: action.actorId,
        debugMode: current.debugMode === true,
        hostId: current.hostId,
        phase: current.phase,
        players: current.players,
        targetPlayerId: action.targetPlayerId,
      })) throw new Error("TAHOIYA_ROOM_FORBIDDEN");
      removedDebugPlayerIds.add(action.targetPlayerId);
      return removeTahoiyaDebugParticipants(current, action.targetPlayerId);
    }
    if (action.type === "next-round") {
      if (!actorIsHost || current.phase !== "result") throw new Error("TAHOIYA_ROOM_FORBIDDEN");
      const answererId = current.playMode === "single-answerer" && current.answererMode === "manual" ? current.answererId : "";
      return { ...current, phase: "lobby", gameStartedAt: null, debugReplayEnabled: false, lobbyReturn: beginRoomLobbyReturn(current.players, action.actorId, "round-result", current.round), answererId, round: current.round + 1, word: "", reading: "", realDefinition: "", topicNote: "", topicSourceDetail: "", topicSource: "pending", topicGeneration: undefined, topicGenerationProgress: undefined, phaseStartedAt: null, fakeDefinitions: {}, options: [], votes: {}, resultText: "" };
    }
    if (action.type === "debug-replace-topic") {
      if (!actorIsHost || !current.debugMode || current.phase === "lobby" || action.round !== current.round + 1 || !action.topic.word.trim() || !action.topic.realDefinition.trim()) throw new Error("TAHOIYA_ROOM_FORBIDDEN");
      const answererId = current.playMode === "all-vote"
        ? ""
        : current.answererMode === "random"
          ? current.players[Math.floor(Math.random() * current.players.length)]?.id ?? ""
          : current.answererId;
      const now = Date.now();
      return { ...current, phase: "writing", lobbyReturn: undefined, phaseStartedAt: now, gameStartedAt: now, answererId, round: action.round, word: action.topic.word, reading: action.topic.reading, realDefinition: action.topic.realDefinition, topicNote: action.topic.note, topicSourceDetail: action.topic.sourceDetail, topicSource: action.topic.source, topicGeneration: action.topic.generation, topicGenerationProgress: undefined, fakeDefinitions: {}, options: [], votes: {}, resultText: "" };
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
      const definitionIndex = action.definitionIndex === undefined
        ? 0
        : Number.isInteger(action.definitionIndex) ? action.definitionIndex : -1;
      if (definitionIndex < 0 || definitionIndex >= current.fakeDefinitionsPerPlayer) return current;
      const definitions = Array.from(
        { length: current.fakeDefinitionsPerPlayer },
        (_, index) => current.fakeDefinitions[action.playerId]?.[index] ?? "",
      );
      definitions[definitionIndex] = text;
      return reconcileProgress(recordPlayerActivity({
        ...current,
        fakeDefinitions: { ...current.fakeDefinitions, [action.playerId]: definitions },
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
      if (action.target === "voting" && canAdvanceTahoiyaPhase(current, "voting", action.force)) {
        return advanceToVoting(current);
      }
      if (action.target === "result" && canAdvanceTahoiyaPhase(current, "result", action.force)) {
        return scoreRoom(current);
      }
      return current;
    }

    if (!actorIsHost || !current.debugMode) throw new Error("TAHOIYA_ROOM_FORBIDDEN");
    if (action.type === "debug-fill-definitions" && current.phase === "writing") {
      const fakeDefinitions = { ...current.fakeDefinitions };
      for (const playerId of definitionWriterIds(current)) {
        fakeDefinitions[playerId] = Array.from(
          { length: current.fakeDefinitionsPerPlayer },
          (_, index) => fakeDefinitions[playerId]?.[index] || `特定の作業に使われる古い道具の一種${current.fakeDefinitionsPerPlayer > 1 ? `（${index + 1}）` : ""}。`,
        );
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
  if (action.type === "remove-waiting-player" && !room.players.some((player) => player.id === action.targetPlayerId)) {
    await releasePlayerActiveRoom(playerActiveRoomKey(action.targetPlayerId), room.code);
  }
  if (removedDebugPlayerIds.size > 0) {
    await Promise.all(
      [...removedDebugPlayerIds].map((playerId) => (
        releasePlayerActiveRoom(playerActiveRoomKey(playerId), room.code)
      )),
    );
  }
  return room;
}

export async function deleteStoredTahoiyaRoom(code: string, actorId = "") {
  const normalizedCode = code.trim().toUpperCase();
  const room = await loadStoredTahoiyaRoom(normalizedCode);
  if (room && actorId && actorId !== room.hostId) throw new Error("TAHOIYA_ROOM_FORBIDDEN");
  if (room && !canDissolveOnlineRoom("tahoiya", room)) throw new Error("TAHOIYA_ROOM_IN_PROGRESS");
  await deleteTahoiyaRoomStorage(normalizedCode, room?.players.map((player) => player.id) ?? []);
}

export async function listStoredTahoiyaRooms() {
  const codes = await redisCommand<string[]>(["SMEMBERS", roomIndexKey]);
  const rooms = await Promise.all(codes.map((code) => loadStoredTahoiyaRoom(code)));
  const missingCodes = codes.filter((_, index) => !rooms[index]);
  if (missingCodes.length > 0) await redisCommand<number>(["SREM", roomIndexKey, ...missingCodes]);
  return rooms.filter((room): room is TahoiyaRoom => Boolean(room));
}

export async function listStoredJoinableTahoiyaRooms(cursor?: unknown) {
  const page = await loadIndexedOnlineRoomPage(cursor, { indexKey: roomIndexKey, roomKey, parseRoom: parseStoredTahoiyaRoom, loadRoom: loadStoredTahoiyaRoom });
  const rooms = page.rooms
    .filter((room): room is TahoiyaRoom => Boolean(room && !isMultiplayerRoomExpired(room.updatedAt)))
    .filter((room) => room.phase === "lobby" && room.players.length < onlineRoomPlayerLimits.tahoiya)
    .map(tahoiyaRoomChoice)
    .sort((left, right) => right.updatedAt - left.updatedAt);
  return { rooms, nextCursor: page.nextCursor };
}

export async function deleteStoredHostedTahoiyaRooms(authenticatedHostId: string) {
  const activeRoom = await loadStoredTahoiyaPlayerActiveRoom(authenticatedHostId);
  if (activeRoom?.hostId === authenticatedHostId) {
    if (!canDissolveOnlineRoom("tahoiya", activeRoom)) throw new Error("TAHOIYA_ROOM_IN_PROGRESS");
    await deleteTahoiyaRoomStorage(activeRoom.code, activeRoom.players.map((player) => player.id));
    return 1;
  }

  const rooms = await listStoredTahoiyaRooms();
  const hostedRooms = rooms.filter((room) => room.hostId === authenticatedHostId);
  if (hostedRooms.some((room) => !canDissolveOnlineRoom("tahoiya", room))) throw new Error("TAHOIYA_ROOM_IN_PROGRESS");
  const deletions = rooms
    .filter((room) => room.hostId === authenticatedHostId)
    .map((room) => deleteStoredTahoiyaRoom(room.code));

  await Promise.all(deletions);
  return deletions.length;
}

import { randomUUID } from "node:crypto";
import type { TahoiyaPlayer, TahoiyaRoom, TahoiyaRoomAction, TahoiyaTopic, TahoiyaTopicGenerationStage } from "@/lib/tahoiya-types";
import { tahoiyaRuntimeScoring } from "@/lib/tahoiya-scoring";
import { recordTahoiyaRoundResults } from "@/lib/player-stats-store";
import { recordTahoiyaReplay } from "@/lib/game-replay-store";
import { recordTahoiyaDecoyCandidates } from "@/lib/tahoiya-decoy-candidate-store";
import { normalizeCommonTimeLimit } from "@/lib/game-room-config";
import { allRoomPlayersReturned, beginRoomLobbyReturn, canRemoveWaitingRoomPlayer, confirmRoomLobbyReturn } from "@/lib/room-lobby-return";
import { onlineRoomPlayerLimits } from "@/lib/online-room-policy";
import { createPlatformOnlineRoomStoreRuntime } from "@/lib/online-room-store-runtime";
import { schedulePostResponseWork } from "@/lib/post-response-work";
import { normalizeTahoiyaRoom } from "@/lib/tahoiya-room-normalizer";
import { sanitizeTahoiyaRoom, tahoiyaRoomChoice } from "@/lib/tahoiya-room-presentation";
import { advanceToVoting, canAdvanceTahoiyaPhase, definitionWriterIds, reconcileProgress, scoreRoom, voterIds } from "@/lib/tahoiya-room-domain";
import { recordPlayerActivity, recoverPlayerTimeout } from "@/lib/player-timeout-policy";
import { isTahoiyaTopicGenerationProgressFresh } from "@/lib/tahoiya-topic-generation-progress";
import { normalizeTahoiyaFakeDefinitionsPerPlayer } from "@/lib/tahoiya-definitions";
import {
  applyOnlineRoomDebugParticipantCommand,
} from "@/lib/online-room-debug-participants";
import { nextTahoiyaDebugPlayerName, withTahoiyaDebugParticipants } from "@/lib/tahoiya-debug-participants";

export { sanitizeTahoiyaRoom };

const roomRuntime = createPlatformOnlineRoomStoreRuntime({
  gameId: "tahoiya",
  normalize: normalizeTahoiyaRoom,
  isJoinable: (room) => (
    room.phase === "lobby"
    && room.players.length < onlineRoomPlayerLimits.tahoiya
  ),
  toChoice: tahoiyaRoomChoice,
  errors: {
    notFound: "TAHOIYA_ROOM_NOT_FOUND",
    invalid: "INVALID_TAHOIYA_ROOM",
    conflict: "TAHOIYA_ROOM_CONFLICT",
    playerActive: "TAHOIYA_PLAYER_ALREADY_ACTIVE",
    forbidden: "TAHOIYA_ROOM_FORBIDDEN",
    inProgress: "TAHOIYA_ROOM_IN_PROGRESS",
  },
  afterSave: (room) => Promise.all([
    recordTahoiyaRoundResults(room),
    recordTahoiyaReplay(room),
    recordTahoiyaDecoyCandidates(room),
  ]),
});

async function mutateStoredTahoiyaRoom(
  code: string,
  mutate: (room: TahoiyaRoom) => TahoiyaRoom,
) {
  return roomRuntime.mutate(code, mutate);
}

export async function loadStoredTahoiyaRoom(code: string) {
  return roomRuntime.load(code);
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
  return roomRuntime.loadActive(playerId, loadAndReconcileStoredTahoiyaRoom);
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
  return roomRuntime.create(
    createdRoom,
    actorId,
    loadAndReconcileStoredTahoiyaRoom,
  );
}

export async function joinStoredTahoiyaRoom(code: string, player: TahoiyaPlayer, passphrase: string) {
  const normalizedCode = code.trim().toUpperCase();
  const claim = await roomRuntime.claim(
    player.id,
    normalizedCode,
    loadAndReconcileStoredTahoiyaRoom,
  );
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
    if (claim === "claimed") {
      await roomRuntime.release(player.id, normalizedCode);
    }
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
    if (action.type === "set-debug"
      || action.type === "debug-add-player"
      || action.type === "debug-remove-player") {
      const result = applyOnlineRoomDebugParticipantCommand(
        current,
        action.actorId,
        action,
        {
          forbiddenError: "TAHOIYA_ROOM_FORBIDDEN",
          assertCanAdd: (room) => {
            if (room.players.length >= onlineRoomPlayerLimits.tahoiya) {
              throw new Error("TAHOIYA_ROOM_FORBIDDEN");
            }
          },
          beforeCommand: (room, command) => {
            if ((command.type === "set-debug"
              || command.type === "debug-add-player")
              && isTahoiyaTopicGenerationProgressFresh(
                room.topicGenerationProgress,
              )) {
              throw new Error("TAHOIYA_TOPIC_GENERATION_IN_PROGRESS");
            }
          },
          createPlayer: (seed, room) => ({
            id: seed.id,
            name: nextTahoiyaDebugPlayerName(room.players),
            joinedAt: seed.joinedAt,
          }),
          afterParticipantsChanged: (room, change) => (
            withTahoiyaDebugParticipants(room, change.players)
          ),
        },
      );
      result.removedPlayerIds.forEach((playerId) => (
        removedDebugPlayerIds.add(playerId)
      ));
      return result.room;
    }
    if (action.type === "set-debug-replay") {
      if (!actorIsHost || !current.debugMode) throw new Error("TAHOIYA_ROOM_FORBIDDEN");
      return { ...current, debugReplayEnabled: action.enabled };
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
    await roomRuntime.release(action.targetPlayerId, room.code);
  }
  if (removedDebugPlayerIds.size > 0) {
    await roomRuntime.releaseMany(
      removedDebugPlayerIds,
      room.code,
    );
  }
  return room;
}

export async function deleteStoredTahoiyaRoom(code: string, actorId = "") {
  if (actorId) {
    await roomRuntime.dissolve(code, actorId);
    return;
  }
  const room = await loadStoredTahoiyaRoom(code);
  if (room) await roomRuntime.dissolve(code, room.hostId);
}

export async function listStoredTahoiyaRooms() {
  return roomRuntime.listAll();
}

export async function listStoredJoinableTahoiyaRooms(cursor?: unknown) {
  return roomRuntime.list(cursor);
}

export async function deleteStoredHostedTahoiyaRooms(authenticatedHostId: string) {
  return roomRuntime.dissolveHosted(authenticatedHostId);
}

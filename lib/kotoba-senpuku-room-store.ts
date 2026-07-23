import {
  isValidKotobaSenpukuWord,
  kotobaSenpukuKana,
  kotobaSenpukuKanaKey,
  minimumKotobaSenpukuWordLength,
  normalizeKotobaSenpukuConfig,
  normalizeKotobaSenpukuWord,
  type KotobaSenpukuRoom,
  type KotobaSenpukuRoomAction,
} from "@/lib/kotoba-senpuku";
import { recordKotobaSenpukuGameResults } from "@/lib/player-stats-store";
import { recordKotobaSenpukuReplay } from "@/lib/game-replay-store";
import { recordPlayerActivity, recoverPlayerTimeout } from "@/lib/player-timeout-policy";
import type { ActiveRoomClaim } from "@/lib/player-active-room";
import { onlineRoomPlayerLimits } from "@/lib/online-room-policy";
import { canLeaveOnlineRoomLobby, onlineRoomActorAccess } from "@/lib/online-room-access";
import {
  applyOnlineRoomDebugParticipantCommand,
} from "@/lib/online-room-debug-participants";
import { createPlatformOnlineRoomStoreRuntime } from "@/lib/online-room-store-runtime";
import { schedulePostResponseWork } from "@/lib/post-response-work";
import { allRoomPlayersReturned, beginRoomLobbyReturn, canRemoveWaitingRoomPlayer, confirmRoomLobbyReturn } from "@/lib/room-lobby-return";
import { addLog, beginBattle, beginRound, fillMissingSecrets, finishRound, performChallenge, performScan, reconcileProgress } from "@/lib/kotoba-senpuku-room-domain";
import { normalizeKotobaSenpukuRoom } from "@/lib/kotoba-senpuku-room-normalizer";
import { kotobaSenpukuRoomChoice, sanitizeKotobaSenpukuRoom } from "@/lib/kotoba-senpuku-room-presentation";

export { sanitizeKotobaSenpukuRoom };

const roomRuntime = createPlatformOnlineRoomStoreRuntime({
  gameId: "kotoba-senpuku",
  normalize: normalizeKotobaSenpukuRoom,
  isJoinable: (room) => (
    room.phase === "lobby"
    && room.players.length < onlineRoomPlayerLimits.kotobaSenpuku
  ),
  toChoice: kotobaSenpukuRoomChoice,
  errors: {
    notFound: "KOTOBA_SENPUKU_ROOM_NOT_FOUND",
    invalid: "INVALID_KOTOBA_SENPUKU_ROOM",
    conflict: "KOTOBA_SENPUKU_ROOM_CONFLICT",
    playerActive: "KOTOBA_SENPUKU_PLAYER_ALREADY_ACTIVE",
    forbidden: "KOTOBA_SENPUKU_ROOM_FORBIDDEN",
    inProgress: "KOTOBA_SENPUKU_ROOM_IN_PROGRESS",
  },
  afterSave: (room) => Promise.all([
    recordKotobaSenpukuGameResults(room),
    recordKotobaSenpukuReplay(room),
  ]),
});

async function mutateStoredRoom(
  code: string,
  mutate: (room: KotobaSenpukuRoom) => KotobaSenpukuRoom,
) {
  return roomRuntime.mutate(code, mutate);
}

export async function loadStoredKotobaSenpukuRoom(code: string) {
  return roomRuntime.load(code);
}

export async function loadAndReconcileKotobaSenpukuRoom(code: string) {
  const room = await loadStoredKotobaSenpukuRoom(code);
  if (!room) return null;
  if (reconcileProgress(room) === room) {
    await schedulePostResponseWork("kotoba-senpuku-result-persistence", () => Promise.all([recordKotobaSenpukuGameResults(room), recordKotobaSenpukuReplay(room)]));
    return room;
  }
  return mutateStoredRoom(code, reconcileProgress);
}

export async function loadKotobaSenpukuPlayerActiveRoom(playerId: string) {
  return roomRuntime.loadActive(playerId, loadAndReconcileKotobaSenpukuRoom);
}

export async function createStoredKotobaSenpukuRoom(value: unknown, actorId: string) {
  const room = normalizeKotobaSenpukuRoom(value);
  if (!room || actorId !== room.hostId) throw new Error("INVALID_KOTOBA_SENPUKU_ROOM");
  const created = { ...room, revision: 0, gameNumber: 1, phase: "lobby" as const, debugMode: false, debugReplayEnabled: false, theme: null, secrets: {}, submittedIds: [], masks: {}, calledKana: [], exposedIds: [], roundEvents: [], history: [], log: ["参加者を待っています。"], phaseStartedAt: null, updatedAt: Date.now() };
  return roomRuntime.create(
    created,
    actorId,
    loadAndReconcileKotobaSenpukuRoom,
  );
}

export async function applyStoredKotobaSenpukuAction(code: string, action: KotobaSenpukuRoomAction) {
  let claim: ActiveRoomClaim | null = null;
  const removedDebugPlayerIds = new Set<string>();
  if (action.type === "join-room") {
    claim = await roomRuntime.claim(
      action.actorId,
      code,
      loadAndReconcileKotobaSenpukuRoom,
    );
  }
  const room = await mutateStoredRoom(code, (current) => {
    if (action.type === "join-room") {
      if (current.phase !== "lobby" || action.actorId !== action.player.id) throw new Error("KOTOBA_SENPUKU_ROOM_FORBIDDEN");
      if (current.passphrase && current.passphrase !== action.passphrase.trim()) throw new Error("KOTOBA_SENPUKU_BAD_PASSPHRASE");
      if (current.players.some((player) => player.id === action.actorId)) return { ...current, lobbyReturn: confirmRoomLobbyReturn(current.lobbyReturn, current.players, action.actorId) };
      if (current.players.length >= onlineRoomPlayerLimits.kotobaSenpuku) throw new Error("KOTOBA_SENPUKU_ROOM_FULL");
      const players = [...current.players, action.player];
      return addLog({ ...current, players, lobbyReturn: confirmRoomLobbyReturn(current.lobbyReturn, players, action.actorId) }, `${action.player.name}さんが参加しました。`);
    }

    const { isHost: actorIsHost, isMember: actorIsMember } = onlineRoomActorAccess(current.hostId, current.players, action.actorId, { excludeDummy: true });
    if (!actorIsMember) throw new Error("KOTOBA_SENPUKU_ROOM_FORBIDDEN");
    if (action.type === "confirm-lobby-return") {
      if (current.phase !== "lobby" || !current.lobbyReturn) return current;
      return { ...current, lobbyReturn: confirmRoomLobbyReturn(current.lobbyReturn, current.players, action.actorId) };
    }
    if (action.type === "remove-waiting-player") {
      if (!actorIsHost || current.phase !== "lobby" || !canRemoveWaitingRoomPlayer(current.lobbyReturn, current.players, current.hostId, action.targetPlayerId)) throw new Error("KOTOBA_SENPUKU_ROOM_FORBIDDEN");
      return { ...current, players: current.players.filter((player) => player.id !== action.targetPlayerId) };
    }
    if (action.type === "recover-player") {
      return recoverPlayerTimeout(current, action.actorId, current.players.find((player) => player.id === action.actorId)?.name ?? "プレイヤー") ?? current;
    }
    if (action.type === "abort-game") {
      if (!actorIsHost || !current.debugMode || current.phase === "lobby") throw new Error("KOTOBA_SENPUKU_ROOM_FORBIDDEN");
      return { ...current, phase: "lobby", lobbyReturn: beginRoomLobbyReturn(current.players, action.actorId, "debug-abort", current.gameNumber), gameStartedAt: null, round: 1, debugReplayEnabled: false, theme: null, secrets: {}, submittedIds: [], masks: {}, calledKana: [], exposedIds: [], roundEvents: [], roundSignals: {}, totalScores: {}, activePlayerIndex: 0, turnNumber: 1, history: [], log: ["ゲームを中断し、ゲーム開始前へ戻りました。"], phaseStartedAt: null };
    }

    const reconciled = reconcileProgress(current);
    if (reconciled !== current) return reconciled;

    if (action.type === "leave-room") {
      if (!canLeaveOnlineRoomLobby({ isHost: actorIsHost, isMember: actorIsMember }, current.phase)) throw new Error("KOTOBA_SENPUKU_ROOM_FORBIDDEN");
      return { ...current, players: current.players.filter((player) => player.id !== action.actorId) };
    }
    if (action.type === "update-config") {
      if (!actorIsHost || current.phase !== "lobby") throw new Error("KOTOBA_SENPUKU_ROOM_FORBIDDEN");
      return { ...current, ...normalizeKotobaSenpukuConfig({ ...action.config, debugMode: current.debugMode }) };
    }
    if (action.type === "set-debug"
      || action.type === "debug-add-player"
      || action.type === "debug-remove-player") {
      const result = applyOnlineRoomDebugParticipantCommand(
        current,
        action.actorId,
        action,
        {
          forbiddenError: "KOTOBA_SENPUKU_ROOM_FORBIDDEN",
          assertCanAdd: (room) => {
            if (room.players.length >= onlineRoomPlayerLimits.kotobaSenpuku) {
              throw new Error("KOTOBA_SENPUKU_ROOM_FULL");
            }
          },
          createPlayer: (seed) => {
            const colors = ["#38bdf8", "#a78bfa", "#f472b6", "#f59e0b", "#84cc16", "#14b8a6", "#fb7185"];
            return {
              id: seed.id,
              name: seed.name,
              joinedAt: seed.joinedAt,
              avatarColor: colors[seed.debugParticipantIndex % colors.length],
              isDummy: true,
            };
          },
        },
      );
      result.removedPlayerIds.forEach((playerId) => (
        removedDebugPlayerIds.add(playerId)
      ));
      return result.room;
    }
    if (action.type === "set-debug-replay") {
      if (!actorIsHost || !current.debugMode) throw new Error("KOTOBA_SENPUKU_ROOM_FORBIDDEN");
      return { ...current, debugReplayEnabled: action.enabled };
    }
    if (action.type === "start-game") {
      if (!actorIsHost || current.phase !== "lobby") throw new Error("KOTOBA_SENPUKU_ROOM_FORBIDDEN");
      if (!allRoomPlayersReturned(current.lobbyReturn, current.players)) throw new Error("KOTOBA_SENPUKU_PLAYERS_NOT_RETURNED");
      if (current.players.length < 2) throw new Error("KOTOBA_SENPUKU_NOT_ENOUGH_PLAYERS");
      return beginRound({ ...current, lobbyReturn: undefined, gameStartedAt: Date.now(), round: 1, history: [], totalScores: Object.fromEntries(current.players.map((player) => [player.id, 0])) }, 1);
    }
    if (action.type === "submit-secret") {
      if (current.phase !== "secret" || action.round !== current.round || current.secrets[action.actorId]) return current;
      const word = normalizeKotobaSenpukuWord(action.word);
      if (!isValidKotobaSenpukuWord(word)) throw new Error("KOTOBA_SENPUKU_INVALID_WORD");
      if ([...word].length < minimumKotobaSenpukuWordLength(current.players.length)) throw new Error("KOTOBA_SENPUKU_WORD_TOO_SHORT");
      return reconcileProgress(recordPlayerActivity({ ...current, secrets: { ...current.secrets, [action.actorId]: word }, submittedIds: [...new Set([...current.submittedIds, action.actorId])] }, action.actorId));
    }
    if (action.type === "debug-fill-secrets") {
      if (!actorIsHost || !current.debugMode || current.phase !== "secret" || action.round !== current.round) throw new Error("KOTOBA_SENPUKU_ROOM_FORBIDDEN");
      return beginBattle(fillMissingSecrets(current));
    }
    if (action.type === "next-round") {
      if (!actorIsHost || current.phase !== "result" || action.round !== current.round || current.round >= current.roundsTotal) throw new Error("KOTOBA_SENPUKU_ROOM_FORBIDDEN");
      return beginRound(current, current.round + 1);
    }
    if (action.type === "reset-game") {
      if (!actorIsHost || current.phase !== "result" || current.round < current.roundsTotal) throw new Error("KOTOBA_SENPUKU_ROOM_FORBIDDEN");
      return { ...current, gameNumber: current.gameNumber + 1, phase: "lobby", lobbyReturn: beginRoomLobbyReturn(current.players, action.actorId, "round-result", current.gameNumber), gameStartedAt: null, round: 1, debugReplayEnabled: false, theme: null, secrets: {}, submittedIds: [], masks: {}, calledKana: [], exposedIds: [], roundEvents: [], roundSignals: {}, totalScores: {}, activePlayerIndex: 0, turnNumber: 1, history: [], log: ["同じ部屋で次のゲームを準備できます。"], phaseStartedAt: null };
    }

    const activePlayer = current.players[current.activePlayerIndex];
    const canControlTurn = activePlayer?.id === action.actorId || (current.debugMode && actorIsHost);
    if (current.phase !== "battle" || action.round !== current.round || !canControlTurn) throw new Error("KOTOBA_SENPUKU_NOT_YOUR_TURN");
    if (action.type === "scan-kana") {
      if (!kotobaSenpukuKana.includes(action.kana as (typeof kotobaSenpukuKana)[number]) || current.calledKana.includes(action.kana)) throw new Error("KOTOBA_SENPUKU_INVALID_KANA");
      return performScan(recordPlayerActivity(current, activePlayer.id), action.kana);
    }
    if (action.type === "challenge-word") {
      if (!current.allowWordGuess) throw new Error("KOTOBA_SENPUKU_ROOM_FORBIDDEN");
      if (!isValidKotobaSenpukuWord(action.guess)) throw new Error("KOTOBA_SENPUKU_INVALID_WORD");
      const target = current.players.find((player) => player.id === action.targetId);
      if (!target || target.id === activePlayer.id || current.exposedIds.includes(target.id)) throw new Error("KOTOBA_SENPUKU_INVALID_TARGET");
      return performChallenge(recordPlayerActivity(current, activePlayer.id), target.id, action.guess);
    }
    if (action.type === "debug-auto-turn") {
      if (!actorIsHost || !current.debugMode) throw new Error("KOTOBA_SENPUKU_ROOM_FORBIDDEN");
      const candidate = current.players
        .filter((player) => player.id !== activePlayer.id && !current.exposedIds.includes(player.id))
        .flatMap((player) => [...(current.secrets[player.id] ?? "")].map(kotobaSenpukuKanaKey))
        .find((kana) => kotobaSenpukuKana.includes(kana as (typeof kotobaSenpukuKana)[number]) && !current.calledKana.includes(kana));
      const kana = candidate ?? kotobaSenpukuKana.find((item) => !current.calledKana.includes(item));
      return kana ? performScan(current, kana) : finishRound(current);
    }
    return current;
  }).catch(async (error) => {
    if (action.type === "join-room" && claim === "claimed") {
      await roomRuntime.release(action.actorId, code);
    }
    throw error;
  });
  if (action.type === "leave-room") {
    await roomRuntime.release(action.actorId, room.code);
  }
  if (action.type === "remove-waiting-player") {
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

export async function listJoinableKotobaSenpukuRooms(cursor?: unknown) {
  return roomRuntime.list(cursor);
}

export async function deleteStoredKotobaSenpukuRoom(code: string, actorId: string) {
  await roomRuntime.dissolve(code, actorId);
}

export async function deleteHostedKotobaSenpukuRooms(_ownerId: string, authenticatedHostId: string) {
  return roomRuntime.dissolveHosted(authenticatedHostId);
}

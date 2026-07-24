import {
  defineGameSdkOnlineRoomAppSet,
} from "@game-fields/game-sdk/runtime";
import {
  assertGameSdkCanStart,
  defineGameSdkStandardResult,
  gameSdkPlayerSeat,
} from "@game-fields/game-sdk/modules";
import type {
  MyFirstGameAppCommand,
  MyFirstGameAppInput,
  MyFirstGameAppState,
  MyFirstGameAppView,
  MyFirstGameSettings,
} from "./contracts.js";
import { myFirstGameManifest } from "./manifest.js";

export const myFirstGameAppSet = defineGameSdkOnlineRoomAppSet<
  MyFirstGameSettings,
  MyFirstGameAppState,
  MyFirstGameAppInput,
  MyFirstGameAppCommand,
  MyFirstGameAppView
>({
  manifest: myFirstGameManifest,
  defaultSettings: {
    target: 3,
    timeLimitSeconds: 60,
  },
  normalizeSettings(settings) {
    return {
      target: Number.isSafeInteger(settings.target)
        ? Math.min(10, Math.max(2, settings.target))
        : 3,
      timeLimitSeconds: Number.isSafeInteger(settings.timeLimitSeconds)
        ? Math.min(3600, Math.max(0, settings.timeLimitSeconds))
        : 60,
    };
  },
  timer: {
    durationSeconds(settings) {
      return settings.timeLimitSeconds;
    },
  },
  expireAppTurn(room) {
    const count = room.app.count + 1;
    return {
      phase: count >= room.settings.target ? "result" : "playing",
      app: {
        count,
        lastActorPlayerId: room.timer?.ownerPlayerId ?? room.hostPlayerId,
      },
      timer: count >= room.settings.target ? "stop" : "reset",
      timerOwnerPlayerId: room.hostPlayerId,
      timedOutPlayerIds: [
        room.timer?.ownerPlayerId ?? room.hostPlayerId,
      ],
    };
  },

  createAppState() {
    return {
      count: 0,
      lastActorPlayerId: null,
    };
  },

  resetAppState() {
    return {
      count: 0,
      lastActorPlayerId: null,
    };
  },

  applyAppCommand(room, command, context) {
    if (command.type === "game/start") {
      assertGameSdkCanStart({
        actorId: context.actor.playerId,
        hostId: room.hostPlayerId,
        phase: room.phase,
        participantCount: room.players.length,
        minimumPlayers: myFirstGameManifest.minimumPlayers,
        errors: { phase: "INVALID_PHASE" },
      });
      return {
        phase: "playing",
        app: room.app,
        timerOwnerPlayerId: room.hostPlayerId,
      };
    }
    if (room.phase !== "playing") throw new Error("INVALID_PHASE");
    const count = room.app.count + 1;
    return {
      phase: count >= room.settings.target ? "result" : "playing",
      app: {
        count,
        lastActorPlayerId: context.actor.playerId,
      },
      timer: count >= room.settings.target ? "stop" : "reset",
      timerOwnerPlayerId: room.hostPlayerId,
      ...(count >= room.settings.target ? {
        standardResult: defineGameSdkStandardResult({
          winnerIds: [context.actor.playerId],
          rankings: room.players.map((player) => ({
            participantId: player.id,
            rank: player.id === context.actor.playerId ? 1 : 2,
            score: player.id === context.actor.playerId ? count : 0,
          })),
          reason: "target-reached",
        }, {
          participantIds: room.players.map((player) => player.id),
        }),
      } : {}),
    };
  },

  presentApp(room, context) {
    const lastActorSeat = room.app.lastActorPlayerId
      ? gameSdkPlayerSeat(room.players, room.app.lastActorPlayerId)
      : null;
    return {
      view: {
        count: room.app.count,
        target: room.settings.target,
        lastActorSeat,
        canAdvance: (
          room.phase === "playing"
          && room.players.some((player) => player.id === context.viewer.playerId)
        ),
      },
    };
  },
});

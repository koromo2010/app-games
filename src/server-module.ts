import { advanceGameSdkRoom, defineGameServerModule } from "@game-fields/game-sdk/runtime";
import type {
  MyFirstGameCommand,
  MyFirstGameCreateInput,
  MyFirstGameRoom,
  MyFirstGameRoomView,
} from "./contracts.js";
import { myFirstGameManifest } from "./manifest.js";

export const myFirstGameServerModule = defineGameServerModule<
  MyFirstGameRoom,
  MyFirstGameCreateInput,
  MyFirstGameCommand,
  MyFirstGameRoomView
>({
  manifest: myFirstGameManifest,

  createRoom(input, context) {
    const target = Number.isSafeInteger(input.target)
      ? Math.min(10, Math.max(2, input.target))
      : 3;
    return {
      code: context.roomCode,
      revision: 1,
      phase: "lobby",
      hostPlayerId: context.actor.playerId,
      players: [{ id: context.actor.playerId, name: context.actor.displayName }],
      count: 0,
      target,
      lastActorPlayerId: null,
    };
  },

  applyCommand(room, command, context) {
    const actorIsMember = room.players.some((player) => player.id === context.actor.playerId);
    if (command.type === "join") {
      if (room.phase !== "lobby") throw new Error("INVALID_PHASE");
      if (actorIsMember) throw new Error("PLAYER_ALREADY_JOINED");
      if (room.players.length >= myFirstGameManifest.maximumPlayers) throw new Error("ROOM_FULL");
      return advanceGameSdkRoom(room, {
        players: [...room.players, { id: context.actor.playerId, name: context.actor.displayName }],
      });
    }
    if (!actorIsMember) throw new Error("MEMBER_REQUIRED");
    if (command.type === "start") {
      if (context.actor.playerId !== room.hostPlayerId) throw new Error("HOST_REQUIRED");
      if (room.phase !== "lobby") throw new Error("INVALID_PHASE");
      if (room.players.length < myFirstGameManifest.minimumPlayers) {
        throw new Error("NOT_ENOUGH_PLAYERS");
      }
      return advanceGameSdkRoom(room, { phase: "playing" });
    }
    if (room.phase !== "playing") throw new Error("INVALID_PHASE");
    const count = room.count + 1;
    return advanceGameSdkRoom(room, {
      count,
      phase: count >= room.target ? "result" : "playing",
      lastActorPlayerId: context.actor.playerId,
    });
  },

  presentRoom(room, context) {
    return {
      phase: room.phase,
      playerNames: room.players.map((player) => player.name),
      count: room.count,
      target: room.target,
      isHost: context.viewer.playerId === room.hostPlayerId,
      isMember: room.players.some((player) => player.id === context.viewer.playerId),
    };
  },
});

import {
  GAME_SDK_VERSION,
  defineGameManifest,
  type GameSdkStoredRoom,
} from "@game-fields/game-sdk";
import { advanceGameSdkRoom, defineGameServerModule } from "@game-fields/game-sdk/runtime";

export const sdkCountUpManifest = defineGameManifest({
  sdkVersion: GAME_SDK_VERSION,
  id: "sdk-count-up-proof",
  title: { ja: "SDKカウントアップ実証", en: "SDK Count-up Proof" },
  playMode: "online-room",
  minimumPlayers: 2,
  maximumPlayers: 4,
  supportsDebug: false,
  supportsSpectators: false,
  supportsReplay: false,
  supportsRating: false,
  usesLlm: false,
});

export type SdkCountUpRoom = GameSdkStoredRoom & {
  phase: "lobby" | "playing" | "result";
  hostPlayerId: string;
  players: Array<{ id: string; name: string }>;
  count: number;
  target: number;
  lastActorPlayerId: string | null;
};

export type SdkCountUpCreateInput = {
  target: number;
};

export type SdkCountUpCommand =
  | { type: "join" }
  | { type: "start" }
  | { type: "count-up" };

export type SdkCountUpRoomView = {
  phase: SdkCountUpRoom["phase"];
  playerNames: string[];
  count: number;
  target: number;
  isHost: boolean;
  isMember: boolean;
};

export const sdkCountUpServerModule = defineGameServerModule<
  SdkCountUpRoom,
  SdkCountUpCreateInput,
  SdkCountUpCommand,
  SdkCountUpRoomView
>({
  manifest: sdkCountUpManifest,

  createRoom(input, context) {
    const target = Number.isSafeInteger(input.target) ? Math.min(10, Math.max(2, input.target)) : 3;
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
      if (room.players.length >= sdkCountUpManifest.maximumPlayers) throw new Error("ROOM_FULL");
      return advanceGameSdkRoom(room, {
        players: [...room.players, { id: context.actor.playerId, name: context.actor.displayName }],
      });
    }
    if (!actorIsMember) throw new Error("MEMBER_REQUIRED");
    if (command.type === "start") {
      if (context.actor.role !== "host") throw new Error("HOST_REQUIRED");
      if (room.phase !== "lobby") throw new Error("INVALID_PHASE");
      if (room.players.length < sdkCountUpManifest.minimumPlayers) throw new Error("NOT_ENOUGH_PLAYERS");
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

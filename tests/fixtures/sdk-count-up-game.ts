import {
  GAME_SDK_VERSION,
  defineGameManifest,
  type GameSdkOnlineRoomState,
  type GameSdkRoomLifecycleCommand,
} from "@game-fields/game-sdk";
import {
  advanceGameSdkRoom,
  applyGameSdkRoomLifecycleCommand,
  defineGameServerModule,
} from "@game-fields/game-sdk/runtime";

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

type SdkCountUpSettings = Record<string, never>;

export type SdkCountUpRoom = GameSdkOnlineRoomState<SdkCountUpSettings> & {
  phase: "lobby" | "playing" | "result";
  count: number;
  target: number;
  lastActorPlayerId: string | null;
};

export type SdkCountUpCreateInput = {
  target: number;
};

export type SdkCountUpCommand =
  | GameSdkRoomLifecycleCommand<SdkCountUpSettings>
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
      players: [{
        id: context.actor.playerId,
        displayName: context.actor.displayName,
        joinedAt: context.now,
        connected: true,
      }],
      settings: {},
      count: 0,
      target,
      lastActorPlayerId: null,
    };
  },

  applyCommand(room, command, context) {
    const lifecycle = applyGameSdkRoomLifecycleCommand(room, command, context, {
      minimumPlayers: sdkCountUpManifest.minimumPlayers,
      maximumPlayers: sdkCountUpManifest.maximumPlayers,
      resetGame: () => ({
        count: 0,
        lastActorPlayerId: null,
      }),
    });
    if (lifecycle.handled) return lifecycle.room;
    const actorIsMember = room.players.some((player) => player.id === context.actor.playerId);
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
      playerNames: room.players.map((player) => player.displayName),
      count: room.count,
      target: room.target,
      isHost: context.viewer.playerId === room.hostPlayerId,
      isMember: room.players.some((player) => player.id === context.viewer.playerId),
    };
  },
});

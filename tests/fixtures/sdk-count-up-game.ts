import {
  GAME_SDK_VERSION,
  defineGameManifest,
} from "@game-fields/game-sdk";
import {
  createGameSdkOnlineRoomModule,
  defineGameSdkOnlineRoomAppSet,
  type GameSdkOnlineRoom,
  type GameSdkOnlineRoomCommand,
  type GameSdkOnlineRoomCreateInput,
  type GameSdkOnlineRoomView,
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
  settings: [{
    key: "target",
    label: { ja: "ゴール", en: "Target" },
    type: "number",
    defaultValue: 3,
    minimum: 2,
    maximum: 10,
  }, {
    key: "timeLimitSeconds",
    label: { ja: "1手の制限時間", en: "Turn time limit" },
    type: "select",
    defaultValue: 60,
    platformRole: "time-limit",
    options: [0, 30, 60, 90, 120],
  }],
});

type SdkCountUpSettings = {
  target: number;
  timeLimitSeconds: number;
};

type SdkCountUpAppState = {
  count: number;
  lastActorPlayerId: string | null;
};

type SdkCountUpAppInput = Record<string, never>;

type SdkCountUpAppCommand =
  | { type: "game/start" }
  | { type: "game/count-up" };

type SdkCountUpAppView = {
  count: number;
  target: number;
  lastActorSeat: number | null;
};

export type SdkCountUpRoom = GameSdkOnlineRoom<
  SdkCountUpSettings,
  SdkCountUpAppState
>;

export type SdkCountUpCreateInput = GameSdkOnlineRoomCreateInput<
  SdkCountUpSettings,
  SdkCountUpAppInput
>;

export type SdkCountUpCommand = GameSdkOnlineRoomCommand<
  SdkCountUpSettings,
  SdkCountUpAppCommand
>;

export type SdkCountUpRoomView = GameSdkOnlineRoomView<
  SdkCountUpSettings,
  SdkCountUpAppView
>;

export const sdkCountUpAppSet = defineGameSdkOnlineRoomAppSet<
  SdkCountUpSettings,
  SdkCountUpAppState,
  SdkCountUpAppInput,
  SdkCountUpAppCommand,
  SdkCountUpAppView
>({
  manifest: sdkCountUpManifest,
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
      if (context.actor.playerId !== room.hostPlayerId) throw new Error("HOST_REQUIRED");
      if (room.phase !== "lobby") throw new Error("INVALID_PHASE");
      if (room.players.length < sdkCountUpManifest.minimumPlayers) {
        throw new Error("NOT_ENOUGH_PLAYERS");
      }
      return {
        phase: "playing",
        app: room.app,
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
    };
  },
  presentApp(room) {
    return {
      view: {
        count: room.app.count,
        target: room.settings.target,
        lastActorSeat: room.app.lastActorPlayerId
          ? room.players.findIndex((player) => (
            player.id === room.app.lastActorPlayerId
          ))
          : null,
      },
    };
  },
});

export const sdkCountUpServerModule = createGameSdkOnlineRoomModule(
  sdkCountUpAppSet,
);

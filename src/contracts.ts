import type {
  GameSdkOnlineRoom,
  GameSdkOnlineRoomCommand,
  GameSdkOnlineRoomCreateInput,
  GameSdkOnlineRoomView,
} from "@game-fields/game-sdk/runtime";

/** Settings rendered and updated by the SDK basic set. */
export type MyFirstGameSettings = {
  target: number;
  timeLimitSeconds: number;
};

/** Only the input needed to initialize this game's AppSet. */
export type MyFirstGameAppInput = Record<string, never>;

/** Only state that belongs to this game. Room members and revision stay outside. */
export type MyFirstGameAppState = {
  count: number;
  lastActorPlayerId: string | null;
};

/** Only game-specific Commands. Use room/* Commands from the SDK for lifecycle. */
export type MyFirstGameAppCommand =
  | { type: "game/start" }
  | { type: "game/advance" };

export type MyFirstGameAppView = {
  count: number;
  target: number;
  lastActorSeat: number | null;
  canAdvance: boolean;
};

export type MyFirstGameRoom = GameSdkOnlineRoom<
  MyFirstGameSettings,
  MyFirstGameAppState
>;

export type MyFirstGameCreateInput = GameSdkOnlineRoomCreateInput<
  MyFirstGameSettings,
  MyFirstGameAppInput
>;

export type MyFirstGameCommand = GameSdkOnlineRoomCommand<
  MyFirstGameSettings,
  MyFirstGameAppCommand
>;

export type MyFirstGameRoomView = GameSdkOnlineRoomView<
  MyFirstGameSettings,
  MyFirstGameAppView
>;

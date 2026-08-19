import type {
  GameSdkOnlineRoom,
  GameSdkOnlineRoomCommand,
  GameSdkOnlineRoomCreateInput,
  GameSdkOnlineRoomView,
} from "@game-fields/game-sdk/runtime";

export type JankenChoice = "rock" | "paper" | "scissors";

export type JankenSettings = {
  timeLimitSeconds: number;
};

export type JankenAppInput = Record<string, never>;

export type JankenOutcome = {
  winnerPlayerId: string | null;
  draw: boolean;
};

export type JankenAppState = {
  choices: Partial<Record<string, JankenChoice>>;
  revealed: boolean;
  outcome: JankenOutcome | null;
};

export type JankenAppCommand =
  | { type: "game/start" }
  | { type: "game/choose"; choice: JankenChoice };

export type JankenAppView = {
  ownChoice: JankenChoice | null;
  choices: Array<{
    seat: number;
    submitted: boolean;
    choice: JankenChoice | null;
  }>;
  submittedSeats: number[];
  visiblePlayerSeats: number[];
  runtimeMarkers: string[];
  revealed: boolean;
  outcome: "win" | "lose" | "draw" | null;
  canChoose: boolean;
};

export type JankenRoom = GameSdkOnlineRoom<JankenSettings, JankenAppState>;
export type JankenCreateInput = GameSdkOnlineRoomCreateInput<
  JankenSettings,
  JankenAppInput
>;
export type JankenCommand = GameSdkOnlineRoomCommand<
  JankenSettings,
  JankenAppCommand
>;
export type JankenRoomView = GameSdkOnlineRoomView<
  JankenSettings,
  JankenAppView
>;

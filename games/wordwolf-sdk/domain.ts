import type {
  GameSdkOnlineRoom,
  GameSdkOnlineRoomCommand,
  GameSdkOnlineRoomCreateInput,
} from "@game-fields/game-sdk/runtime";

export type WordWolfSdkPhase = "lobby" | "clue" | "vote" | "wolfGuess" | "result";

export type WordWolfSdkSettings = {
  roundsTotal: number;
  wolfCount: number;
  clueMode: "turn" | "simultaneous";
};

export type WordWolfSdkClue = {
  playerId: string;
  round: number;
  text: string;
  at: number;
};

/** Word Wolf-specific state. Room membership and settings are SDK basic set state. */
export type WordWolfSdkAppState = {
  currentRound: number;
  wolfIds: string[];
  villageWord: string;
  wolfWord: string;
  clues: WordWolfSdkClue[];
  votes: Record<string, string>;
  accusedId: string | null;
  winner: "village" | "wolf" | null;
};

export type WordWolfSdkAppInput = {
  topic: {
    villageWord: string;
    wolfWord: string;
  };
};

export type WordWolfSdkAppCommand =
  | { type: "wordwolf/start" }
  | { type: "wordwolf/submit-clue"; text: string }
  | { type: "wordwolf/vote"; targetSeat: number }
  | { type: "wordwolf/guess"; answer: string };

export type WordWolfSdkRoom = GameSdkOnlineRoom<
  WordWolfSdkSettings,
  WordWolfSdkAppState
> & {
  phase: WordWolfSdkPhase;
};

export type WordWolfSdkCreateInput = GameSdkOnlineRoomCreateInput<
  WordWolfSdkSettings,
  WordWolfSdkAppInput
>;

export type WordWolfSdkCommand = GameSdkOnlineRoomCommand<
  WordWolfSdkSettings,
  WordWolfSdkAppCommand
>;

export function normalizeWordWolfSdkSettings(
  settings: WordWolfSdkSettings,
): WordWolfSdkSettings {
  return {
    roundsTotal: Math.max(1, Math.min(4, Math.floor(settings.roundsTotal))),
    wolfCount: Math.max(1, Math.floor(settings.wolfCount)),
    clueMode: settings.clueMode === "simultaneous" ? "simultaneous" : "turn",
  };
}

export function emptyWordWolfSdkState(
  topic: WordWolfSdkAppInput["topic"],
): WordWolfSdkAppState {
  return {
    currentRound: 0,
    wolfIds: [],
    villageWord: topic.villageWord.trim(),
    wolfWord: topic.wolfWord.trim(),
    clues: [],
    votes: {},
    accusedId: null,
    winner: null,
  };
}

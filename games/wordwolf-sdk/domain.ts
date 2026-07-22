import type { GameSdkOnlineRoomState, GameSdkRoomLifecycleCommand } from "@game-fields/game-sdk";

export type WordWolfSdkPhase = "lobby" | "clue" | "vote" | "wolfGuess" | "result";
export type WordWolfSdkSettings = { roundsTotal: number; wolfCount: number; clueMode: "turn" | "simultaneous" };
export type WordWolfSdkClue = { playerId: string; round: number; text: string; at: number };
export type WordWolfSdkState = {
  currentRound: number;
  wolfIds: string[];
  villageWord: string;
  wolfWord: string;
  clues: WordWolfSdkClue[];
  votes: Record<string, string>;
  accusedId: string | null;
  winner: "village" | "wolf" | null;
};
export type WordWolfSdkRoom = GameSdkOnlineRoomState<WordWolfSdkSettings> & WordWolfSdkState & { phase: WordWolfSdkPhase };
export type WordWolfSdkCreateInput = { settings?: Partial<WordWolfSdkSettings>; topic: { villageWord: string; wolfWord: string } };
export type WordWolfSdkCommand = GameSdkRoomLifecycleCommand<WordWolfSdkSettings>
  | { type: "wordwolf/start" }
  | { type: "wordwolf/submit-clue"; text: string }
  | { type: "wordwolf/vote"; targetPlayerId: string }
  | { type: "wordwolf/guess"; answer: string };

export function normalizeWordWolfSdkSettings(settings: WordWolfSdkSettings): WordWolfSdkSettings {
  return {
    roundsTotal: Math.max(1, Math.min(4, Math.floor(settings.roundsTotal))),
    wolfCount: Math.max(1, Math.floor(settings.wolfCount)),
    clueMode: settings.clueMode === "simultaneous" ? "simultaneous" : "turn",
  };
}

export function emptyWordWolfSdkState(topic: WordWolfSdkCreateInput["topic"]): WordWolfSdkState {
  return { currentRound: 0, wolfIds: [], villageWord: topic.villageWord.trim(), wolfWord: topic.wolfWord.trim(), clues: [], votes: {}, accusedId: null, winner: null };
}

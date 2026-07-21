import type { GameSdkStoredRoom } from "@game-fields/game-sdk";

export type MyFirstGameCreateInput = {
  target: number;
};

export type MyFirstGameCommand =
  | { type: "join" }
  | { type: "start" }
  | { type: "advance" };

export type MyFirstGameRoom = GameSdkStoredRoom & {
  phase: "lobby" | "playing" | "result";
  hostPlayerId: string;
  players: Array<{ id: string; name: string }>;
  count: number;
  target: number;
  lastActorPlayerId: string | null;
};

export type MyFirstGameRoomView = {
  phase: MyFirstGameRoom["phase"];
  playerNames: string[];
  count: number;
  target: number;
  isHost: boolean;
  isMember: boolean;
};

import type { GameDebugLogEntry } from "./game-debug-log.ts";
import type { DaifugoGameState } from "./daifugo.ts";
import type { PlayingCard } from "./playing-cards.ts";
import type { RoomLobbyReturnAction, RoomLobbyReturnState } from "./room-lobby-return.ts";

export const daifugoMinimumPlayers = 3;
export const daifugoMaximumPlayers = 6;

export type DaifugoRoomPlayer = {
  id: string;
  name: string;
  joinedAt: number;
  avatarColor: string;
  avatarImage?: string;
  shareNameAllowed?: boolean;
  isDummy?: boolean;
};

export type DaifugoRoom = {
  code: string;
  hostId: string;
  ownerId?: string;
  passphrase: string;
  phase: "lobby" | "playing" | "result";
  players: DaifugoRoomPlayer[];
  lobbyReturn?: RoomLobbyReturnState;
  playerCapacity: number;
  turnTimeLimitSeconds: number;
  revision: number;
  createdAt: number;
  updatedAt: number;
  gameNumber: number;
  gameStartedAt: number | null;
  phaseStartedAt: number | null;
  game: DaifugoGameState | null;
  debugMode: boolean;
  debugReplayEnabled: boolean;
  debugLog: GameDebugLogEntry[];
};

export type DaifugoRoomView = Omit<DaifugoRoom, "passphrase" | "game"> & {
  hasPassphrase: boolean;
  game: (Omit<DaifugoGameState, "hands"> & {
    hands: Record<string, PlayingCard[]>;
    handCounts: Record<string, number>;
  }) | null;
};

export type DaifugoRoomChoice = {
  code: string;
  hostName: string;
  playerCount: number;
  playerCapacity: number;
  hasPassphrase: boolean;
  updatedAt: number;
};

export type DaifugoRoomAction = RoomLobbyReturnAction
  | { type: "join-room"; actorId: string; player: DaifugoRoomPlayer; passphrase: string }
  | { type: "leave-room"; actorId: string }
  | { type: "set-config"; actorId: string; playerCapacity: number; turnTimeLimitSeconds: number }
  | { type: "start-game"; actorId: string }
  | { type: "expire-turn"; actorId: string; phaseStartedAt: number }
  | { type: "play-cards"; actorId: string; playerId?: string; cardIds: string[] }
  | { type: "pass"; actorId: string; playerId?: string }
  | { type: "reset-game"; actorId: string }
  | { type: "abort-game"; actorId: string }
  | { type: "set-debug"; actorId: string; enabled: boolean }
  | { type: "set-debug-replay"; actorId: string; enabled: boolean }
  | { type: "debug-add-player"; actorId: string }
  | { type: "debug-remove-player"; actorId: string; targetPlayerId: string };

export function sanitizeDaifugoRoom(room: DaifugoRoom, viewerId: string): DaifugoRoomView {
  const revealAll = room.debugMode && room.hostId === viewerId;
  const handCounts = Object.fromEntries(room.players.map((player) => [player.id, room.game?.hands[player.id]?.length ?? 0]));
  const hands = Object.fromEntries(room.players.map((player) => [
    player.id,
    room.game && (player.id === viewerId || revealAll) ? room.game.hands[player.id] : [],
  ]));
  const { passphrase: _passphrase, ...publicRoom } = room;
  void _passphrase;
  return {
    ...publicRoom,
    hasPassphrase: Boolean(room.passphrase),
    game: room.game ? { ...room.game, hands, handCounts } : null,
  };
}

export function daifugoRoomChoice(room: DaifugoRoom): DaifugoRoomChoice {
  return {
    code: room.code,
    hostName: room.players.find((player) => player.id === room.hostId)?.name ?? "Unknown",
    playerCount: room.players.length,
    playerCapacity: room.playerCapacity,
    hasPassphrase: Boolean(room.passphrase),
    updatedAt: room.updatedAt,
  };
}

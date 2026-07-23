import { randomUUID } from "node:crypto";
import {
  canRemoveOnlineRoomDebugPlayer,
  isOnlineRoomDebugPlayer,
} from "./online-room-access.ts";
import { releasePlayerActiveRoom } from "./player-active-room.ts";
import {
  confirmRoomLobbyReturn,
  normalizeRoomLobbyReturnState,
  type RoomLobbyReturnState,
} from "./room-lobby-return.ts";

export type OnlineRoomDebugParticipant = {
  id: string;
  name: string;
  isDummy?: boolean;
};

export type OnlineRoomDebugParticipantCommand =
  | { type: "set-debug"; enabled: boolean }
  | { type: "debug-add-player" }
  | { type: "debug-remove-player"; targetPlayerId: string };

type DebugParticipantRoom<Player extends OnlineRoomDebugParticipant> = {
  hostId: string;
  phase: string;
  debugMode?: boolean;
  debugReplayEnabled?: boolean;
  players: Player[];
  lobbyReturn?: RoomLobbyReturnState;
};

export type OnlineRoomDebugParticipantChange<
  Player extends OnlineRoomDebugParticipant,
> = {
  command: OnlineRoomDebugParticipantCommand["type"];
  players: Player[];
  removedPlayerIds: string[];
};

type ApplyOnlineRoomDebugParticipantCommandOptions<
  Room extends DebugParticipantRoom<OnlineRoomDebugParticipant>,
> = {
  forbiddenError: string;
  namePrefix?: string;
  assertCanAdd: (room: Room) => void;
  createPlayer: (
    seed: {
      id: string;
      name: string;
      joinedAt: number;
      debugParticipantIndex: number;
    },
    room: Room,
  ) => Room["players"][number];
  beforeCommand?: (
    room: Room,
    command: OnlineRoomDebugParticipantCommand,
  ) => void;
  afterParticipantsChanged?: (
    room: Room,
    change: OnlineRoomDebugParticipantChange<Room["players"][number]>,
  ) => Room;
  afterModeChanged?: (room: Room, enabled: boolean) => Room;
};

export function nextOnlineRoomDebugParticipantName(
  players: readonly OnlineRoomDebugParticipant[],
  prefix = "ダミー",
) {
  const escapedPrefix = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`^${escapedPrefix}(\\d+)$`);
  const largestExistingNumber = players.reduce((largest, player) => {
    if (!isOnlineRoomDebugPlayer(player)) return largest;
    const match = pattern.exec(player.name.trim());
    return match ? Math.max(largest, Number(match[1])) : largest;
  }, 0);
  return `${prefix}${largestExistingNumber + 1}`;
}

export function removeOnlineRoomDebugParticipants<
  Player extends OnlineRoomDebugParticipant,
>(
  players: readonly Player[],
  lobbyReturn: RoomLobbyReturnState | undefined,
  targetPlayerId?: string,
) {
  const removedPlayerIds = players
    .filter((player) => (
      isOnlineRoomDebugPlayer(player)
      && (!targetPlayerId || player.id === targetPlayerId)
    ))
    .map((player) => player.id);
  if (removedPlayerIds.length === 0) {
    return { players: [...players], lobbyReturn, removedPlayerIds };
  }

  const removed = new Set(removedPlayerIds);
  const retainedPlayers = players.filter((player) => !removed.has(player.id));
  return {
    players: retainedPlayers,
    lobbyReturn: normalizeRoomLobbyReturnState(lobbyReturn, retainedPlayers),
    removedPlayerIds,
  };
}

export function applyOnlineRoomDebugParticipantCommand<
  Room extends DebugParticipantRoom<OnlineRoomDebugParticipant>,
>(
  current: Room,
  actorId: string,
  command: OnlineRoomDebugParticipantCommand,
  options: ApplyOnlineRoomDebugParticipantCommandOptions<Room>,
) {
  const forbidden = () => {
    throw new Error(options.forbiddenError);
  };
  if (actorId !== current.hostId || current.phase !== "lobby") forbidden();
  options.beforeCommand?.(current, command);

  const finishParticipantChange = (
    room: Room,
    players: Room["players"],
    removedPlayerIds: string[],
  ) => {
    const change: OnlineRoomDebugParticipantChange<
      Room["players"][number]
    > = {
      command: command.type,
      players,
      removedPlayerIds,
    };
    return options.afterParticipantsChanged?.(room, change) ?? room;
  };

  if (command.type === "set-debug") {
    const cleanup = command.enabled
      ? null
      : removeOnlineRoomDebugParticipants(
        current.players,
        current.lobbyReturn,
      );
    let room = {
      ...current,
      debugMode: command.enabled,
      debugReplayEnabled: command.enabled
        ? current.debugReplayEnabled
        : false,
      players: cleanup?.players ?? current.players,
      lobbyReturn: cleanup?.lobbyReturn ?? current.lobbyReturn,
    } as Room;
    if (cleanup) {
      room = finishParticipantChange(
        room,
        cleanup.players,
        cleanup.removedPlayerIds,
      );
    }
    room = options.afterModeChanged?.(room, command.enabled) ?? room;
    return { room, removedPlayerIds: cleanup?.removedPlayerIds ?? [] };
  }

  if (!current.debugMode) forbidden();

  if (command.type === "debug-add-player") {
    options.assertCanAdd(current);
    const debugParticipantIndex = current.players.filter(
      isOnlineRoomDebugPlayer,
    ).length;
    const player = options.createPlayer({
      id: `dummy-${randomUUID()}`,
      name: nextOnlineRoomDebugParticipantName(
        current.players,
        options.namePrefix,
      ),
      joinedAt: Date.now(),
      debugParticipantIndex,
    }, current);
    const players = [...current.players, player] as Room["players"];
    const room = finishParticipantChange({
      ...current,
      players,
      lobbyReturn: confirmRoomLobbyReturn(
        current.lobbyReturn,
        players,
        player.id,
      ),
    } as Room, players, []);
    return { room, removedPlayerIds: [] };
  }

  if (!canRemoveOnlineRoomDebugPlayer({
    actorId,
    debugMode: current.debugMode === true,
    hostId: current.hostId,
    phase: current.phase,
    players: current.players,
    targetPlayerId: command.targetPlayerId,
  })) forbidden();
  const cleanup = removeOnlineRoomDebugParticipants(
    current.players,
    current.lobbyReturn,
    command.targetPlayerId,
  );
  const room = finishParticipantChange({
    ...current,
    players: cleanup.players,
    lobbyReturn: cleanup.lobbyReturn,
  } as Room, cleanup.players, cleanup.removedPlayerIds);
  return { room, removedPlayerIds: cleanup.removedPlayerIds };
}

export function onlineRoomNonDebugPlayerActiveRoomKeys<
  Player extends OnlineRoomDebugParticipant,
>(
  players: readonly Player[],
  playerActiveRoomKey: (playerId: string) => string,
) {
  return players
    .filter((player) => !isOnlineRoomDebugPlayer(player))
    .map((player) => playerActiveRoomKey(player.id));
}

export async function releaseOnlineRoomDebugParticipantActiveRooms(
  playerIds: Iterable<string>,
  roomCode: string,
  playerActiveRoomKey: (playerId: string) => string,
) {
  const uniquePlayerIds = [...new Set(playerIds)];
  await Promise.all(uniquePlayerIds.map((playerId) => (
    releasePlayerActiveRoom(playerActiveRoomKey(playerId), roomCode)
  )));
}

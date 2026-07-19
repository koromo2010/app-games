type RoomPhase = {
  phase: string;
};

type RoomPlayers = {
  players: Array<{ id: string }>;
};

type RevisionedRoom = {
  code: string;
  revision?: number;
};

export function roomUpdateIsOlder<Room extends RevisionedRoom>(
  currentRoom: Room | null,
  incomingRoom: Room,
) {
  return Boolean(
    currentRoom
    && currentRoom.code === incomingRoom.code
    && typeof currentRoom.revision === "number"
    && typeof incomingRoom.revision === "number"
    && incomingRoom.revision < currentRoom.revision,
  );
}

export function roomUpdateIsUnchanged<Room extends RevisionedRoom>(
  currentRoom: Room | null,
  incomingRoom: Room,
) {
  return Boolean(
    currentRoom
    && currentRoom.code === incomingRoom.code
    && typeof currentRoom.revision === "number"
    && typeof incomingRoom.revision === "number"
    && incomingRoom.revision === currentRoom.revision,
  );
}

export function shouldHoldRoomResultTransition(
  currentRoom: RoomPhase | null,
  incomingRoom: RoomPhase,
  resultPhase: string,
) {
  return currentRoom?.phase === resultPhase && incomingRoom.phase === "lobby";
}

export function shouldKeepRoomResultAfterDissolve(
  currentRoom: RoomPhase | null,
  resultPhase: string,
) {
  return currentRoom?.phase === resultPhase;
}

export function roomHasReturningPlayer(room: RoomPlayers, playerId: string) {
  return Boolean(playerId) && room.players.some((player) => player.id === playerId);
}

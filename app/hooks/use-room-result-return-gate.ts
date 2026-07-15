"use client";

import { useCallback, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { roomHasReturningPlayer, shouldHoldRoomResultTransition, shouldKeepRoomResultAfterDissolve } from "@/lib/room-result-return";

type ResultRoom = {
  code: string;
  phase: string;
  players: Array<{ id: string }>;
};

type RoomResultReturnGateOptions<Room extends ResultRoom> = {
  onReturnUnavailable?: () => void;
  playerId: string;
  resultPhase: string;
  room: Room | null;
  setRoom: Dispatch<SetStateAction<Room | null>>;
};

export function useRoomResultReturnGate<Room extends ResultRoom>({
  onReturnUnavailable,
  playerId,
  resultPhase,
  room,
  setRoom,
}: RoomResultReturnGateOptions<Room>) {
  const pendingLobbyRoomRef = useRef<Room | null>(null);
  const [canReturnToRoom, setCanReturnToRoom] = useState(false);
  const [isRoomDissolved, setIsRoomDissolved] = useState(false);

  const acceptIncomingRoom = useCallback((incomingRoom: Room) => {
    if (isRoomDissolved) return;
    if (shouldHoldRoomResultTransition(room, incomingRoom, resultPhase)) {
      if (!roomHasReturningPlayer(incomingRoom, playerId)) {
        pendingLobbyRoomRef.current = null;
        setCanReturnToRoom(false);
        setIsRoomDissolved(true);
        onReturnUnavailable?.();
        return;
      }
      pendingLobbyRoomRef.current = incomingRoom;
      setCanReturnToRoom(true);
      return;
    }
    pendingLobbyRoomRef.current = null;
    setCanReturnToRoom(false);
    setIsRoomDissolved(false);
    setRoom(incomingRoom);
  }, [isRoomDissolved, onReturnUnavailable, playerId, resultPhase, room, setRoom]);

  const returnToRoom = useCallback(async (
    loadLatestRoom: (code: string) => Promise<Room | null>,
    onUnavailable: () => void,
  ) => {
    const pendingLobbyRoom = pendingLobbyRoomRef.current;
    if (!pendingLobbyRoom || isRoomDissolved) return;
    let latestRoom: Room | null = null;
    try {
      latestRoom = await loadLatestRoom(pendingLobbyRoom.code);
    } catch {
      onUnavailable();
      return;
    }
    if (!latestRoom || latestRoom.phase !== "lobby" || !roomHasReturningPlayer(latestRoom, playerId)) {
      setCanReturnToRoom(false);
      setIsRoomDissolved(true);
      onUnavailable();
      return;
    }
    pendingLobbyRoomRef.current = null;
    setCanReturnToRoom(false);
    setIsRoomDissolved(false);
    setRoom(latestRoom);
  }, [isRoomDissolved, playerId, setRoom]);

  const markRoomDissolved = useCallback(() => {
    if (!shouldKeepRoomResultAfterDissolve(room, resultPhase)) return false;
    pendingLobbyRoomRef.current = null;
    setCanReturnToRoom(false);
    setIsRoomDissolved(true);
    return true;
  }, [resultPhase, room]);

  return {
    acceptIncomingRoom,
    canReturnToRoom,
    isRoomDissolved,
    markRoomDissolved,
    returnToRoom,
  };
}

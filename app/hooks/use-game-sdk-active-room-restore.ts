"use client";

import { useEffect, useState } from "react";

export function useGameSdkActiveRoomRestore<TRoom>(options: {
  loadActiveRoom: () => Promise<TRoom | null>;
  onRoom: (room: TRoom) => void;
  onEmpty: () => void | Promise<void>;
  onError: (error: unknown) => void;
}) {
  const {
    loadActiveRoom,
    onRoom,
    onEmpty,
    onError,
  } = options;
  const [isRestoringRoom, setIsRestoringRoom] = useState(true);

  useEffect(() => {
    let active = true;
    void loadActiveRoom()
      .then(async (room) => {
        if (!active) return;
        if (room) onRoom(room);
        else await onEmpty();
      })
      .catch((error) => {
        if (active) onError(error);
      })
      .finally(() => {
        if (active) setIsRestoringRoom(false);
      });
    return () => {
      active = false;
    };
  }, [loadActiveRoom, onEmpty, onError, onRoom]);

  return isRestoringRoom;
}

"use client";

import { useEffect, useRef, useState } from "react";
import type { RoomLobbyReturnState } from "@/lib/room-lobby-return";

type LobbyReturnRoom = {
  code: string;
  phase: string;
  players: Array<{ id: string }>;
  lobbyReturn?: RoomLobbyReturnState;
};

type Options = {
  room: LobbyReturnRoom | null;
  playerId: string;
  confirmReturn: () => Promise<unknown>;
};

export function useRoomLobbyReturnConfirmation({ room, playerId, confirmReturn }: Options) {
  const confirmRef = useRef(confirmReturn);
  const inFlightKeyRef = useRef("");
  const [retry, setRetry] = useState(0);
  useEffect(() => { confirmRef.current = confirmReturn; }, [confirmReturn]);

  useEffect(() => {
    const lobbyReturn = room?.lobbyReturn;
    if (!room || room.phase !== "lobby" || !lobbyReturn || !playerId) return;
    if (!room.players.some((player) => player.id === playerId) || lobbyReturn.returnedPlayerIds.includes(playerId)) return;
    const confirmationKey = `${room.code}:${lobbyReturn.startedAt}:${playerId}`;
    if (inFlightKeyRef.current === confirmationKey) return;
    inFlightKeyRef.current = confirmationKey;
    let cancelled = false;
    let retryTimer: number | undefined;
    confirmRef.current().then((saved) => {
      if (cancelled) return;
      inFlightKeyRef.current = "";
      if (saved) return;
      retryTimer = window.setTimeout(() => setRetry((value) => value + 1), 2000);
    }).catch(() => {
      if (cancelled) return;
      inFlightKeyRef.current = "";
      retryTimer = window.setTimeout(() => setRetry((value) => value + 1), 2000);
    });
    return () => {
      cancelled = true;
      if (retryTimer !== undefined) window.clearTimeout(retryTimer);
      if (inFlightKeyRef.current === confirmationKey) inFlightKeyRef.current = "";
    };
  }, [playerId, retry, room]);
}

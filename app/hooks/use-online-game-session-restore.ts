import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import {
  isPlayerAuthenticated,
  loadPersistentPlayerSession,
  readPlayerSession,
  type PlayerSession,
} from "@/lib/player-session";

type Params<Room extends { code: string }> = {
  lastRoomKey: string;
  fetchActiveRoom: (playerId: string) => Promise<Room | null>;
  fetchRoom: (code: string, playerId: string) => Promise<Room | null>;
  setRoom: Dispatch<SetStateAction<Room | null>>;
};

/** Reuses the same authoritative session read for every effect replay in one mount. */
export function useOnlineGameSessionLoadOnce() {
  const sessionLoadRef = useRef<Promise<PlayerSession | null> | null>(null);
  return useCallback(() => {
    const sessionLoad = sessionLoadRef.current ?? loadPersistentPlayerSession();
    sessionLoadRef.current = sessionLoad;
    return sessionLoad;
  }, []);
}

/**
 * Uses a locally authenticated session only to prefetch a possible active Room,
 * then exposes the account and Room after the read-only server check succeeds.
 */
export function useOnlineGameSessionRestore<Room extends { code: string }>({
  lastRoomKey,
  fetchActiveRoom,
  fetchRoom,
  setRoom,
}: Params<Room>) {
  const [session, setSession] = useState<PlayerSession | null>(null);
  const [ready, setReady] = useState(false);
  const [isRestoringRoom, setIsRestoringRoom] = useState(false);
  const loadSessionOnce = useOnlineGameSessionLoadOnce();

  useEffect(() => {
    let active = true;
    const timers: number[] = [];
    const defer = (callback: () => void) => {
      timers.push(window.setTimeout(() => {
        if (active) callback();
      }, 0));
    };

    const cachedSession = isPlayerAuthenticated() ? readPlayerSession() : null;
    const cachedActiveRoom = cachedSession?.id
      ? fetchActiveRoom(cachedSession.id).catch(() => null)
      : Promise.resolve(null);
    defer(() => setIsRestoringRoom(true));

    void loadSessionOnce().then(async (savedSession) => {
      if (!active) return;
      if (!savedSession?.id) {
        setSession(null);
        setRoom(null);
        setReady(true);
        setIsRestoringRoom(false);
        return;
      }

      setSession(savedSession);
      setReady(true);
      setIsRestoringRoom(true);
      try {
        const activeRoom = cachedSession?.id === savedSession.id
          ? await cachedActiveRoom
          : await fetchActiveRoom(savedSession.id);
        const lastCode = localStorage.getItem(lastRoomKey);
        const savedRoom = activeRoom ?? (lastCode ? await fetchRoom(lastCode, savedSession.id) : null);
        if (!active) return;
        if (savedRoom) {
          setRoom(savedRoom);
          localStorage.setItem(lastRoomKey, savedRoom.code);
        }
      } finally {
        if (active) setIsRestoringRoom(false);
      }
    }).catch(() => {
      if (!active) return;
      setSession(null);
      setRoom(null);
      setReady(true);
      setIsRestoringRoom(false);
    });

    return () => {
      active = false;
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [fetchActiveRoom, fetchRoom, lastRoomKey, loadSessionOnce, setRoom]);

  return { session, ready, isRestoringRoom };
}

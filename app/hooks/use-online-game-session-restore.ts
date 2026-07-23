import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
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

/**
 * Shows the signed-in game shell from the local session immediately, then verifies
 * the account and restores an active room in the background. Room entry controls
 * should stay inert while isRestoringRoom is true.
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

  useEffect(() => {
    let active = true;
    let sessionVerified = false;
    const timers: number[] = [];
    const defer = (callback: () => void) => {
      timers.push(window.setTimeout(() => {
        if (active) callback();
      }, 0));
    };

    if (!isPlayerAuthenticated()) {
      defer(() => setReady(true));
      return () => {
        active = false;
        timers.forEach((timer) => window.clearTimeout(timer));
      };
    }

    const cachedSession = readPlayerSession();
    const cachedActiveRoom = cachedSession?.id
      ? fetchActiveRoom(cachedSession.id).catch(() => null)
      : Promise.resolve(null);
    if (cachedSession?.id) {
      defer(() => {
        if (sessionVerified) return;
        setSession(cachedSession);
        setReady(true);
        setIsRestoringRoom(true);
      });
    }

    void loadPersistentPlayerSession().then(async (savedSession) => {
      if (!active) return;
      sessionVerified = true;
      if (!savedSession?.id) {
        setSession(null);
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
      setReady(true);
      setIsRestoringRoom(false);
    });

    return () => {
      active = false;
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [fetchActiveRoom, fetchRoom, lastRoomKey, setRoom]);

  return { session, ready, isRestoringRoom };
}

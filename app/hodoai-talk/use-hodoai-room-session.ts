import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { onlineRoomPollingIntervals, useOnlineRoomPolling } from "@/app/hooks/use-online-room-polling";
import { useRoomResultReturnGate } from "@/app/hooks/use-room-result-return-gate";
import { hodoaiRoomApi } from "@/app/hodoai-talk/hodoai-room-api-client";
import { restoreOnlineRoom } from "@/lib/online-room-api-client";
import { isPlayerAuthenticated, loadPersistentPlayerSession, type PlayerSession } from "@/lib/player-session";
import type { HodoaiRoom } from "@/lib/hodoai-talk";

export const hodoaiLastRoomKey = "hodoai-last-room";

type Params = {
  room: HodoaiRoom | null;
  setRoom: Dispatch<SetStateAction<HodoaiRoom | null>>;
  setError: Dispatch<SetStateAction<string>>;
};

export function useHodoaiRoomSession({ room, setRoom, setError }: Params) {
  const [session, setSession] = useState<PlayerSession | null>(null);
  const [ready, setReady] = useState(false);
  const playerId = session?.id ?? "";
  const resultReturnGate = useRoomResultReturnGate({
    room,
    setRoom,
    playerId,
    resultPhase: "result",
    onReturnUnavailable: () => setError("部屋に戻れません。解散されたか、参加情報が変更されています。"),
  });

  useEffect(() => {
    let active = true;
    let timer: number | undefined;
    if (!isPlayerAuthenticated()) {
      timer = window.setTimeout(() => setReady(true), 0);
      return () => { active = false; if (timer) window.clearTimeout(timer); };
    }
    loadPersistentPlayerSession().then(async (savedSession) => {
      if (!active) return;
      if (!savedSession?.id) { setReady(true); return; }
      setSession(savedSession);
      const savedRoom = await restoreOnlineRoom({
        playerId: savedSession.id,
        lastCode: localStorage.getItem(hodoaiLastRoomKey),
        fetchActiveRoom: hodoaiRoomApi.fetchActiveRoom,
        fetchRoom: hodoaiRoomApi.fetchRoom,
      });
      if (!active) return;
      timer = window.setTimeout(() => {
        if (savedRoom) { setRoom(savedRoom); localStorage.setItem(hodoaiLastRoomKey, savedRoom.code); }
        setReady(true);
      }, 0);
    }).catch(() => { if (active) setReady(true); });
    return () => { active = false; if (timer) window.clearTimeout(timer); };
  }, [setRoom]);

  useOnlineRoomPolling({
    game: "hodoai",
    roomCode: playerId && !resultReturnGate.isRoomDissolved ? room?.code : null,
    intervalMs: room?.phase === "arrange" ? onlineRoomPollingIntervals.realtime : room?.phase === "lobby" ? onlineRoomPollingIntervals.idle : onlineRoomPollingIntervals.active,
    fetchRoom: (code) => hodoaiRoomApi.fetchRoom(code, playerId),
    onRoom: resultReturnGate.acceptIncomingRoom,
    onMissing: () => {
      localStorage.removeItem(hodoaiLastRoomKey);
      if (resultReturnGate.markRoomDissolved()) {
        setError("部屋が解散されました。結果画面はこのまま確認できます。");
        return;
      }
      setRoom(null);
      setError("部屋が解散されたか、参加情報がなくなりました。");
    },
  });

  return { session, ready, playerId, resultReturnGate };
}

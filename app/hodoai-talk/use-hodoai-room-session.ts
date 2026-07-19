import type { Dispatch, SetStateAction } from "react";
import { onlineRoomPollingIntervals, useOnlineRoomPolling } from "@/app/hooks/use-online-room-polling";
import { useOnlineGameSessionRestore } from "@/app/hooks/use-online-game-session-restore";
import { useRoomResultReturnGate } from "@/app/hooks/use-room-result-return-gate";
import { hodoaiRoomApi } from "@/app/hodoai-talk/hodoai-room-api-client";
import type { HodoaiRoom } from "@/lib/hodoai-talk";

export const hodoaiLastRoomKey = "hodoai-last-room";

type Params = {
  room: HodoaiRoom | null;
  setRoom: Dispatch<SetStateAction<HodoaiRoom | null>>;
  setError: Dispatch<SetStateAction<string>>;
};

export function useHodoaiRoomSession({ room, setRoom, setError }: Params) {
  const { session, ready, isRestoringRoom } = useOnlineGameSessionRestore({
    lastRoomKey: hodoaiLastRoomKey,
    fetchActiveRoom: hodoaiRoomApi.fetchActiveRoom,
    fetchRoom: hodoaiRoomApi.fetchRoom,
    setRoom,
  });
  const playerId = session?.id ?? "";
  const resultReturnGate = useRoomResultReturnGate({
    room,
    setRoom,
    playerId,
    resultPhase: "result",
    onReturnUnavailable: () => setError("部屋に戻れません。解散されたか、参加情報が変更されています。"),
  });

  useOnlineRoomPolling({
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

  return { session, ready, isRestoringRoom, playerId, resultReturnGate };
}

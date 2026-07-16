import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { defaultAvatarImage, loadPersistentPlayerSession } from "@/lib/player-session";
import type { TahoiyaRoom } from "@/lib/tahoiya-types";
import { onlineRoomPollingIntervals, useOnlineRoomPolling } from "../hooks/use-online-room-polling";
import { useRoomResultReturnGate } from "../hooks/use-room-result-return-gate";
import { deleteRoomLocally, loadActiveRoomFromStore, loadRoomFromStore } from "./tahoiya-room-adapter";

type StringSetter = Dispatch<SetStateAction<string>>;
type Params = { room: TahoiyaRoom | null; playerId: string; setRoom: Dispatch<SetStateAction<TahoiyaRoom | null>>; setPlayerId: StringSetter; setActivePlayerId: StringSetter; setPlayerName: StringSetter; setAvatarColor: StringSetter; setAvatarImage: Dispatch<SetStateAction<string | null>>; setMessage: StringSetter };

export function useTahoiyaRoomSession(params: Params) {
  const { setRoom, setPlayerId, setActivePlayerId, setPlayerName, setAvatarColor, setAvatarImage } = params;
  const [now, setNow] = useState(() => Date.now());
  const resultReturnGate = useRoomResultReturnGate({ room: params.room, setRoom: params.setRoom, playerId: params.playerId, resultPhase: "result", onReturnUnavailable: () => params.setMessage("部屋に戻れません。解散されたか、参加情報が変更されています。") });
  const roomCode = params.room?.code;
  useEffect(() => {
    let mounted = true;
    loadPersistentPlayerSession().then(async (session) => {
      if (!mounted || !session) return; const id = session.id ?? ""; setPlayerId(id); setActivePlayerId(id); setPlayerName(session.name); setAvatarColor(session.avatarColor); setAvatarImage(session.avatarImage || defaultAvatarImage);
      if (!id) return; const activeRoom = await loadActiveRoomFromStore(id); if (!mounted || !activeRoom) return; setRoom(activeRoom); setActivePlayerId(id);
    }).catch(() => undefined);
    return () => { mounted = false; };
  }, [setActivePlayerId, setAvatarColor, setAvatarImage, setPlayerId, setPlayerName, setRoom]);
  useOnlineRoomPolling({ roomCode: resultReturnGate.isRoomDissolved ? null : roomCode, intervalMs: params.room?.phase === "lobby" ? onlineRoomPollingIntervals.idle : onlineRoomPollingIntervals.active, fetchRoom: loadRoomFromStore, onRoom: resultReturnGate.acceptIncomingRoom, onMissing: () => { if (roomCode) deleteRoomLocally(roomCode); if (resultReturnGate.markRoomDissolved()) { params.setMessage("部屋が解散されました。結果画面はこのまま確認できます。"); return; } params.setRoom(null); params.setMessage("部屋が解散されました。"); } });
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(timer); }, []);
  return { now, resultReturnGate };
}

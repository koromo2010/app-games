import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { defaultAvatarImage, loadPersistentPlayerSession } from "@/lib/player-session";
import { allRoomPlayersReturned } from "@/lib/room-lobby-return";
import type { TahoiyaRoom } from "@/lib/tahoiya-types";
import { onlineRoomPollingIntervals, useOnlineRoomPolling } from "../hooks/use-online-room-polling";
import { useRoomResultReturnGate } from "../hooks/use-room-result-return-gate";
import { applyRoomActionToStore, deleteRoomLocally, loadActiveRoomFromStore, loadRoomFromStore } from "./tahoiya-room-adapter";

type StringSetter = Dispatch<SetStateAction<string>>;
type Params = { room: TahoiyaRoom | null; playerId: string; setRoom: Dispatch<SetStateAction<TahoiyaRoom | null>>; setPlayerId: StringSetter; setActivePlayerId: StringSetter; setPlayerName: StringSetter; setAvatarColor: StringSetter; setAvatarImage: Dispatch<SetStateAction<string | null>>; setMessage: StringSetter };

export function useTahoiyaRoomSession(params: Params) {
  const { room, playerId, setRoom, setPlayerId, setActivePlayerId, setPlayerName, setAvatarColor, setAvatarImage } = params;
  const [now, setNow] = useState(() => Date.now());
  const returnConfirmationInFlightRef = useRef("");
  const [returnConfirmationRetry, setReturnConfirmationRetry] = useState(0);
  const resultReturnGate = useRoomResultReturnGate({ room: params.room, setRoom: params.setRoom, playerId: params.playerId, resultPhase: "result", onReturnUnavailable: () => params.setMessage("部屋が解散されたか、ホストにより退出扱いになりました。") });
  const roomCode = params.room?.code;
  const isWaitingForLobbyReturns = Boolean(room?.phase === "lobby" && room.lobbyReturn && !allRoomPlayersReturned(room.lobbyReturn, room.players));
  useEffect(() => {
    let mounted = true;
    loadPersistentPlayerSession().then(async (session) => {
      if (!mounted || !session) return; const id = session.id ?? ""; setPlayerId(id); setActivePlayerId(id); setPlayerName(session.name); setAvatarColor(session.avatarColor); setAvatarImage(session.avatarImage || defaultAvatarImage);
      if (!id) return; const activeRoom = await loadActiveRoomFromStore(id); if (!mounted || !activeRoom) return; setRoom(activeRoom); setActivePlayerId(id);
    }).catch(() => undefined);
    return () => { mounted = false; };
  }, [setActivePlayerId, setAvatarColor, setAvatarImage, setPlayerId, setPlayerName, setRoom]);
  useOnlineRoomPolling({ roomCode: resultReturnGate.isRoomDissolved ? null : roomCode, intervalMs: isWaitingForLobbyReturns ? onlineRoomPollingIntervals.realtime : params.room?.phase === "lobby" ? onlineRoomPollingIntervals.idle : onlineRoomPollingIntervals.active, fetchRoom: loadRoomFromStore, onRoom: resultReturnGate.acceptIncomingRoom, onMissing: () => { if (roomCode) deleteRoomLocally(roomCode); if (resultReturnGate.markRoomDissolved()) { params.setMessage("部屋が解散されたか、ホストにより退出扱いになりました。結果画面はこのまま確認できます。"); return; } params.setRoom(null); params.setMessage("部屋が解散されたか、退出扱いになりました。"); } });
  useEffect(() => {
    const lobbyReturn = room?.lobbyReturn;
    if (!room || room.phase !== "lobby" || !lobbyReturn || !playerId || lobbyReturn.returnedPlayerIds.includes(playerId)) return;
    if (!room.players.some((player) => player.id === playerId)) return;
    const confirmationKey = `${room.code}:${lobbyReturn.startedAt}:${playerId}`;
    if (returnConfirmationInFlightRef.current === confirmationKey) return;
    returnConfirmationInFlightRef.current = confirmationKey;
    let cancelled = false;
    let retryTimer: number | undefined;
    applyRoomActionToStore(room.code, { type: "confirm-lobby-return", actorId: playerId }).then((saved) => {
      if (cancelled) return;
      returnConfirmationInFlightRef.current = "";
      if (saved) {
        setRoom(saved);
        return;
      }
      retryTimer = window.setTimeout(() => setReturnConfirmationRetry((value) => value + 1), 2000);
    });
    return () => {
      cancelled = true;
      if (retryTimer !== undefined) window.clearTimeout(retryTimer);
      if (returnConfirmationInFlightRef.current === confirmationKey) returnConfirmationInFlightRef.current = "";
    };
  }, [playerId, returnConfirmationRetry, room, setRoom]);
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(timer); }, []);
  return { now, resultReturnGate };
}

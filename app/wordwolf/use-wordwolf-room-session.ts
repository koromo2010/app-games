import { useEffect, type Dispatch, type SetStateAction } from "react";
import { isPlayerAuthenticated, loadPersistentPlayerSession } from "@/lib/player-session";
import type { Room } from "@/lib/wordwolf-game-types";
import { onlineRoomPollingIntervals, useOnlineRoomPolling } from "../hooks/use-online-room-polling";
import { deleteRoom, getRoomKey, loadActiveRoomFromStore, loadRoomFromStore } from "./wordwolf-room-adapter";

type Args = {
  room: Room | null;
  isRoomDissolved: boolean;
  acceptIncomingRoom: (room: Room) => void;
  markRoomDissolved: () => boolean;
  setRoom: Dispatch<SetStateAction<Room | null>>;
  setActivePlayerId: Dispatch<SetStateAction<string>>;
  setPlayerAccountId: Dispatch<SetStateAction<string>>;
  setPlayerName: Dispatch<SetStateAction<string>>;
  setAvatarColor: Dispatch<SetStateAction<string>>;
  setAvatarImage: Dispatch<SetStateAction<string | null>>;
  setError: Dispatch<SetStateAction<string>>;
};

export function useWordWolfRoomSession(args: Args) {
  useEffect(() => {
    let mounted = true;
    if (!isPlayerAuthenticated()) return () => { mounted = false; };
    let timer: number | undefined;
    loadPersistentPlayerSession().then(async (session) => {
      if (!mounted || !session) return;
      const accountId = session.id ?? "";
      args.setPlayerName(session.name); args.setPlayerAccountId(accountId); args.setAvatarColor(session.avatarColor); args.setAvatarImage(session.avatarImage);
      const lastCode = localStorage.getItem("wordwolf-last-room");
      const lastPlayer = localStorage.getItem("wordwolf-last-player");
      let savedRoom = accountId ? await loadActiveRoomFromStore(accountId) : null;
      if (!savedRoom && lastCode) savedRoom = await loadRoomFromStore(lastCode);
      if (!mounted || !savedRoom) return;
      const playerId = lastPlayer && savedRoom.players.some((player) => player.id === lastPlayer) ? lastPlayer : savedRoom.players.some((player) => player.id === accountId) ? accountId : "";
      timer = window.setTimeout(() => { args.setRoom(savedRoom); if (playerId) { args.setActivePlayerId(playerId); localStorage.setItem("wordwolf-last-player", playerId); } localStorage.setItem("wordwolf-last-room", savedRoom.code); }, 0);
    }).catch(() => undefined);
    return () => { mounted = false; if (timer) window.clearTimeout(timer); };
  // Initial session restore intentionally runs once; state setters are stable.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const roomCode = args.room?.code;
  useOnlineRoomPolling({
    game: "wordwolf",
    roomCode: args.isRoomDissolved ? null : roomCode,
    intervalMs: args.room?.phase === "lobby" || args.room?.phase === "result" ? onlineRoomPollingIntervals.idle : onlineRoomPollingIntervals.active,
    fetchRoom: loadRoomFromStore,
    onRoom: args.acceptIncomingRoom,
    onMissing: () => {
      if (roomCode) deleteRoom(roomCode);
      if (localStorage.getItem("wordwolf-last-room") === roomCode) { localStorage.removeItem("wordwolf-last-room"); localStorage.removeItem("wordwolf-last-player"); }
      if (args.markRoomDissolved()) { args.setError("部屋が解散されました。結果画面はこのまま確認できます。"); return; }
      args.setRoom(null); args.setActivePlayerId(""); args.setError("部屋が解散されました。");
    },
    storageKey: getRoomKey,
  });
}

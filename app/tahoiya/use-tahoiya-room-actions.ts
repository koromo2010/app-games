import type { Dispatch, SetStateAction } from "react";
import type { TahoiyaRoom, TahoiyaRoomAction } from "@/lib/tahoiya-types";
import { preferLatestOnlineRoom } from "@/lib/online-room-client-state";
import { applyRoomActionToStore, deleteRoomFromStore, saveRoomDefaultsToStore } from "./tahoiya-room-adapter";

type Params = { room: TahoiyaRoom | null; playerId: string; markRoomDissolved: () => boolean; setRoom: Dispatch<SetStateAction<TahoiyaRoom | null>>; setMessage: Dispatch<SetStateAction<string>> };

export function useTahoiyaRoomActions({ room, playerId, markRoomDissolved, setRoom, setMessage }: Params) {
  const runRoomAction = async (action: TahoiyaRoomAction, persistDefaults = false) => {
    if (!room) return null; const saved = await applyRoomActionToStore(room.code, action);
    if (!saved) { setMessage("部屋の更新に失敗しました。再読み込みしてもう一度お試しください。"); return null; }
    setRoom((current) => preferLatestOnlineRoom(current, saved)); if (persistDefaults && playerId === saved.hostId) void saveRoomDefaultsToStore(saved); setMessage(""); return saved;
  };
  const dissolveRoom = async () => {
    if (!room || !window.confirm("部屋を解散しますか？参加者はこの部屋に戻れなくなります。")) return;
    await deleteRoomFromStore(room.code, playerId); if (markRoomDissolved()) { setMessage("部屋を解散しました。結果画面はこのまま確認できます。"); return; } setRoom(null);
  };
  return { runRoomAction, dissolveRoom };
}

import type { Dispatch, SetStateAction } from "react";
import type { Room, RoomChoice } from "@/lib/wordwolf-game-types";
import { createWordWolfRoom, joinWordWolfRoom } from "./wordwolf-room-api-client";
import { createEmptyRoom, deleteHostedRoomsFromStore, deleteRoomFromStore, getOwnerId, listJoinableRoomsFromStore, loadRoomDefaultsFromStore, saveRoom, saveRoomDefaultsToStore } from "./wordwolf-room-adapter";

type Args = {
  room: Room | null; isHost: boolean; activePlayerId: string; playerAccountId: string; playerName: string;
  avatarColor: string; avatarImage: string | null; roomPassphrase: string; joinCode: string;
  setRoom: Dispatch<SetStateAction<Room | null>>; setActivePlayerId: Dispatch<SetStateAction<string>>;
  setJoinCode: Dispatch<SetStateAction<string>>; setJoinableRooms: Dispatch<SetStateAction<RoomChoice[]>>;
  setIsJoinListOpen: Dispatch<SetStateAction<boolean>>; setError: Dispatch<SetStateAction<string>>;
  markRoomDissolved: () => boolean;
};

export function useWordWolfRoomLifecycle(args: Args) {
  const createRoom = async () => {
    const name = args.playerName.trim();
    if (!name || !args.playerAccountId) { args.setError("広場でプレイヤー登録をしてください。"); return; }
    const ownerId = getOwnerId();
    const fallbackHostId = args.activePlayerId || localStorage.getItem("wordwolf-last-player") || "";
    if (!await deleteHostedRoomsFromStore(ownerId, fallbackHostId)) { args.setError("プレイ中の部屋があるため、新しい部屋は作れません。その部屋へ戻ってください。"); return; }
    const defaults = await loadRoomDefaultsFromStore(args.playerAccountId, ownerId);
    const created = createEmptyRoom(name, args.roomPassphrase.trim(), ownerId, args.avatarColor, args.avatarImage, args.playerAccountId, defaults);
    args.setIsJoinListOpen(false); args.setJoinableRooms([]); args.setActivePlayerId(created.player.id);
    try {
      const saved = await createWordWolfRoom(created.room);
      saveRoom(saved.room); args.setRoom(saved.room); void saveRoomDefaultsToStore(saved.room);
      localStorage.setItem("wordwolf-last-room", saved.room.code);
    } catch { args.setError("部屋を作成できませんでした。"); return; }
    localStorage.setItem("wordwolf-last-player", created.player.id); args.setError("");
  };

  const showJoinChoices = async () => {
    const rooms = await listJoinableRoomsFromStore();
    args.setJoinableRooms(rooms); args.setIsJoinListOpen(true);
    args.setError(rooms.length > 0 ? "" : "参加できる未開始の部屋がありません。");
  };

  const joinRoom = async (selectedCode = args.joinCode) => {
    const code = selectedCode.trim().toUpperCase();
    if (!args.playerName.trim() || !args.playerAccountId) { args.setError("広場でプレイヤー登録をしてください。"); return; }
    if (!code) { args.setError("部屋コードを入力してください。"); return; }
    try {
      const { room } = await joinWordWolfRoom(code, args.roomPassphrase.trim());
      args.setJoinCode(code); args.setIsJoinListOpen(false); args.setJoinableRooms([]); args.setActivePlayerId(args.playerAccountId);
      saveRoom(room); args.setRoom(room);
      localStorage.setItem("wordwolf-last-player", args.playerAccountId); localStorage.setItem("wordwolf-last-room", room.code); args.setError("");
    } catch { args.setError("部屋が見つからないか、合言葉が違います。"); }
  };

  const dissolveRoom = async () => {
    if (!args.room || !args.isHost || !window.confirm("部屋を解散しますか？参加者はこの部屋に戻れなくなります。")) return;
    await deleteRoomFromStore(args.room.code);
    if (localStorage.getItem("wordwolf-last-room") === args.room.code) { localStorage.removeItem("wordwolf-last-room"); localStorage.removeItem("wordwolf-last-player"); }
    if (args.markRoomDissolved()) { args.setError("部屋を解散しました。結果画面はこのまま確認できます。"); return; }
    args.setRoom(null); args.setActivePlayerId(""); args.setError("部屋を解散しました。");
  };

  const copyText = async (text: string, successMessage: string) => {
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text);
      else { const area = document.createElement("textarea"); area.value = text; area.setAttribute("readonly", ""); area.style.position = "fixed"; area.style.opacity = "0"; document.body.appendChild(area); try { area.focus(); area.select(); document.execCommand("copy"); } finally { document.body.removeChild(area); } }
      args.setError(successMessage);
    } catch { args.setError("コピーできませんでした。ブラウザの権限を確認してください。"); }
  };
  const copyRoomCode = () => { if (args.room) void copyText(args.room.code, "ROOMをコピーしました。"); };
  const copyRoomInvite = () => { if (args.room) { const passphrase = args.roomPassphrase.trim() || (args.room.passphrase ? "設定済み（再表示不可）" : "なし"); void copyText(`ROOM: ${args.room.code}\n合言葉: ${passphrase}`, "ROOMと合言葉をコピーしました。"); } };
  return { createRoom, showJoinChoices, joinRoom, dissolveRoom, copyRoomCode, copyRoomInvite };
}

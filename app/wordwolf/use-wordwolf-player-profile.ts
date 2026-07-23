import type { Dispatch, SetStateAction } from "react";
import { normalizePlayerName, savePersistentPlayerSession } from "@/lib/player-session";
import type { Room, WordWolfRoomAction } from "@/lib/wordwolf-game-types";

type Args = {
  room: Room | null;
  activePlayerId: string;
  playerName: string;
  avatarColor: string;
  avatarImage: string | null;
  setPlayerName: Dispatch<SetStateAction<string>>;
  setAvatarColor: Dispatch<SetStateAction<string>>;
  setAvatarImage: Dispatch<SetStateAction<string | null>>;
  setIsAvatarPickerOpen: Dispatch<SetStateAction<boolean>>;
  setError: Dispatch<SetStateAction<string>>;
  runRoomAction: (action: WordWolfRoomAction) => Promise<Room | null>;
};

export function useWordWolfPlayerProfile(args: Args) {
  const persistRoomPlayer = (name: string, color: string, image: string | null) => {
    if (!args.room || !args.activePlayerId) return;
    void args.runRoomAction({ type: "update-player", name, avatarColor: color, avatarImage: image ?? undefined });
  };

  const updatePlayerName = (nextName: string) => {
    args.setPlayerName(nextName);
  };

  const commitPlayerName = () => {
    const normalizedName = normalizePlayerName(args.playerName);
    args.setPlayerName(normalizedName);
    void savePersistentPlayerSession({ name: normalizedName, avatarColor: args.avatarColor, avatarImage: args.avatarImage });
    persistRoomPlayer(normalizedName, args.avatarColor, args.avatarImage);
  };

  const updateAvatarColor = (nextColor: string) => {
    args.setAvatarColor(nextColor);
    args.setIsAvatarPickerOpen(false);
    if (args.playerName.trim()) void savePersistentPlayerSession({ name: args.playerName.trim(), avatarColor: nextColor, avatarImage: args.avatarImage });
    persistRoomPlayer(args.playerName.trim(), nextColor, args.avatarImage);
  };

  const updateAvatarImage = (nextImage: string | null) => {
    args.setAvatarImage(nextImage);
    if (args.playerName.trim()) void savePersistentPlayerSession({ name: args.playerName.trim(), avatarColor: args.avatarColor, avatarImage: nextImage });
    persistRoomPlayer(args.playerName.trim(), args.avatarColor, nextImage);
  };

  const uploadAvatarImage = (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) { args.setError("画像ファイルを選んでください。"); return; }
    if (file.size > 150_000) { args.setError("画像は150KB以下にしてください。"); return; }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string" || !reader.result.startsWith("data:image/")) { args.setError("画像を読み込めませんでした。"); return; }
      updateAvatarImage(reader.result);
      args.setError("");
    };
    reader.onerror = () => args.setError("画像を読み込めませんでした。");
    reader.readAsDataURL(file);
  };

  return { updatePlayerName, commitPlayerName, updateAvatarColor, updateAvatarImage, uploadAvatarImage };
}

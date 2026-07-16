import { useState, type Dispatch, type DragEvent, type SetStateAction } from "react";
import { compressAvatarImage, uploadAvatarImage } from "@/lib/avatar-image-client";
import { defaultAvatarImage, savePersistentPlayerSession } from "@/lib/player-session";

type Params = { name: string; playerId: string; avatarColor: string; hasRecoveryEmail: boolean; setAvatarColor: Dispatch<SetStateAction<string>>; setAvatarImage: Dispatch<SetStateAction<string | null>>; setMessage: Dispatch<SetStateAction<string>> };

export function useLobbyAvatarActions(params: Params) {
  const [isSaving, setIsSaving] = useState(false); const [isDragging, setIsDragging] = useState(false);
  const updateAvatar = async (color: string, image: string | null) => {
    if (!params.name.trim() || isSaving) return false; params.setAvatarColor(color); params.setAvatarImage(image || defaultAvatarImage); setIsSaving(true);
    try { const result = await savePersistentPlayerSession({ id: params.playerId || undefined, name: params.name.trim(), avatarColor: color, avatarImage: image || defaultAvatarImage, hasRecoveryEmail: params.hasRecoveryEmail }); params.setAvatarColor(result.session.avatarColor); params.setAvatarImage(result.session.avatarImage || defaultAvatarImage); if (!result.persistent) params.setMessage("アイコンを端末には保存しましたが、サーバーへ保存できませんでした。"); return result.persistent; }
    catch { params.setMessage("アイコンを保存できませんでした。"); return false; } finally { setIsSaving(false); }
  };
  const uploadAvatar = async (file?: File) => {
    if (!file || isSaving) return; setIsSaving(true); params.setMessage("画像を小さくしています...");
    try { const image = await compressAvatarImage(file); params.setMessage("画像を保存しています..."); const url = await uploadAvatarImage(image); setIsSaving(false); if (await updateAvatar(params.avatarColor, url)) params.setMessage("アイコンを保存しました。"); }
    catch (error) { params.setMessage(error instanceof Error && error.message === "AVATAR_FILE_TOO_LARGE" ? "元画像は10MB以下のものを選んでください。" : error instanceof Error && error.message === "AVATAR_BLOB_NOT_CONFIGURED" ? "画像保存の設定がまだ反映されていません。少し待ってからお試しください。" : "アイコン画像を保存できませんでした。"); } finally { setIsSaving(false); }
  };
  const dropAvatar = (event: DragEvent<HTMLElement>) => { event.preventDefault(); event.stopPropagation(); setIsDragging(false); if (isSaving) return; const file = Array.from(event.dataTransfer.files).find((candidate) => candidate.type.startsWith("image/")); if (!file) return params.setMessage("画像ファイルをドロップしてください。"); void uploadAvatar(file); };
  return { isAvatarSaving: isSaving, isAvatarDragging: isDragging, setIsAvatarDragging: setIsDragging, updateAvatar, uploadAvatar, dropAvatar };
}

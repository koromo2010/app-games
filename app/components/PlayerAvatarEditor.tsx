"use client";

import { type DragEvent, useRef, useState } from "react";
import { compressAvatarImage, uploadAvatarImage } from "@/lib/avatar-image-client";
import {
  avatarColorOptions,
  defaultAvatarImage,
  defaultAvatarImages,
  savePersistentPlayerSession,
  type PlayerSession,
} from "@/lib/player-session";

type Props = {
  session: PlayerSession;
  onSaved: (session: PlayerSession) => void;
};

export function PlayerAvatarEditor({ session, onSaved }: Props) {
  const [isSaving, setIsSaving] = useState(false);
  const [isCompressing, setIsCompressing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [message, setMessage] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const saveAvatar = async (avatarColor: string, avatarImage: string) => {
    if (isSaving) return;
    setIsSaving(true);
    setMessage("");
    try {
      const result = await savePersistentPlayerSession({
        id: session.id,
        name: session.name,
        avatarColor,
        avatarImage,
        hasRecoveryEmail: session.hasRecoveryEmail,
        shareNameAllowed: session.shareNameAllowed,
        createdAt: session.createdAt,
      });
      onSaved(result.session);
      setMessage(result.persistent ? "アイコンを保存しました。" : "この端末に保存しました。");
    } catch {
      setMessage("アイコンを保存できませんでした。");
    } finally {
      setIsSaving(false);
    }
  };

  const disabled = isSaving || isCompressing;

  const uploadAvatar = async (file: File | undefined) => {
    if (!file || isSaving || isCompressing) return;
    setIsCompressing(true);
    setMessage("画像を小さくしています...");
    try {
      const image = await compressAvatarImage(file);
      setMessage("画像を保存しています...");
      const url = await uploadAvatarImage(image);
      await saveAvatar(session.avatarColor, url);
    } catch (error) {
      setMessage(error instanceof Error && error.message === "AVATAR_FILE_TOO_LARGE"
        ? "元画像は10MB以下のものを選んでください。"
        : error instanceof Error && error.message === "AVATAR_BLOB_NOT_CONFIGURED"
          ? "画像保存の設定がまだ反映されていません。少し待ってからお試しください。"
          : "この画像を保存できませんでした。別の画像をお試しください。");
    } finally {
      setIsCompressing(false);
    }
  };

  const dropAvatar = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);
    if (disabled) return;
    const file = Array.from(event.dataTransfer.files).find((candidate) => candidate.type.startsWith("image/"));
    if (!file) {
      setMessage("画像ファイルをドロップしてください。");
      return;
    }
    void uploadAvatar(file);
  };

  return (
    <div className="rounded-xl border border-white/15 bg-slate-950/35 p-4 text-white shadow-xl">
      <div className="flex items-center gap-3">
        <span className="h-16 w-16 shrink-0 rounded-full border-2 border-white/40 bg-cover bg-center" style={{ backgroundColor: session.avatarColor, backgroundImage: `url(${session.avatarImage || defaultAvatarImage})` }} aria-hidden="true" />
        <div>
          <p className="font-black">アイコンの模様替え</p>
          <p className="mt-1 text-xs leading-5 text-slate-300">色や絵柄を選ぶか、手元の画像をアイコンにできます。</p>
        </div>
      </div>

      <p className="mt-4 text-xs font-bold text-slate-200">色</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {avatarColorOptions.map((color) => (
          <button key={color} type="button" disabled={disabled} aria-label={`アイコン色 ${color}`} aria-pressed={session.avatarColor === color} onClick={() => void saveAvatar(color, session.avatarImage || defaultAvatarImage)} className={`h-8 w-8 rounded-full border-2 transition disabled:opacity-40 ${session.avatarColor === color ? "border-white ring-2 ring-cyan-300" : "border-white/30"}`} style={{ backgroundColor: color }} />
        ))}
      </div>

      <p className="mt-4 text-xs font-bold text-slate-200">絵柄</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {defaultAvatarImages.map((image, index) => (
          <button key={image} type="button" disabled={disabled} aria-label={`標準アイコン ${index + 1}`} aria-pressed={session.avatarImage === image} onClick={() => void saveAvatar(session.avatarColor, image)} className={`h-11 w-11 rounded-full border-2 bg-cover bg-center transition disabled:opacity-40 ${session.avatarImage === image ? "border-white ring-2 ring-cyan-300" : "border-white/30"}`} style={{ backgroundColor: session.avatarColor, backgroundImage: `url(${image})` }} />
        ))}
      </div>

      <button
        type="button"
        disabled={disabled}
        onClick={() => fileInputRef.current?.click()}
        onDragEnter={(event) => {
          event.preventDefault();
          if (!disabled && event.dataTransfer.types.includes("Files")) setIsDragging(true);
        }}
        onDragOver={(event) => {
          event.preventDefault();
          event.dataTransfer.dropEffect = "copy";
          if (!disabled && event.dataTransfer.types.includes("Files")) setIsDragging(true);
        }}
        onDragLeave={(event) => {
          event.preventDefault();
          setIsDragging(false);
        }}
        onDrop={dropAvatar}
        className={`mt-4 w-full rounded-lg px-3 py-2 text-sm font-black text-slate-950 transition disabled:opacity-40 ${isDragging ? "bg-cyan-200 ring-2 ring-white" : "bg-cyan-500 hover:bg-cyan-400"}`}
      >
        {isCompressing ? "画像を圧縮中..." : isDragging ? "ここに画像をドロップ" : "画像を選ぶ・ドロップ"}
      </button>
      <input ref={fileInputRef} type="file" accept="image/*" className="sr-only" onChange={(event) => { void uploadAvatar(event.target.files?.[0]); event.currentTarget.value = ""; }} />
      <p className="mt-2 text-[11px] leading-5 text-slate-400">ボタンへ画像をドラッグ＆ドロップすることもできます。中央を正方形に切り抜き、最大128×128pxに圧縮して保存します。元画像は10MBまでです。</p>
      {message && <p className="mt-2 text-xs font-semibold text-cyan-100" role="status">{message}</p>}
    </div>
  );
}

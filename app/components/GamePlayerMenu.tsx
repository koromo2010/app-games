"use client";

import { createPortal } from "react-dom";
import { useEffect, useRef, useState } from "react";
import { avatarColorOptions, clearPlayerSession, defaultAvatarImage, defaultAvatarImages, isAvatarColor, isAvatarImage, savePersistentPlayerSession, type PlayerSession } from "@/lib/player-session";
import { FullScreenPageOverlay } from "@/app/components/FullScreenPageOverlay";

type Props = { id?: string; name: string; avatarColor: string; avatarImage?: string | null; hasRecoveryEmail?: boolean };

export function GamePlayerMenu(props: Props) {
  const [colorOverride, setColorOverride] = useState<string | null>(null);
  const [imageOverride, setImageOverride] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isMyPageOpen, setIsMyPageOpen] = useState(false);
  const [position, setPosition] = useState({ top: 80, left: 12 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const color = colorOverride ?? props.avatarColor;
  const image = imageOverride ?? props.avatarImage ?? defaultAvatarImage;

  useEffect(() => {
    const receiveSessionUpdate = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.data?.type !== "game-fields:player-session-updated") return;
      const nextSession = event.data.session as Partial<PlayerSession> | undefined;
      const nextColor = typeof nextSession?.avatarColor === "string" ? nextSession.avatarColor : null;
      if (!isAvatarColor(nextColor)) return;
      const nextImage = typeof nextSession?.avatarImage === "string" ? nextSession.avatarImage : null;
      setColorOverride(nextColor);
      setImageOverride(isAvatarImage(nextImage) ? nextImage : defaultAvatarImage);
    };
    window.addEventListener("message", receiveSessionUpdate);
    return () => window.removeEventListener("message", receiveSessionUpdate);
  }, []);

  const openMenu = () => {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (rect) {
      const width = Math.min(288, window.innerWidth - 24);
      setPosition({
        top: rect.bottom + 8,
        left: Math.max(12, Math.min(rect.right - width, window.innerWidth - width - 12)),
      });
    }
    setIsOpen(true);
  };

  const updateAvatar = async (nextColor: string, nextImage: string) => {
    if (isSaving) return;
    setColorOverride(nextColor);
    setImageOverride(nextImage);
    setIsSaving(true);
    setMessage("");
    try {
      const result = await savePersistentPlayerSession({ id: props.id, name: props.name, avatarColor: nextColor, avatarImage: nextImage, hasRecoveryEmail: props.hasRecoveryEmail });
      setColorOverride(result.session.avatarColor);
      setImageOverride(result.session.avatarImage || defaultAvatarImage);
      if (!result.persistent) setMessage("この端末に保存しました。");
    } catch {
      setMessage("アイコンを保存できませんでした。");
    } finally {
      setIsSaving(false);
    }
  };

  const logout = async () => {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    setMessage("");
    try {
      const response = await fetch("/api/player-account", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "logout" }) });
      if (!response.ok) throw new Error("LOGOUT_FAILED");
      clearPlayerSession();
      localStorage.removeItem("wordwolf-last-room");
      localStorage.removeItem("wordwolf-last-player");
      window.location.assign("/games");
    } catch {
      setMessage("ログアウトできませんでした。通信を確認してもう一度お試しください。");
      setIsLoggingOut(false);
    }
  };

  return (
    <>
      <button ref={buttonRef} type="button" onClick={openMenu} className="flex items-center gap-2 rounded-lg border border-white/15 bg-white/10 px-2.5 py-1.5 font-semibold text-white transition hover:bg-white/15" aria-haspopup="dialog" aria-expanded={isOpen} aria-label={`${props.name}のプレイヤーメニューを開く`}>
        <span className="h-7 w-7 rounded-full border border-white/50 bg-cover bg-center" style={{ backgroundColor: color, backgroundImage: `url(${image})` }} aria-hidden="true" />
        <span className="max-w-[120px] truncate">{props.name}</span>
        <span className="text-[10px] text-slate-300" aria-hidden="true">▼</span>
      </button>
      {isOpen && createPortal(<div className="fixed inset-0 z-[9999]" onClick={() => setIsOpen(false)}><div role="dialog" aria-label={`${props.name}のプレイヤーメニュー`} className="fixed w-[min(18rem,calc(100vw-1.5rem))] rounded-lg border border-slate-200 bg-white p-3 text-slate-900 shadow-2xl" style={position} onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between gap-2"><p className="truncate px-1 text-xs font-semibold text-slate-500">{props.name}でプレイ中</p><button type="button" onClick={() => setIsOpen(false)} className="rounded border border-slate-200 px-2 py-1 text-xs font-bold text-slate-500">閉じる</button></div>
        <p className="mt-3 text-xs font-bold">アイコンの色</p>
        <div className="mt-2 grid grid-cols-8 gap-1.5">
          {avatarColorOptions.map((option) => <button key={option} type="button" disabled={isSaving} aria-label={`アイコン色 ${option}`} aria-pressed={color === option} onClick={() => void updateAvatar(option, image)} className={`h-7 w-7 rounded-full border-2 ${color === option ? "border-slate-900 ring-2 ring-cyan-300" : "border-white"}`} style={{ backgroundColor: option }} />)}
        </div>
        <p className="mt-3 text-xs font-bold">アイコン画像</p>
        <div className="mt-2 grid grid-cols-5 gap-2">
          {defaultAvatarImages.map((option, index) => <button key={option} type="button" disabled={isSaving} aria-label={`標準アイコン ${index + 1}`} aria-pressed={image === option} onClick={() => void updateAvatar(color, option)} className={`h-10 w-10 rounded-full border-2 bg-cover bg-center ${image === option ? "border-cyan-500 ring-2 ring-cyan-200" : "border-slate-200"}`} style={{ backgroundColor: color, backgroundImage: `url(${option})` }} />)}
        </div>
        {message && <p className="mt-2 text-xs text-slate-600" role="status">{message}</p>}
        <button type="button" onClick={() => { setIsOpen(false); setIsMyPageOpen(true); }} className="mt-3 flex w-full items-center justify-center rounded-md bg-cyan-600 px-3 py-2 text-sm font-bold text-white hover:bg-cyan-500">マイページを開く</button>
        {props.id && <button type="button" disabled={isLoggingOut} onClick={() => void logout()} className="mt-2 w-full rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-bold text-rose-700 hover:bg-rose-100 disabled:opacity-40">{isLoggingOut ? "ログアウト中..." : "ログアウト"}</button>}
      </div></div>, document.body)}
      <FullScreenPageOverlay open={isMyPageOpen} href="/users/me" title="マイページ" onClose={() => setIsMyPageOpen(false)} />
    </>
  );
}

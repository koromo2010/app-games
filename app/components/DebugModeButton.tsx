"use client";

import { createPortal } from "react-dom";
import { useEffect, useRef, useState } from "react";
import { DebugActionLog } from "@/app/components/DebugActionLog";
import {
  onlineRoomSyncModeLabel,
  useOnlineRoomSyncDiagnostics,
} from "@/app/hooks/online-room-sync-diagnostics";
import type { GameDebugLogEntry } from "@/lib/game-debug-log";

type DebugModeButtonProps = {
  enabled: boolean;
  disabled?: boolean;
  onChange: (enabled: boolean) => void | Promise<void>;
  onAbort?: () => void | Promise<void>;
  replayEnabled?: boolean;
  replayDisabled?: boolean;
  onReplayChange?: (enabled: boolean) => void | Promise<void>;
  debugLogEntries?: GameDebugLogEntry[];
  variant?: "banner" | "menu";
};

export function DebugModeButton({ enabled, disabled = false, onChange, onAbort, replayEnabled = false, replayDisabled = false, onReplayChange, debugLogEntries = [], variant = "menu" }: DebugModeButtonProps) {
  const syncDiagnostics = useOnlineRoomSyncDiagnostics();
  const [hasAccess, setHasAccess] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState({ top: 80, left: 12 });
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/debug-auth", { cache: "no-store", signal: controller.signal })
      .then(async (response) => response.ok ? response.json() as Promise<{ enabled?: boolean }> : null)
      .then((body) => setHasAccess(body?.enabled === true))
      .catch(() => undefined)
      .finally(() => setIsLoading(false));
    return () => controller.abort();
  }, []);

  if (isLoading || !hasAccess) return null;

  const openMenu = () => {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (rect) {
      const width = Math.min(288, window.innerWidth - 24);
      setPosition({ top: rect.bottom + 8, left: Math.max(12, Math.min(rect.right - width, window.innerWidth - width - 12)) });
    }
    setIsOpen(true);
  };

  const run = async (action: () => void | Promise<void>) => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try { await action(); } finally { setIsSubmitting(false); }
  };

  const abort = async () => {
    if (!onAbort || !window.confirm("進行中のゲームを中断し、同じ部屋のゲーム開始前へ戻しますか？")) return;
    await run(onAbort);
    setIsOpen(false);
  };

  return <>
    <button ref={buttonRef} type="button" title="開発者向け操作を開く" onClick={openMenu} className={variant === "menu" ? `rounded-lg border px-3 py-2 text-sm font-bold transition ${enabled ? "border-cyan-300 bg-cyan-50 text-cyan-900" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}` : `rounded-md border px-2 py-1 font-mono text-[11px] font-medium tracking-wide transition ${enabled ? "border-cyan-300/35 bg-cyan-300/10 text-cyan-100" : "border-white/10 bg-white/[0.03] text-white/60 hover:border-white/20 hover:text-white/80"}`} aria-haspopup="dialog" aria-expanded={isOpen}>
      {enabled ? "DEBUG · ON" : "DEBUG"} <span aria-hidden="true">▼</span>
    </button>
    {isOpen && createPortal(<div className="fixed inset-0 z-[9999]" onClick={() => setIsOpen(false)}><div role="dialog" aria-label="開発者向け操作" className="fixed w-[min(18rem,calc(100vw-1.5rem))] rounded-lg border border-slate-200 bg-white p-3 text-slate-900 shadow-2xl" style={position} onClick={(event) => event.stopPropagation()}>
      <div className="flex items-center justify-between gap-2"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Debug tools</p><button type="button" onClick={() => setIsOpen(false)} className="rounded border border-slate-200 px-2 py-1 text-xs font-bold text-slate-500">閉じる</button></div>
      <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-2 text-xs text-slate-700">
        <div className="flex items-center justify-between gap-2"><span className="font-bold">部屋同期</span><strong>{onlineRoomSyncModeLabel(syncDiagnostics.mode)}</strong></div>
        <div className="mt-1 flex items-center justify-between gap-2 font-mono text-[11px] text-slate-500"><span>部屋GET {syncDiagnostics.roomGetCount}回</span><span>通知 {syncDiagnostics.notificationCount}件</span></div>
      </div>
      <button type="button" disabled={disabled || isSubmitting} aria-pressed={enabled} onClick={() => void run(() => onChange(!enabled))} className={`mt-3 flex w-full items-center justify-between rounded-lg border px-3 py-2 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-40 ${enabled ? "border-cyan-300 bg-cyan-50 text-cyan-950" : "border-slate-300 bg-slate-50 text-slate-700"}`}><span>デバッグモード</span><span>{enabled ? "ON" : "OFF"}</span></button>
      {enabled && onReplayChange && <button type="button" disabled={replayDisabled || isSubmitting} aria-pressed={replayEnabled} onClick={() => void run(() => onReplayChange(!replayEnabled))} className="mt-2 flex w-full items-center justify-between rounded-lg border border-slate-300 px-3 py-2 text-sm font-bold text-slate-700 disabled:opacity-40"><span>プレイバック記録</span><span>{replayEnabled ? "ON" : "OFF"}</span></button>}
      {enabled && onAbort && <button type="button" disabled={isSubmitting} onClick={() => void abort()} className="mt-2 w-full rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-sm font-bold text-rose-700 disabled:opacity-40">ゲームを中断</button>}
      {enabled && <DebugActionLog entries={debugLogEntries} />}
      {disabled && <p className="mt-2 text-xs text-slate-500">ゲーム進行中はモードの切り替えができません。</p>}
    </div></div>, document.body)}
  </>;
}

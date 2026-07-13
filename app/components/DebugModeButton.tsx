"use client";

import { useEffect, useState } from "react";

type DebugModeButtonProps = {
  enabled: boolean;
  disabled?: boolean;
  onChange: (enabled: boolean) => void | Promise<void>;
  onAbort?: () => void | Promise<void>;
};

export function DebugModeButton({ enabled, disabled = false, onChange, onAbort }: DebugModeButtonProps) {
  const [hasAccess, setHasAccess] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

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

  const toggle = async () => {
    if (disabled || isSubmitting) return;
    setIsSubmitting(true);
    try { await onChange(!enabled); } finally { setIsSubmitting(false); }
  };

  const abort = async () => {
    if (!onAbort || isSubmitting || !window.confirm("進行中のゲームを中断し、同じ部屋のゲーム開始前へ戻しますか？")) return;
    setIsSubmitting(true);
    try { await onAbort(); } finally { setIsSubmitting(false); }
  };

  return <div className="flex items-center gap-1.5" aria-label="開発者向け操作">
    <button type="button" title="デバッグモードを切り替える" onClick={() => void toggle()} disabled={disabled || isSubmitting} className={`rounded-md border px-2 py-1 font-mono text-[11px] font-medium tracking-wide transition disabled:cursor-not-allowed disabled:opacity-40 ${enabled ? "border-cyan-300/35 bg-cyan-300/10 text-cyan-100" : "border-white/10 bg-white/[0.03] text-white/45 hover:border-white/20 hover:text-white/70"}`}>
      {isSubmitting ? "WAIT" : enabled ? "DEBUG · ON" : "DEBUG"}
    </button>
    {enabled && onAbort && <button type="button" title="進行中のゲームを中断してゲーム開始前へ戻す" onClick={() => void abort()} disabled={isSubmitting} className="rounded-md border border-rose-300/20 bg-transparent px-2 py-1 text-[11px] font-medium text-rose-200/70 transition hover:border-rose-300/40 hover:bg-rose-300/10 hover:text-rose-100 disabled:opacity-40">中断</button>}
  </div>;
}

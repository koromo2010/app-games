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

  return <div className="flex items-center gap-2">
    <button type="button" onClick={() => void toggle()} disabled={disabled || isSubmitting} className={`rounded-lg border px-3 py-1.5 text-sm font-semibold shadow-sm transition disabled:cursor-not-allowed disabled:opacity-50 ${enabled ? "border-cyan-200 bg-cyan-200 text-slate-950" : "border-white/15 bg-white/10 text-cyan-50"}`}>
      {isSubmitting ? "処理中..." : enabled ? "デバッグ ON" : "デバッグ OFF"}
    </button>
    {enabled && onAbort && <button type="button" onClick={() => void abort()} disabled={isSubmitting} className="rounded-lg border border-rose-300/40 bg-rose-300/10 px-3 py-1.5 text-sm font-semibold text-rose-100 disabled:opacity-50">ゲームを中断</button>}
  </div>;
}

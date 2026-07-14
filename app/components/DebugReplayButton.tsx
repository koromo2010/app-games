"use client";

type Props = { enabled: boolean; disabled?: boolean; onChange: (enabled: boolean) => void | Promise<void> };

export function DebugReplayButton({ enabled, disabled, onChange }: Props) {
  return <button type="button" disabled={disabled} aria-pressed={enabled} onClick={() => void onChange(!enabled)} className={`fixed bottom-3 right-3 z-30 rounded-lg border px-3 py-1.5 text-xs font-bold opacity-70 shadow-lg transition hover:opacity-100 disabled:opacity-40 ${enabled ? "border-emerald-300/50 bg-emerald-950/90 text-emerald-200" : "border-white/15 bg-slate-950/90 text-slate-400"}`}>デバッグ用プレイバック {enabled ? "ON" : "OFF"}</button>;
}

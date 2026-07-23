"use client";

import { useSyncExternalStore } from "react";
import {
  getAiActivitySnapshot,
  getServerAiActivitySnapshot,
  subscribeAiActivity,
} from "@/lib/ai-activity-client";

export function AiActivityVital() {
  const activity = useSyncExternalStore(
    subscribeAiActivity,
    getAiActivitySnapshot,
    getServerAiActivitySnapshot,
  );
  const isActive = activity.activeCount > 0;
  const statusLabel = activity.activeCount > 1
    ? `AI API通信中 ${activity.activeCount}件`
    : "AI API通信中";

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={isActive ? `${statusLabel}。${activity.label}` : "AI API待機中"}
      title={isActive
        ? `${activity.label}。利用するAPI設定に応じて、個人APIまたはGame Fields提供枠の利用量が発生する場合があります。`
        : "AI APIの通信中はここが光ります。"}
      className={`inline-flex h-5 items-center gap-1.5 rounded-full border px-2 font-mono text-[10px] font-bold uppercase tracking-wide transition duration-300 ${
        isActive
          ? "border-cyan-200/80 bg-cyan-300/20 text-cyan-50 shadow-[0_0_18px_rgba(34,211,238,0.75)]"
          : "border-white/10 bg-white/[0.03] text-white/30"
      }`}
    >
      <span className="flex h-3 items-end gap-0.5" aria-hidden="true">
        <span className={`w-0.5 rounded-full bg-current ${isActive ? "h-1.5 motion-safe:animate-pulse" : "h-1"}`} />
        <span className={`w-0.5 rounded-full bg-current ${isActive ? "h-3 motion-safe:animate-pulse" : "h-1"}`} />
        <span className={`w-0.5 rounded-full bg-current ${isActive ? "h-2 motion-safe:animate-pulse" : "h-1"}`} />
        <span className={`w-0.5 rounded-full bg-current ${isActive ? "h-3 motion-safe:animate-pulse" : "h-1"}`} />
      </span>
      <span>{isActive ? "AI API" : "AI"}</span>
      {isActive && <span className="hidden sm:inline">通信中</span>}
    </div>
  );
}

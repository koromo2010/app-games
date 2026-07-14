"use client";

import { useState } from "react";
import type { GameDebugLogEntry } from "@/lib/game-debug-log";

type Props = { entries: GameDebugLogEntry[] };

function formatEntry(entry: GameDebugLogEntry) {
  const time = new Intl.DateTimeFormat("ja-JP", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(entry.timestamp);
  const transition = entry.phaseBefore === entry.phaseAfter ? entry.phaseAfter : `${entry.phaseBefore} → ${entry.phaseAfter}`;
  return `${time} [r${entry.revision}] ${entry.actorName}: ${entry.action} (${transition})`;
}

export function DebugActionLog({ entries }: Props) {
  const [copied, setCopied] = useState(false);
  const lines = entries.map(formatEntry);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  return (
    <details className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-2">
      <summary className="cursor-pointer text-xs font-bold text-slate-700">行動ログ（{entries.length}件）</summary>
      <div className="mt-2 flex items-center justify-between gap-2">
        <p className="text-[11px] text-slate-500">本文や秘密情報は記録しません。</p>
        <button type="button" disabled={entries.length === 0} onClick={() => void copy()} className="rounded border border-slate-300 bg-white px-2 py-1 text-[11px] font-bold text-slate-600 disabled:opacity-40">{copied ? "コピー済み" : "コピー"}</button>
      </div>
      <ol className="mt-2 max-h-56 space-y-1 overflow-y-auto rounded bg-slate-950 p-2 font-mono text-[10px] leading-5 text-cyan-100">
        {[...lines].reverse().map((line, index) => <li key={entries[entries.length - 1 - index]?.id ?? index}>{line}</li>)}
        {entries.length === 0 && <li className="text-slate-400">まだ操作はありません。</li>}
      </ol>
    </details>
  );
}

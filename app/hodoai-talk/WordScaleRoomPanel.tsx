"use client";

import { useState, type ReactNode } from "react";

type WordScaleRoomPanelProps = {
  playerCount: number;
  children: ReactNode;
};

export function WordScaleRoomPanel({ playerCount, children }: WordScaleRoomPanelProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {!open && (
        <button
          type="button"
          aria-label="参加者と部屋設定を開く"
          aria-controls="word-scale-room-panel"
          onClick={() => setOpen(true)}
          className="fixed left-0 top-1/2 z-30 flex -translate-y-1/2 flex-col items-center gap-2 rounded-r-xl border-y border-r border-cyan-200/40 bg-slate-950/95 px-2 py-4 text-cyan-100 shadow-[0_0_24px_rgba(34,211,238,0.3)] lg:hidden"
        >
          <span className="text-xs font-black [writing-mode:vertical-rl]">部屋情報</span>
          <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-cyan-300 px-1 text-xs font-black text-slate-950">{playerCount}</span>
        </button>
      )}
      <button
        type="button"
        aria-label="参加者と部屋設定を閉じる"
        onClick={() => setOpen(false)}
        className={`fixed inset-0 z-40 bg-slate-950/45 transition-opacity lg:hidden ${open ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"}`}
      />
      <aside
        id="word-scale-room-panel"
        className={`fixed inset-y-0 left-0 z-50 w-[min(340px,calc(100vw-2rem))] overflow-y-auto rounded-r-2xl bg-slate-950 p-3 shadow-2xl transition-transform duration-200 lg:static lg:z-auto lg:w-auto lg:translate-x-0 lg:overflow-visible lg:rounded-none lg:bg-transparent lg:p-0 lg:shadow-none ${open ? "translate-x-0" : "-translate-x-full"}`}
      >
        <div className="sticky top-0 z-10 mb-3 flex items-center justify-between rounded-xl border border-white/10 bg-slate-900 px-3 py-2 shadow-lg lg:hidden">
          <div>
            <p className="text-xs font-black uppercase tracking-wider text-cyan-300">Room</p>
            <p className="text-sm font-black text-white">参加者・部屋設定</p>
          </div>
          <button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-xs font-black text-white">閉じる</button>
        </div>
        <div className="space-y-4">{children}</div>
      </aside>
    </>
  );
}

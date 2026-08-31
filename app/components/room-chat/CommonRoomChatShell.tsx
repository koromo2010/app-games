"use client";

import { useRef, useState } from "react";
import { useAppLocale } from "@/app/components/AppLocaleProvider";
import { useKeyboardLayer } from "@/app/components/keyboard-focus-contract";
import { useCommonRoomChat } from "@/app/hooks/use-common-room-chat";
import type { OnlineRoomRealtimeGame } from "@/lib/online-room-realtime-protocol";
import { roomChatText } from "./room-chat-i18n";

export function CommonRoomChatShell({ game, code }: { game: OnlineRoomRealtimeGame; code: string }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const panelRef = useRef<HTMLElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const { locale } = useAppLocale();
  const d = roomChatText(locale);
  const chat = useCommonRoomChat({ game, code });
  useKeyboardLayer({ open, containerRef: panelRef, initialFocusRef: inputRef, onDismiss: () => setOpen(false) });
  const submit = async () => { if (await chat.send(draft)) setDraft(""); };
  return <>
    <button type="button" onClick={() => setOpen(true)} aria-expanded={open} className="fixed bottom-4 right-4 z-40 rounded-full bg-cyan-300 px-5 py-3 font-black text-slate-950 shadow-xl">{d.open}</button>
    {open && <div className="fixed inset-0 z-50 bg-slate-950/55 p-3 sm:flex sm:items-stretch sm:justify-end" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
      <aside ref={panelRef} role="dialog" aria-modal="true" aria-labelledby="room-chat-title" className="ml-auto flex h-full max-h-[calc(100dvh-1.5rem)] w-full max-w-md flex-col rounded-2xl bg-white p-4 text-slate-950 shadow-2xl">
        <div className="flex items-center justify-between"><h2 id="room-chat-title" className="text-xl font-black">{d.title}</h2><button type="button" onClick={() => setOpen(false)} className="rounded-lg border px-3 py-2 font-bold">{d.close}</button></div>
        {chat.status === "degraded" && <p role="status" className="mt-3 rounded-lg bg-amber-50 p-2 text-sm text-amber-900">{d.degraded}</p>}
        <ol role="log" aria-live="polite" aria-relevant="additions text" aria-atomic="false" className="mt-3 min-h-0 flex-1 space-y-2 overflow-y-auto rounded-xl bg-slate-50 p-3">
          {chat.messages.length === 0 && <li className="text-sm text-slate-500">{d.empty}</li>}
          {chat.messages.map((message) => <li key={message.messageId} className="rounded-lg border bg-white p-3"><b className="text-xs text-slate-500">{d.participant}</b><p dir="auto" className="whitespace-pre-wrap [unicode-bidi:plaintext]">{message.body}</p></li>)}
        </ol>
        {chat.error && <p role="alert" className="mt-2 text-sm text-rose-700">{chat.error}</p>}
        <label className="mt-3 text-sm font-bold">{d.placeholder}<textarea ref={inputRef} value={draft} maxLength={500} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void submit(); } }} className="mt-1 min-h-20 w-full rounded-xl border p-3 font-normal" /></label>
        <button type="button" disabled={chat.pending || !draft.trim()} onClick={() => void submit()} className="mt-2 rounded-xl bg-cyan-300 px-4 py-3 font-black disabled:opacity-40">{d.send}</button>
      </aside>
    </div>}
  </>;
}

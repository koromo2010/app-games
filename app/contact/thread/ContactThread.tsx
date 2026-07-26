"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import type { ContactCategory, ContactStatus } from "@/lib/contact-core";
import type { SupportThreadMessage } from "@/lib/support-thread-core";

type PublicContact = {
  id: string;
  category: ContactCategory;
  name: string;
  email: string;
  message: string;
  status: ContactStatus;
  messages: SupportThreadMessage[];
  createdAt: number;
  updatedAt: number;
};

const statusLabels: Record<ContactStatus, string> = {
  open: "オープン",
  "in-progress": "確認中",
  "waiting-user": "あなたの返信待ち",
  resolved: "対応済み",
  closed: "終了",
};

function formatDate(value: number) {
  return new Intl.DateTimeFormat("ja-JP", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function ContactThread({
  contactId,
  accessToken,
}: {
  contactId: string;
  accessToken: string;
}) {
  const [credentials] = useState(() => {
    if (contactId && accessToken) return { contactId, accessToken };
    if (typeof window === "undefined") return { contactId, accessToken };
    const hash = new URLSearchParams(window.location.hash.slice(1));
    return {
      contactId: hash.get("id") ?? "",
      accessToken: hash.get("access") ?? "",
    };
  });
  const [contact, setContact] = useState<PublicContact | null>(null);
  const [message, setMessage] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const requestIdRef = useRef<string | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    if (!credentials.contactId || !credentials.accessToken) {
      setNotice("専用URLが正しくありません。");
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const query = new URLSearchParams({
        id: credentials.contactId,
      });
      const response = await fetch(`/api/contact-thread?${query}`, {
        cache: "no-store",
        headers: {
          "X-Game-Fields-Contact-Access": credentials.accessToken,
        },
        signal,
      });
      const data = await response.json().catch(() => null) as {
        contact?: PublicContact;
      } | null;
      if (!response.ok || !data?.contact) throw new Error("LOAD_FAILED");
      setContact(data.contact);
      setNotice("");
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      setNotice("お問い合わせを確認できませんでした。専用URLをご確認ください。");
    } finally {
      setLoading(false);
    }
  }, [credentials]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => void load(controller.signal), 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [load]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const body = message.trim();
    if (!body || saving) return;
    setSaving(true);
    setNotice("");
    try {
      requestIdRef.current ??= crypto.randomUUID();
      const response = await fetch("/api/contact-thread", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contactId: credentials.contactId,
          accessToken: credentials.accessToken,
          requestId: requestIdRef.current,
          message: body,
        }),
      });
      const data = await response.json().catch(() => null) as {
        contact?: PublicContact;
      } | null;
      if (!response.ok || !data?.contact) throw new Error("REPLY_FAILED");
      requestIdRef.current = null;
      setContact(data.contact);
      setMessage("");
      setNotice("追記を送信し、状態をオープンへ戻しました。");
    } catch {
      setNotice("追記を送信できませんでした。");
    } finally {
      setSaving(false);
    }
  };

  return <div className="mt-8 space-y-5">
    {loading && <p className="rounded-lg bg-slate-100 px-4 py-3 text-sm font-bold">読み込み中…</p>}
    {notice && <p role="status" className="rounded-lg bg-slate-100 px-4 py-3 text-sm font-bold">{notice}</p>}
    {contact && <>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
        <div>
          <strong className="text-lg">{contact.id}</strong>
          <p className="mt-1 text-xs text-slate-500">{contact.email}</p>
        </div>
        <span className="rounded-full bg-cyan-100 px-3 py-1 text-xs font-black text-cyan-900">{statusLabels[contact.status]}</span>
      </div>
      <div className="space-y-3">
        <article className="ml-auto max-w-[90%] rounded-xl bg-cyan-50 p-4">
          <header className="mb-2 flex justify-between gap-4 text-xs font-bold text-cyan-900"><span>あなた</span><time>{formatDate(contact.createdAt)}</time></header>
          <p className="whitespace-pre-wrap break-words text-sm leading-7">{contact.message}</p>
        </article>
        {contact.messages.map((entry) => <article key={entry.id} className={`max-w-[90%] rounded-xl p-4 ${entry.author === "admin" ? "mr-auto border border-slate-200 bg-white" : "ml-auto bg-cyan-50"}`}>
          <header className="mb-2 flex justify-between gap-4 text-xs font-bold text-slate-600"><span>{entry.author === "admin" ? "Game Fields運営" : "あなた"}</span><time>{formatDate(entry.createdAt)}</time></header>
          <p className="whitespace-pre-wrap break-words text-sm leading-7">{entry.body}</p>
        </article>)}
      </div>
      <form className="space-y-3 border-t border-slate-200 pt-5" onSubmit={submit}>
        <label className="block text-sm font-black">追記・返信
          <textarea className="mt-2 min-h-32 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" maxLength={3_000} value={message} onChange={(event) => { requestIdRef.current = null; setMessage(event.target.value); }} />
        </label>
        <button type="submit" disabled={saving || !message.trim()} className="rounded-lg bg-cyan-700 px-5 py-3 font-black text-white disabled:opacity-40">{saving ? "送信中…" : "追記を送信"}</button>
      </form>
    </>}
  </div>;
}

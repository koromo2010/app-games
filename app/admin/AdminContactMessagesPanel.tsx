"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ensureSiteAdminStepUp } from "@/lib/site-admin-passkey-client";
import {
  contactStatuses,
  type ContactCategory,
  type ContactMessage,
  type ContactStatus,
} from "@/lib/contact-core";

const statusLabels: Record<ContactStatus, string> = {
  open: "未対応",
  "in-progress": "確認中",
  resolved: "対応済み",
  closed: "見送り・終了",
};

const categoryLabels: Record<ContactCategory, string> = {
  general: "一般",
  privacy: "個人情報・削除等",
  account: "アカウント",
  bug: "不具合",
};

type ContactFilter = "all" | ContactStatus;

export function AdminContactMessagesPanel({ onAuthExpired }: { onAuthExpired: () => void }) {
  const [contacts, setContacts] = useState<ContactMessage[]>([]);
  const [filter, setFilter] = useState<ContactFilter>("open");
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/contact-messages", { cache: "no-store", signal });
      const data = await response.json().catch(() => null) as {
        contacts?: ContactMessage[];
        error?: string;
      } | null;
      if (response.status === 401) {
        onAuthExpired();
        return;
      }
      if (!response.ok || !data?.contacts) throw new Error(data?.error || "LOAD_FAILED");
      setContacts(data.contacts);
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      setMessage("お問い合わせ一覧を読み込めませんでした。");
    } finally {
      setLoading(false);
    }
  }, [onAuthExpired]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => void load(controller.signal), 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [load]);

  const visibleContacts = useMemo(
    () => filter === "all" ? contacts : contacts.filter((contact) => contact.status === filter),
    [contacts, filter],
  );

  const updateStatus = async (contact: ContactMessage, status: ContactStatus) => {
    if (savingId || contact.status === status) return;
    setSavingId(contact.id);
    setMessage("");
    try {
      await ensureSiteAdminStepUp();
      const response = await fetch("/api/admin/contact-messages", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactId: contact.id, status }),
      });
      const data = await response.json().catch(() => null) as {
        contact?: ContactMessage;
        error?: string;
      } | null;
      if (response.status === 401) {
        onAuthExpired();
        return;
      }
      if (!response.ok || !data?.contact) throw new Error(data?.error || "SAVE_FAILED");
      setContacts((current) => current.map((entry) => entry.id === data.contact!.id ? data.contact! : entry));
      setMessage(`「${contact.message.slice(0, 30)}」を${statusLabels[status]}に更新しました。`);
    } catch (error) {
      if (error instanceof Error && error.message === "ADMIN_AUTH_REQUIRED") onAuthExpired();
      setMessage("対応状態を更新できませんでした。");
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-5 px-4 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black">お問い合わせ</h2>
          <p className="mt-1 text-sm leading-6 text-slate-400">お問い合わせフォームの内容を新しい順に表示します。通知メールが失敗しても、ここには保存されます。</p>
        </div>
        <button type="button" onClick={() => void load()} disabled={loading} className="rounded-lg border border-white/15 px-4 py-2 text-sm font-bold text-slate-200 hover:bg-white/10 disabled:opacity-40">{loading ? "読込中…" : "再読み込み"}</button>
      </div>
      <div className="flex gap-2 overflow-x-auto" role="tablist" aria-label="お問い合わせの対応状態">
        {(["all", ...contactStatuses] as const).map((value) => {
          const count = value === "all" ? contacts.length : contacts.filter((contact) => contact.status === value).length;
          return <button key={value} type="button" role="tab" aria-selected={filter === value} onClick={() => setFilter(value)} className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm font-bold ${filter === value ? "bg-cyan-300 text-slate-950" : "border border-white/15 text-slate-300 hover:bg-white/10"}`}>{value === "all" ? "すべて" : statusLabels[value]} {count}</button>;
        })}
      </div>
      {message && <p role="status" className="rounded-xl border border-cyan-300/25 bg-cyan-300/10 px-4 py-3 text-sm text-cyan-50">{message}</p>}
      <div className="space-y-3">
        {visibleContacts.map((contact) => (
          <details key={contact.id} className="rounded-xl border border-white/10 bg-white/[0.05] p-4">
            <summary className="cursor-pointer list-none">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap gap-2 text-xs font-bold">
                    <span className="rounded-full bg-violet-300/15 px-2 py-1 text-violet-200">{categoryLabels[contact.category]}</span>
                    <span className="rounded-full bg-white/10 px-2 py-1 text-slate-300">{statusLabels[contact.status]}</span>
                    {contact.notificationStatus === "failed" && <span className="rounded-full bg-amber-300/15 px-2 py-1 text-amber-200">通知メール失敗</span>}
                  </div>
                  <p className="mt-2 break-words font-black">{contact.message.slice(0, 100)}{contact.message.length > 100 ? "…" : ""}</p>
                  <p className="mt-1 text-xs text-slate-400">{contact.name || "名前未入力"} ／ {contact.email}</p>
                </div>
                <time className="text-xs text-slate-400">{new Intl.DateTimeFormat("ja-JP", { dateStyle: "medium", timeStyle: "short" }).format(new Date(contact.createdAt))}</time>
              </div>
            </summary>
            <div className="mt-4 space-y-4 border-t border-white/10 pt-4">
              <p className="whitespace-pre-wrap break-words text-sm leading-6 text-slate-200">{contact.message}</p>
              <p className="text-xs text-slate-500">お問い合わせID: {contact.id} ／ 通知: {contact.notificationStatus}</p>
              <div className="flex flex-wrap gap-2" aria-label="対応状態を変更">
                {contactStatuses.map((status) => <button key={status} type="button" disabled={savingId !== null || contact.status === status} onClick={() => void updateStatus(contact, status)} className="rounded-lg border border-white/15 px-3 py-2 text-xs font-bold text-slate-200 hover:bg-white/10 disabled:opacity-40">{statusLabels[status]}</button>)}
              </div>
            </div>
          </details>
        ))}
        {!loading && !visibleContacts.length && <p className="rounded-xl border border-white/10 bg-white/[0.05] px-4 py-12 text-center text-sm text-slate-400">この状態のお問い合わせはありません。</p>}
      </div>
    </div>
  );
}

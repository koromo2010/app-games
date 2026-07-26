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
  open: "オープン",
  "in-progress": "確認中",
  "waiting-user": "ユーザー返信待ち",
  resolved: "対応済み",
  closed: "見送り・終了",
};

const categoryLabels: Record<ContactCategory, string> = {
  general: "一般",
  privacy: "個人情報・削除等",
  account: "アカウント",
  bug: "不具合",
};

const notificationErrorLabels: Record<string, string> = {
  EMAIL_SERVICE_NOT_CONFIGURED: "メール送信サービスが設定されていません",
  OPERATIONS_EMAIL_RECIPIENT_LOOKUP_FAILED: "管理者メールの取得に失敗しました",
  OPERATIONS_EMAIL_RECIPIENTS_NOT_CONFIGURED: "受信対象の管理者が見つかりません",
  EMAIL_PROVIDER_AUTH_FAILED: "メール送信サービスの認証に失敗しました",
  EMAIL_SENDER_NOT_VERIFIED: "送信元ドメインが未確認です",
  EMAIL_RECIPIENT_RESTRICTED: "宛先が送信制限の対象です",
  EMAIL_DELIVERY_QUOTA_EXCEEDED: "メール送信上限に達しました",
  EMAIL_DELIVERY_RATE_LIMITED: "メール送信が一時的に制限されています",
  EMAIL_SEND_FAILED: "メールサービスが送信を受理しませんでした",
};

type ContactFilter = "all" | ContactStatus;

export function AdminContactMessagesPanel({ onAuthExpired }: { onAuthExpired: () => void }) {
  const [contacts, setContacts] = useState<ContactMessage[]>([]);
  const [filter, setFilter] = useState<ContactFilter>("open");
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [replyStatuses, setReplyStatuses] = useState<Record<string, ContactStatus>>({});
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

  const retryNotification = async (contact: ContactMessage) => {
    if (savingId) return;
    setSavingId(contact.id);
    setMessage("");
    try {
      await ensureSiteAdminStepUp();
      const response = await fetch("/api/admin/contact-messages", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contactId: contact.id,
          requestId: crypto.randomUUID(),
        }),
      });
      const data = await response.json().catch(() => null) as {
        contact?: ContactMessage;
        deliveryStatus?: "sent" | "failed";
        errorCode?: string | null;
        error?: string;
      } | null;
      if (response.status === 401) {
        onAuthExpired();
        return;
      }
      if (!response.ok || !data?.contact) {
        throw new Error(data?.error || "NOTIFICATION_RETRY_FAILED");
      }
      setContacts((current) => current.map((entry) => (
        entry.id === data.contact!.id ? data.contact! : entry
      )));
      if (data.deliveryStatus === "sent") {
        setMessage(`「${contact.id}」の管理者通知を再送しました。`);
      } else {
        const reason = data.errorCode
          ? notificationErrorLabels[data.errorCode] ?? data.errorCode
          : "原因不明";
        setMessage(`管理者通知の再送に失敗しました：${reason}`);
      }
    } catch (error) {
      if (
        error instanceof Error
        && error.message === "ADMIN_AUTH_REQUIRED"
      ) {
        onAuthExpired();
      }
      setMessage("管理者通知を再送できませんでした。");
    } finally {
      setSavingId(null);
    }
  };

  const sendReply = async (contact: ContactMessage) => {
    const reply = drafts[contact.id]?.trim() ?? "";
    if (!reply || savingId) return;
    setSavingId(contact.id);
    setMessage("");
    try {
      await ensureSiteAdminStepUp();
      const response = await fetch("/api/admin/contact-messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contactId: contact.id,
          requestId: crypto.randomUUID(),
          message: reply,
          status: replyStatuses[contact.id] ?? "waiting-user",
        }),
      });
      const data = await response.json().catch(() => null) as {
        contact?: ContactMessage;
        deliveryStatus?: "sent" | "failed";
        error?: string;
      } | null;
      if (response.status === 401) {
        onAuthExpired();
        return;
      }
      if (!response.ok || !data?.contact) {
        throw new Error(data?.error || "REPLY_FAILED");
      }
      setContacts((current) => current.map((entry) => (
        entry.id === data.contact!.id ? data.contact! : entry
      )));
      setDrafts((current) => ({ ...current, [contact.id]: "" }));
      setMessage(data.deliveryStatus === "failed"
        ? "返信は保存しましたが、メール送信に失敗しました。管理画面の会話履歴には残っています。"
        : `「${contact.id}」へ返信しました。`);
    } catch (error) {
      if (error instanceof Error && error.message === "ADMIN_AUTH_REQUIRED") {
        onAuthExpired();
      }
      setMessage("返信を送信できませんでした。");
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
              <div className="space-y-2 rounded-xl bg-slate-950/45 p-3">
                <p className="text-xs font-bold text-slate-500">やりとり</p>
                <article className="ml-auto max-w-[90%] rounded-lg bg-cyan-300/10 p-3">
                  <div className="flex justify-between gap-3 text-xs font-bold text-cyan-100"><span>問い合わせ者</span><time>{new Intl.DateTimeFormat("ja-JP", { dateStyle: "short", timeStyle: "short" }).format(new Date(contact.createdAt))}</time></div>
                  <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-slate-200">{contact.message}</p>
                </article>
                {contact.messages.map((entry) => <article key={entry.id} className={`max-w-[90%] rounded-lg p-3 ${entry.author === "admin" ? "mr-auto border border-white/10 bg-white/[0.04]" : "ml-auto bg-cyan-300/10"}`}>
                  <div className="flex justify-between gap-3 text-xs font-bold text-slate-400"><span>{entry.author === "admin" ? "運営" : "問い合わせ者"}</span><time>{new Intl.DateTimeFormat("ja-JP", { dateStyle: "short", timeStyle: "short" }).format(new Date(entry.createdAt))}</time></div>
                  <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-slate-200">{entry.body}</p>
                  {entry.author === "admin" && entry.deliveryStatus === "failed" && <p className="mt-2 text-xs font-bold text-amber-200">メール送信失敗</p>}
                </article>)}
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-xs text-slate-500">
                  <p>お問い合わせID: {contact.id} ／ 管理者通知: {contact.notificationStatus}</p>
                  {contact.notificationAttemptedAt && <p className="mt-1">最終試行: {new Intl.DateTimeFormat("ja-JP", { dateStyle: "medium", timeStyle: "short" }).format(new Date(contact.notificationAttemptedAt))}</p>}
                  {contact.notificationErrorCode && <p className="mt-1 font-bold text-amber-200">失敗理由: {notificationErrorLabels[contact.notificationErrorCode] ?? contact.notificationErrorCode} <span className="font-mono font-normal text-amber-100/70">({contact.notificationErrorCode})</span></p>}
                </div>
                <button type="button" disabled={savingId !== null} onClick={() => void retryNotification(contact)} className="rounded-lg border border-amber-300/40 px-3 py-2 text-xs font-bold text-amber-100 hover:bg-amber-300/10 disabled:opacity-40">{savingId === contact.id ? "再送中…" : "管理者通知を再送"}</button>
              </div>
              <div className="flex flex-wrap gap-2" aria-label="対応状態を変更">
                {contactStatuses.map((status) => <button key={status} type="button" disabled={savingId !== null || contact.status === status} onClick={() => void updateStatus(contact, status)} className="rounded-lg border border-white/15 px-3 py-2 text-xs font-bold text-slate-200 hover:bg-white/10 disabled:opacity-40">{statusLabels[status]}</button>)}
              </div>
              <form className="space-y-3 border-t border-white/10 pt-4" onSubmit={(event) => {
                event.preventDefault();
                void sendReply(contact);
              }}>
                <label className="block text-xs font-bold text-slate-400">返信（メールと専用会話ページへ送信）
                  <textarea value={drafts[contact.id] ?? ""} onChange={(event) => setDrafts((current) => ({ ...current, [contact.id]: event.target.value }))} maxLength={3000} className="mt-2 min-h-28 w-full rounded-lg border border-white/15 bg-slate-950/70 px-3 py-2 text-sm font-normal text-white" placeholder="回答や追加で必要な情報を入力" />
                </label>
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <label className="text-xs font-bold text-slate-400">返信後の状態
                    <select value={replyStatuses[contact.id] ?? "waiting-user"} onChange={(event) => setReplyStatuses((current) => ({ ...current, [contact.id]: event.target.value as ContactStatus }))} className="mt-1 block rounded-lg border border-white/15 bg-slate-900 px-3 py-2 text-sm text-white">
                      {contactStatuses.map((status) => <option key={status} value={status}>{statusLabels[status]}</option>)}
                    </select>
                  </label>
                  <button type="submit" disabled={savingId !== null || !(drafts[contact.id]?.trim())} className="rounded-lg bg-cyan-300 px-4 py-2 text-sm font-black text-slate-950 disabled:opacity-40">{savingId === contact.id ? "送信中…" : "返信を送信"}</button>
                </div>
              </form>
            </div>
          </details>
        ))}
        {!loading && !visibleContacts.length && <p className="rounded-xl border border-white/10 bg-white/[0.05] px-4 py-12 text-center text-sm text-slate-400">この状態のお問い合わせはありません。</p>}
      </div>
    </div>
  );
}

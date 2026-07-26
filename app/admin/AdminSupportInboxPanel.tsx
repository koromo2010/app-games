"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { adminNotificationErrorLabels } from "@/lib/admin-notification-labels";
import {
  contactStatuses,
  type ContactCategory,
  type ContactMessage,
} from "@/lib/contact-core";
import { ensureSiteAdminStepUp } from "@/lib/site-admin-passkey-client";
import {
  type UserReport,
  type UserReportStatus,
  type UserReportType,
} from "@/lib/user-report-core";

const statusLabels: Record<UserReportStatus, string> = {
  open: "オープン",
  "in-progress": "確認中",
  "waiting-user": "ユーザー返信待ち",
  resolved: "対応済み",
  closed: "見送り・終了",
};

const reportTypeLabels: Record<UserReportType, string> = {
  bug: "バグ報告",
  request: "改善要望",
};

const contactCategoryLabels: Record<ContactCategory, string> = {
  general: "一般問い合わせ",
  privacy: "個人情報・削除等",
  account: "アカウント",
  bug: "不具合問い合わせ",
};

type SupportFilter = "all" | UserReportStatus;
type SupportItem =
  | { kind: "report"; report: UserReport }
  | { kind: "contact"; contact: ContactMessage };
type ReplyMessage = {
  tone: "success" | "error";
  text: string;
};

function recordFor(item: SupportItem) {
  return item.kind === "report" ? item.report : item.contact;
}

function replaceItem(items: SupportItem[], updated: SupportItem) {
  const updatedRecord = recordFor(updated);
  return items.map((item) => {
    const current = recordFor(item);
    return current.id === updatedRecord.id ? updated : item;
  });
}

function displayKind(item: SupportItem) {
  return item.kind === "report"
    ? reportTypeLabels[item.report.type]
    : contactCategoryLabels[item.contact.category];
}

function initialBody(item: SupportItem) {
  if (item.kind === "report") {
    return item.report.details || item.report.summary;
  }
  return item.contact.message;
}

function initialAuthor(item: SupportItem) {
  return item.kind === "report" ? "報告者" : "問い合わせ者";
}

function itemSummary(item: SupportItem) {
  if (item.kind === "report") return item.report.summary;
  const message = item.contact.message;
  return `${message.slice(0, 100)}${message.length > 100 ? "…" : ""}`;
}

function itemContext(item: SupportItem) {
  if (item.kind === "report") {
    return item.report.page || "ページ情報なし";
  }
  return `${item.contact.name || "名前未入力"} ／ ${item.contact.email}`;
}

export function AdminSupportInboxPanel({
  onAuthExpired,
}: {
  onAuthExpired: () => void;
}) {
  const [items, setItems] = useState<SupportItem[]>([]);
  const [filter, setFilter] = useState<SupportFilter>("open");
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [replyStatuses, setReplyStatuses] = useState<
    Record<string, UserReportStatus>
  >({});
  const [replyMessages, setReplyMessages] = useState<
    Record<string, ReplyMessage>
  >({});
  const replyRequestIds = useRef<Record<string, string>>({});
  const [message, setMessage] = useState("");

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setMessage("");
    try {
      const [reportResponse, contactResponse] = await Promise.all([
        fetch("/api/admin/user-reports", { cache: "no-store", signal }),
        fetch("/api/admin/contact-messages", { cache: "no-store", signal }),
      ]);
      if (reportResponse.status === 401 || contactResponse.status === 401) {
        onAuthExpired();
        return;
      }
      const [reportData, contactData] = await Promise.all([
        reportResponse.json().catch(() => null) as Promise<{
          reports?: UserReport[];
          error?: string;
        } | null>,
        contactResponse.json().catch(() => null) as Promise<{
          contacts?: ContactMessage[];
          error?: string;
        } | null>,
      ]);
      if (
        !reportResponse.ok
        || !contactResponse.ok
        || !reportData?.reports
        || !contactData?.contacts
      ) {
        throw new Error(
          reportData?.error ?? contactData?.error ?? "LOAD_FAILED",
        );
      }
      setItems([
        ...reportData.reports.map(
          (report): SupportItem => ({ kind: "report", report }),
        ),
        ...contactData.contacts.map(
          (contact): SupportItem => ({ kind: "contact", contact }),
        ),
      ].sort((left, right) => (
        recordFor(right).createdAt - recordFor(left).createdAt
      )));
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      setMessage("問い合わせ・報告の一覧を読み込めませんでした。");
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

  const visibleItems = useMemo(
    () => filter === "all"
      ? items
      : items.filter((item) => recordFor(item).status === filter),
    [filter, items],
  );

  const updateStatus = async (
    item: SupportItem,
    status: UserReportStatus,
  ) => {
    const record = recordFor(item);
    if (savingId || record.status === status) return;
    setSavingId(record.id);
    setMessage("");
    try {
      await ensureSiteAdminStepUp();
      const response = await fetch(
        item.kind === "report"
          ? "/api/admin/user-reports"
          : "/api/admin/contact-messages",
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(item.kind === "report"
            ? { reportId: record.id, status }
            : { contactId: record.id, status }),
        },
      );
      const data = await response.json().catch(() => null) as {
        report?: UserReport;
        contact?: ContactMessage;
        error?: string;
      } | null;
      if (response.status === 401) {
        onAuthExpired();
        return;
      }
      const updated = item.kind === "report"
        ? data?.report && { kind: "report" as const, report: data.report }
        : data?.contact && { kind: "contact" as const, contact: data.contact };
      if (!response.ok || !updated) {
        throw new Error(data?.error || "SAVE_FAILED");
      }
      setItems((current) => replaceItem(current, updated));
      setMessage(`「${itemSummary(item)}」を${statusLabels[status]}に更新しました。`);
    } catch (error) {
      if (
        error instanceof Error
        && error.message === "ADMIN_AUTH_REQUIRED"
      ) {
        onAuthExpired();
      }
      setMessage("対応状態を更新できませんでした。");
    } finally {
      setSavingId(null);
    }
  };

  const retryNotification = async (item: SupportItem) => {
    const record = recordFor(item);
    if (savingId) return;
    setSavingId(record.id);
    setMessage("");
    try {
      await ensureSiteAdminStepUp();
      const response = await fetch(
        item.kind === "report"
          ? "/api/admin/user-reports"
          : "/api/admin/contact-messages",
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(item.kind === "report"
            ? { reportId: record.id, requestId: crypto.randomUUID() }
            : { contactId: record.id, requestId: crypto.randomUUID() }),
        },
      );
      const data = await response.json().catch(() => null) as {
        report?: UserReport;
        contact?: ContactMessage;
        deliveryStatus?: "sent" | "failed";
        errorCode?: string | null;
        error?: string;
      } | null;
      if (response.status === 401) {
        onAuthExpired();
        return;
      }
      const updated = item.kind === "report"
        ? data?.report && { kind: "report" as const, report: data.report }
        : data?.contact && { kind: "contact" as const, contact: data.contact };
      if (!response.ok || !updated) {
        throw new Error(data?.error || "NOTIFICATION_RETRY_FAILED");
      }
      setItems((current) => replaceItem(current, updated));
      if (data?.deliveryStatus === "sent") {
        setMessage(`「${record.id}」の管理者通知を再送しました。`);
      } else {
        const reason = data?.errorCode
          ? adminNotificationErrorLabels[data.errorCode] ?? data.errorCode
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

  const sendReply = async (item: SupportItem) => {
    const record = recordFor(item);
    const reply = drafts[record.id]?.trim() ?? "";
    if (!reply || savingId) return;
    setSavingId(record.id);
    setMessage("");
    setReplyMessages((current) => {
      const next = { ...current };
      delete next[record.id];
      return next;
    });
    try {
      const requestId = replyRequestIds.current[record.id]
        ?? crypto.randomUUID();
      replyRequestIds.current[record.id] = requestId;
      const response = await fetch(
        item.kind === "report"
          ? "/api/admin/user-reports"
          : "/api/admin/contact-messages",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(item.kind === "report"
            ? {
              reportId: record.id,
              requestId,
              message: reply,
              status: replyStatuses[record.id] ?? "waiting-user",
            }
            : {
              contactId: record.id,
              requestId,
              message: reply,
              status: replyStatuses[record.id] ?? "waiting-user",
            }),
        },
      );
      const data = await response.json().catch(() => null) as {
        report?: UserReport;
        contact?: ContactMessage;
        deliveryStatus?: "sent" | "failed" | "not-required";
        error?: string;
      } | null;
      if (response.status === 401) {
        onAuthExpired();
        return;
      }
      const updated = item.kind === "report"
        ? data?.report && { kind: "report" as const, report: data.report }
        : data?.contact && { kind: "contact" as const, contact: data.contact };
      if (!response.ok || !updated) {
        throw new Error(data?.error || "REPLY_FAILED");
      }
      setItems((current) => replaceItem(current, updated));
      setDrafts((current) => ({ ...current, [record.id]: "" }));
      delete replyRequestIds.current[record.id];
      setReplyMessages((current) => ({
        ...current,
        [record.id]: {
          tone: "success",
          text: data?.deliveryStatus === "failed"
            ? "返信は保存しましたが、メール通知に失敗しました。"
            : data?.deliveryStatus === "not-required"
              ? "返信は保存しました。確認済みメールがないため、メール通知は送っていません。"
              : `「${itemSummary(item)}」へ返信し、メールでも通知しました。`,
        },
      }));
    } catch (error) {
      if (
        error instanceof Error
        && error.message === "ADMIN_AUTH_REQUIRED"
      ) {
        onAuthExpired();
      }
      setReplyMessages((current) => ({
        ...current,
        [record.id]: {
          tone: "error",
          text: "返信を送信できませんでした。入力内容は残っています。もう一度お試しください。",
        },
      }));
    } finally {
      setSavingId(null);
    }
  };

  const retryReplyEmail = async (
    item: SupportItem,
    messageId: string,
  ) => {
    const record = recordFor(item);
    if (savingId) return;
    setSavingId(record.id);
    setReplyMessages((current) => {
      const next = { ...current };
      delete next[record.id];
      return next;
    });
    try {
      const response = await fetch(
        item.kind === "report"
          ? "/api/admin/user-reports"
          : "/api/admin/contact-messages",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(item.kind === "report"
            ? {
              action: "retry-email",
              reportId: record.id,
              messageId,
              requestId: crypto.randomUUID(),
            }
            : {
              action: "retry-email",
              contactId: record.id,
              messageId,
              requestId: crypto.randomUUID(),
            }),
        },
      );
      const data = await response.json().catch(() => null) as {
        report?: UserReport;
        contact?: ContactMessage;
        deliveryStatus?: "sent" | "failed" | "not-required";
        error?: string;
      } | null;
      if (response.status === 401) {
        onAuthExpired();
        return;
      }
      const updated = item.kind === "report"
        ? data?.report && { kind: "report" as const, report: data.report }
        : data?.contact && { kind: "contact" as const, contact: data.contact };
      if (!response.ok || !updated) {
        throw new Error(data?.error || "REPLY_EMAIL_RETRY_FAILED");
      }
      const deliveryStatus = data?.deliveryStatus;
      setItems((current) => replaceItem(current, updated));
      setReplyMessages((current) => ({
        ...current,
        [record.id]: {
          tone: deliveryStatus === "failed" ? "error" : "success",
          text: deliveryStatus === "sent"
            ? "保存済みの返信メールだけを再送しました。会話履歴は増えていません。"
            : deliveryStatus === "not-required"
              ? "確認済みメールがないため、会話履歴のみ維持しています。"
              : "返信メールの再送に失敗しました。会話履歴は保持されています。",
        },
      }));
    } catch {
      setReplyMessages((current) => ({
        ...current,
        [record.id]: {
          tone: "error",
          text: "返信メールを再送できませんでした。会話履歴は保持されています。",
        },
      }));
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-5 px-4 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black">問い合わせ・報告</h2>
          <p className="mt-1 text-sm leading-6 text-slate-400">
            問い合わせ、改善要望、バグ報告を新しい順にまとめて表示します。通知メールが失敗しても、会話はここに保存されます。
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="rounded-lg border border-white/15 px-4 py-2 text-sm font-bold text-slate-200 hover:bg-white/10 disabled:opacity-40"
        >
          {loading ? "読込中…" : "再読み込み"}
        </button>
      </div>
      <div
        className="flex gap-2 overflow-x-auto"
        role="tablist"
        aria-label="問い合わせ・報告の対応状態"
      >
        {(["all", ...contactStatuses] as const).map((value) => {
          const count = value === "all"
            ? items.length
            : items.filter((item) => recordFor(item).status === value).length;
          return (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={filter === value}
              onClick={() => setFilter(value)}
              className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm font-bold ${
                filter === value
                  ? "bg-cyan-300 text-slate-950"
                  : "border border-white/15 text-slate-300 hover:bg-white/10"
              }`}
            >
              {value === "all" ? "すべて" : statusLabels[value]} {count}
            </button>
          );
        })}
      </div>
      {message && (
        <p
          role="status"
          className="rounded-xl border border-cyan-300/25 bg-cyan-300/10 px-4 py-3 text-sm text-cyan-50"
        >
          {message}
        </p>
      )}
      <div className="space-y-3">
        {visibleItems.map((item) => {
          const record = recordFor(item);
          const author = initialAuthor(item);
          return (
            <details
              key={record.id}
              className="rounded-xl border border-white/10 bg-white/[0.05] p-4"
            >
              <summary className="cursor-pointer list-none">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap gap-2 text-xs font-bold">
                      <span className={`rounded-full px-2 py-1 ${
                        item.kind === "report"
                          ? "bg-rose-300/15 text-rose-200"
                          : "bg-violet-300/15 text-violet-200"
                      }`}>
                        {displayKind(item)}
                      </span>
                      <span className="rounded-full bg-white/10 px-2 py-1 text-slate-300">
                        {statusLabels[record.status]}
                      </span>
                      {record.notificationStatus === "failed" && (
                        <span className="rounded-full bg-amber-300/15 px-2 py-1 text-amber-200">
                          管理者通知失敗
                        </span>
                      )}
                    </div>
                    <p className="mt-2 break-words font-black">
                      {itemSummary(item)}
                    </p>
                    <p className="mt-1 text-xs text-slate-400">
                      {itemContext(item)}
                    </p>
                  </div>
                  <time className="text-xs text-slate-400">
                    {new Intl.DateTimeFormat("ja-JP", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    }).format(new Date(record.createdAt))}
                  </time>
                </div>
              </summary>
              <div className="mt-4 space-y-4 border-t border-white/10 pt-4">
                <div>
                  <p className="text-xs font-bold text-slate-500">内容</p>
                  <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-slate-200">
                    {initialBody(item)}
                  </p>
                </div>
                <div className="space-y-2 rounded-xl bg-slate-950/45 p-3">
                  <p className="text-xs font-bold text-slate-500">やりとり</p>
                  <article className="ml-auto max-w-[90%] rounded-lg bg-cyan-300/10 p-3">
                    <div className="flex justify-between gap-3 text-xs font-bold text-cyan-100">
                      <span>{author}</span>
                      <time>
                        {new Intl.DateTimeFormat("ja-JP", {
                          dateStyle: "short",
                          timeStyle: "short",
                        }).format(new Date(record.createdAt))}
                      </time>
                    </div>
                    <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-slate-200">
                      {initialBody(item)}
                    </p>
                  </article>
                  {record.messages.map((entry) => (
                    <article
                      key={entry.id}
                      className={`max-w-[90%] rounded-lg p-3 ${
                        entry.author === "admin"
                          ? "mr-auto border border-white/10 bg-white/[0.04]"
                          : "ml-auto bg-cyan-300/10"
                      }`}
                    >
                      <div className="flex justify-between gap-3 text-xs font-bold text-slate-400">
                        <span>
                          {entry.author === "admin" ? "運営" : author}
                        </span>
                        <time>
                          {new Intl.DateTimeFormat("ja-JP", {
                            dateStyle: "short",
                            timeStyle: "short",
                          }).format(new Date(entry.createdAt))}
                        </time>
                      </div>
                      <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-slate-200">
                        {entry.body}
                      </p>
                      {entry.author === "admin"
                        && (
                          entry.deliveryStatus === "failed"
                          || entry.deliveryStatus === "pending"
                        ) && (
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <p className="text-xs font-bold text-amber-200">
                            {entry.deliveryStatus === "failed"
                              ? "メール通知失敗"
                              : "メール通知状態が未確定"}
                          </p>
                          <button
                            type="button"
                            disabled={savingId !== null}
                            onClick={() => void retryReplyEmail(
                              item,
                              entry.id,
                            )}
                            className="rounded-md border border-amber-300/40 px-2 py-1 text-xs font-bold text-amber-100 hover:bg-amber-300/10 disabled:opacity-40"
                          >
                            {savingId === record.id
                              ? "再送中…"
                              : "返信メールだけ再送"}
                          </button>
                        </div>
                      )}
                      {entry.author === "admin"
                        && entry.deliveryStatus === "not-required" && (
                        <p className="mt-2 text-xs text-slate-500">
                          確認済みメールなし・会話画面のみ
                        </p>
                      )}
                    </article>
                  ))}
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="text-xs text-slate-500">
                    <p>
                      ID: {record.id} ／ 管理者通知: {record.notificationStatus}
                    </p>
                    {record.notificationAttemptedAt && (
                      <p className="mt-1">
                        最終試行: {new Intl.DateTimeFormat("ja-JP", {
                          dateStyle: "medium",
                          timeStyle: "short",
                        }).format(new Date(record.notificationAttemptedAt))}
                      </p>
                    )}
                    {record.notificationErrorCode && (
                      <p className="mt-1 font-bold text-amber-200">
                        失敗理由: {
                          adminNotificationErrorLabels[
                            record.notificationErrorCode
                          ] ?? record.notificationErrorCode
                        }{" "}
                        <span className="font-mono font-normal text-amber-100/70">
                          ({record.notificationErrorCode})
                        </span>
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    disabled={savingId !== null}
                    onClick={() => void retryNotification(item)}
                    className="rounded-lg border border-amber-300/40 px-3 py-2 text-xs font-bold text-amber-100 hover:bg-amber-300/10 disabled:opacity-40"
                  >
                    {savingId === record.id ? "再送中…" : "管理者通知を再送"}
                  </button>
                </div>
                <div
                  className="flex flex-wrap gap-2"
                  aria-label="対応状態を変更"
                >
                  {contactStatuses.map((status) => (
                    <button
                      key={status}
                      type="button"
                      disabled={
                        savingId !== null || record.status === status
                      }
                      onClick={() => void updateStatus(item, status)}
                      className="rounded-lg border border-white/15 px-3 py-2 text-xs font-bold text-slate-200 hover:bg-white/10 disabled:opacity-40"
                    >
                      {statusLabels[status]}
                    </button>
                  ))}
                </div>
                <form
                  className="space-y-3 border-t border-white/10 pt-4"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void sendReply(item);
                  }}
                >
                  {replyMessages[record.id] && (
                    <p
                      role="status"
                      className={`rounded-lg border px-3 py-2 text-sm ${
                        replyMessages[record.id].tone === "error"
                          ? "border-rose-300/30 bg-rose-300/10 text-rose-100"
                          : "border-emerald-300/30 bg-emerald-300/10 text-emerald-100"
                      }`}
                    >
                      {replyMessages[record.id].text}
                    </p>
                  )}
                  <label className="block text-xs font-bold text-slate-400">
                    返信（会話履歴へ保存し、登録メールにも通知）
                    <textarea
                      value={drafts[record.id] ?? ""}
                      onChange={(event) => setDrafts((current) => ({
                        ...current,
                        [record.id]: event.target.value,
                      }))}
                      maxLength={3000}
                      className="mt-2 min-h-28 w-full rounded-lg border border-white/15 bg-slate-950/70 px-3 py-2 text-sm font-normal text-white"
                      placeholder="回答や追加で必要な情報を入力"
                    />
                  </label>
                  <div className="flex flex-wrap items-end justify-between gap-3">
                    <label className="text-xs font-bold text-slate-400">
                      返信後の状態
                      <select
                        value={replyStatuses[record.id] ?? "waiting-user"}
                        onChange={(event) => setReplyStatuses((current) => ({
                          ...current,
                          [record.id]: event.target.value as UserReportStatus,
                        }))}
                        className="mt-1 block rounded-lg border border-white/15 bg-slate-900 px-3 py-2 text-sm text-white"
                      >
                        {contactStatuses.map((status) => (
                          <option key={status} value={status}>
                            {statusLabels[status]}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      type="submit"
                      disabled={
                        savingId !== null || !(drafts[record.id]?.trim())
                      }
                      className="rounded-lg bg-cyan-300 px-4 py-2 text-sm font-black text-slate-950 disabled:opacity-40"
                    >
                      {savingId === record.id ? "送信中…" : "返信を送信"}
                    </button>
                  </div>
                </form>
              </div>
            </details>
          );
        })}
        {!loading && !visibleItems.length && (
          <p className="rounded-xl border border-white/10 bg-white/[0.05] px-4 py-12 text-center text-sm text-slate-400">
            この状態の問い合わせ・報告はありません。
          </p>
        )}
      </div>
    </div>
  );
}

"use client";

import { useRef, useState } from "react";
import {
  loadUserReportFormDraft,
  saveUserReportFormDraft,
  type UserReportFormType,
} from "@/lib/user-report-form-draft";
import { SUPPORT_TEXT_LIMITS } from "@/config/support-text-contract";
import { useAppLocale } from "./AppLocaleProvider";
import { useKeyboardLayer } from "./keyboard-focus-contract";

export function UserReportButton({ variant = "banner" }: { variant?: "banner" | "menu" }) {
  const { locale } = useAppLocale();
  const en = locale === "en";
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<UserReportFormType>("bug");
  const [summary, setSummary] = useState("");
  const [details, setDetails] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [lastReportId, setLastReportId] = useState("");
  const requestIdRef = useRef<string | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const summaryRef = useRef<HTMLInputElement>(null);
  const summaryTooLong = summary.length > SUPPORT_TEXT_LIMITS.summary;
  const detailsTooLong = details.length > SUPPORT_TEXT_LIMITS.details;
  const textInvalid = summaryTooLong || detailsTooLong;

  const openReportForm = () => {
    const draft = loadUserReportFormDraft();
    if (draft) {
      setType(draft.type);
      setSummary(draft.summary);
      setDetails(draft.details);
      requestIdRef.current = draft.requestId ?? null;
    }
    setOpen(true);
    setMessage("");
    setLastReportId("");
  };

  useKeyboardLayer({ open, containerRef: dialogRef, initialFocusRef: summaryRef, restoreFallbackRef: triggerRef, onDismiss: () => setOpen(false) });

  const submit = async () => {
    if (!summary.trim() || textInvalid) {
      setMessage(en
        ? "Please shorten the highlighted field before sending."
        : "文字数上限を超えた項目を修正してください。");
      return;
    }
    setIsSaving(true);
    setMessage("");
    try {
      requestIdRef.current ??= crypto.randomUUID();
      saveUserReportFormDraft({
        type,
        summary,
        details,
        requestId: requestIdRef.current,
      });
      const response = await fetch("/api/user-reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestId: requestIdRef.current,
          type,
          summary,
          details,
          page: window.location.pathname,
        }),
      });
      const data = await response.json().catch(() => null) as {
        report?: { id?: string };
        error?: string;
        field?: string;
        limit?: number;
      } | null;
      if (!response.ok) {
        if (data?.error === "support_text_too_long") {
          setMessage(en
            ? `${data.field ?? "Text"} exceeds the ${data.limit ?? "configured"} character limit.`
            : `${data.field ?? "入力"}は${data.limit ?? "規定"}文字以内にしてください。`);
          return;
        }
        throw new Error("REPORT_SAVE_FAILED");
      }
      setSummary("");
      setDetails("");
      saveUserReportFormDraft({
        type,
        summary: "",
        details: "",
      });
      requestIdRef.current = null;
      setLastReportId(data?.report?.id ?? "");
      setMessage(en ? "Sent. Thank you for your feedback." : "送信しました。管理者が確認します。");
    } catch {
      setMessage(en ? "Could not send the report. Please try again later." : "送信できませんでした。時間をおいてお試しください。");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={openReportForm}
        className={variant === "menu" ? "rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 transition hover:bg-slate-50" : "rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:bg-white/10"}
      >
        {en ? "Feedback & bug report" : "改善・バグ報告"}
      </button>
      {open && (
        <div ref={dialogRef} className="fixed inset-0 z-[10000] flex items-start justify-center overflow-y-auto bg-slate-950/70 p-4 pt-16 text-slate-950 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="user-report-heading" tabIndex={-1} onClick={() => setOpen(false)}>
          <div className="w-full max-w-lg rounded-xl bg-white p-5 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <div><p className="text-xs font-bold uppercase text-cyan-700">Feedback</p><h2 id="user-report-heading" className="text-xl font-black">{en ? "Feedback & bug report" : "改善要望・バグ報告"}</h2></div>
              <button type="button" onClick={() => setOpen(false)} className="rounded-md border border-slate-300 px-2 py-1 text-xs font-bold text-slate-600">{en ? "Close" : "閉じる"}</button>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2" aria-label={en ? "Report type" : "報告の種類"}>
              {([['bug', en ? 'Bug report' : 'バグ報告'], ['request', en ? 'Feature request' : '改善要望']] as const).map(([value, label]) => <button key={value} type="button" aria-pressed={type === value} onClick={() => { requestIdRef.current = null; setType(value); saveUserReportFormDraft({ type: value, summary, details }); }} className={`rounded-lg border px-3 py-2 text-sm font-bold ${type === value ? "border-cyan-600 bg-cyan-50 text-cyan-950" : "border-slate-300 text-slate-600"}`}>{label}</button>)}
            </div>
            <label className="mt-4 block text-sm font-bold">{en ? "Summary" : "概要"}<span className="text-rose-600">{en ? " (required)" : "（必須）"}</span><input ref={summaryRef} value={summary} onChange={(event) => { const value = event.target.value; requestIdRef.current = null; setSummary(value); saveUserReportFormDraft({ type, summary: value, details }); }} aria-invalid={summaryTooLong} placeholder={en ? "Example: Nothing happens when I select View details" : "例：詳細を見るを押しても反応がない"} className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal outline-none focus:border-cyan-600" /><span className={`mt-1 block text-right text-xs font-normal ${summaryTooLong ? "text-rose-700" : "text-slate-500"}`}>{summary.length.toLocaleString()} / {SUPPORT_TEXT_LIMITS.summary.toLocaleString()}</span>{summaryTooLong && <span className="mt-1 block text-xs font-normal text-rose-700" role="alert">{en ? "Summary is too long." : "概要が文字数上限を超えています。"}</span>}</label>
            <label className="mt-4 block text-sm font-bold">{en ? "Details" : "詳しい内容"}<textarea value={details} onChange={(event) => { const value = event.target.value; requestIdRef.current = null; setDetails(value); saveUserReportFormDraft({ type, summary, details: value }); }} aria-invalid={detailsTooLong} placeholder={en ? "Steps, expected behavior, and what actually happened" : "操作手順、期待した動作、実際に起きたことなど"} className="mt-2 min-h-28 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal outline-none focus:border-cyan-600" /><span className={`mt-1 block text-right text-xs font-normal ${detailsTooLong ? "text-rose-700" : "text-slate-500"}`}>{details.length.toLocaleString()} / {SUPPORT_TEXT_LIMITS.details.toLocaleString()}</span>{detailsTooLong && <span className="mt-1 block text-xs font-normal text-rose-700" role="alert">{en ? "Details are too long. Nothing has been saved." : "詳しい内容が文字数上限を超えています。超過中の内容は保存されません。"}</span>}</label>
            <p className="mt-2 text-xs text-slate-500">{en ? "The current page is attached automatically. Your draft is kept in this tab until it is sent. Do not include passwords or API keys." : "現在のページ情報は自動で添付されます。入力内容は送信完了までこのタブに一時保存されます。パスワードやAPIキーは書かないでください。"}</p>
            {message && <p className="mt-3 rounded-lg bg-slate-100 px-3 py-2 text-sm font-semibold" role="status">{message}</p>}
            {lastReportId && <p className="mt-2 break-all text-xs text-slate-500">{en ? "Receipt ID" : "受付ID"}: {lastReportId}</p>}
            <button type="button" disabled={isSaving || !summary.trim() || textInvalid} onClick={() => void submit()} className="mt-4 w-full rounded-lg bg-cyan-600 px-4 py-3 font-black text-white transition hover:bg-cyan-500 disabled:opacity-40">{isSaving ? (en ? "Sending..." : "送信中...") : (en ? "Send" : "送信する")}</button>
          </div>
        </div>
      )}
    </>
  );
}

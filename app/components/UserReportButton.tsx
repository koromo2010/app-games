"use client";

import { useEffect, useState } from "react";
import { useAppLocale } from "./AppLocaleProvider";

type ReportType = "bug" | "request";

export function UserReportButton({ variant = "banner" }: { variant?: "banner" | "menu" }) {
  const { locale } = useAppLocale();
  const en = locale === "en";
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<ReportType>("bug");
  const [summary, setSummary] = useState("");
  const [details, setDetails] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [open]);

  const submit = async () => {
    if (!summary.trim()) return;
    setIsSaving(true);
    setMessage("");
    try {
      const response = await fetch("/api/user-reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, summary, details, page: window.location.pathname }),
      });
      if (!response.ok) throw new Error("REPORT_SAVE_FAILED");
      setSummary("");
      setDetails("");
      setMessage(en ? "Sent. Thank you for your feedback." : "送信しました。ありがとうございます。");
    } catch {
      setMessage(en ? "Could not send the report. Please try again later." : "送信できませんでした。時間をおいてお試しください。");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => { setOpen(true); setMessage(""); }}
        className={variant === "menu" ? "rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 transition hover:bg-slate-50" : "rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:bg-white/10"}
      >
        {en ? "Feedback & bug report" : "改善・バグ報告"}
      </button>
      {open && (
        <div className="fixed inset-0 z-[10000] flex items-start justify-center overflow-y-auto bg-slate-950/70 p-4 pt-16 text-slate-950 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="user-report-heading" onClick={() => setOpen(false)}>
          <div className="w-full max-w-lg rounded-xl bg-white p-5 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <div><p className="text-xs font-bold uppercase text-cyan-700">Feedback</p><h2 id="user-report-heading" className="text-xl font-black">{en ? "Feedback & bug report" : "改善要望・バグ報告"}</h2></div>
              <button type="button" onClick={() => setOpen(false)} className="rounded-md border border-slate-300 px-2 py-1 text-xs font-bold text-slate-600">{en ? "Close" : "閉じる"}</button>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2" aria-label={en ? "Report type" : "報告の種類"}>
              {([['bug', en ? 'Bug report' : 'バグ報告'], ['request', en ? 'Feature request' : '改善要望']] as const).map(([value, label]) => <button key={value} type="button" aria-pressed={type === value} onClick={() => setType(value)} className={`rounded-lg border px-3 py-2 text-sm font-bold ${type === value ? "border-cyan-600 bg-cyan-50 text-cyan-950" : "border-slate-300 text-slate-600"}`}>{label}</button>)}
            </div>
            <label className="mt-4 block text-sm font-bold">{en ? "Summary" : "概要"}<span className="text-rose-600">{en ? " (required)" : "（必須）"}</span><input autoFocus value={summary} onChange={(event) => setSummary(event.target.value)} maxLength={120} placeholder={en ? "Example: Nothing happens when I select View details" : "例：詳細を見るを押しても反応がない"} className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal outline-none focus:border-cyan-600" /></label>
            <label className="mt-4 block text-sm font-bold">{en ? "Details" : "詳しい内容"}<textarea value={details} onChange={(event) => setDetails(event.target.value)} maxLength={1200} placeholder={en ? "Steps, expected behavior, and what actually happened" : "操作手順、期待した動作、実際に起きたことなど"} className="mt-2 min-h-28 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal outline-none focus:border-cyan-600" /></label>
            <p className="mt-2 text-xs text-slate-500">{en ? "The current page is attached automatically. Do not include passwords or API keys." : "現在のページ情報は自動で添付されます。パスワードやAPIキーは書かないでください。"}</p>
            {message && <p className="mt-3 rounded-lg bg-slate-100 px-3 py-2 text-sm font-semibold" role="status">{message}</p>}
            <button type="button" disabled={isSaving || !summary.trim()} onClick={() => void submit()} className="mt-4 w-full rounded-lg bg-cyan-600 px-4 py-3 font-black text-white transition hover:bg-cyan-500 disabled:opacity-40">{isSaving ? (en ? "Sending..." : "送信中...") : (en ? "Send" : "送信する")}</button>
          </div>
        </div>
      )}
    </>
  );
}

"use client";

import { useState } from "react";
import { useAppLocale } from "./AppLocaleProvider";
import { shareGameResult } from "@/lib/game-share-client";

type Props = { title: string; text: string; url: string; label?: string };

export function GameResultShareButton({ title, text, url, label }: Props) {
  const { t } = useAppLocale();
  const [message, setMessage] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);
  const share = async () => {
    try {
      const absoluteUrl = new URL(url, window.location.origin).toString();
      const outcome = await shareGameResult({ title, text, url: absoluteUrl });
      if (outcome === "shared") setMessage(t("share.opened"));
      if (outcome === "copied") setMessage(t("share.copied"));
      if (outcome === "cancelled") { setMessage(t("share.cancelled")); return; }
      setPreviewOpen(false);
    } catch { setMessage(t("share.failed")); }
  };
  return <div className="rounded-2xl border border-violet-300/25 bg-violet-300/10 p-4">
    <button type="button" onClick={() => { setMessage(""); setPreviewOpen(true); }} className="w-full rounded-xl bg-violet-200 px-4 py-3 font-black text-violet-950 transition hover:bg-violet-100">{label ?? t("share.playLog")}</button>
    <p className="mt-2 text-center text-xs text-violet-100/80">{t("share.help")}</p>
    {previewOpen && <div className="mt-4 rounded-xl border border-violet-200/30 bg-slate-950/80 p-4"><p className="text-sm font-black text-violet-100">{t("share.preview")}</p><pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-black/30 p-3 font-sans text-sm leading-6 text-slate-100">{text}{"\n"}{new URL(url, window.location.origin).toString()}</pre><div className="mt-3 grid grid-cols-2 gap-2"><button type="button" onClick={() => setPreviewOpen(false)} className="rounded-lg border border-white/20 px-3 py-2 text-sm font-black text-white">{t("share.back")}</button><button type="button" onClick={() => void share()} className="rounded-lg bg-violet-200 px-3 py-2 text-sm font-black text-violet-950">{t("share.confirm")}</button></div></div>}
    {message && <p className="mt-2 text-center text-xs font-bold text-violet-100" role="status">{message}</p>}
  </div>;
}

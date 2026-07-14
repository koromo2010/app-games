"use client";

import { useState } from "react";
import { shareGameResult } from "@/lib/game-share-client";

type Props = {
  title: string;
  text: string;
  url: string;
  label?: string;
};

export function GameResultShareButton({ title, text, url, label = "プレイログを共有" }: Props) {
  const [message, setMessage] = useState("");
  const share = async () => {
    try {
      const absoluteUrl = new URL(url, window.location.origin).toString();
      const outcome = await shareGameResult({ title, text, url: absoluteUrl });
      if (outcome === "shared") setMessage("共有メニューを開きました。");
      if (outcome === "copied") setMessage("プレイログをコピーしました。");
    } catch {
      setMessage("共有できませんでした。");
    }
  };
  return (
    <div className="rounded-2xl border border-violet-300/25 bg-violet-300/10 p-4">
      <button type="button" onClick={() => void share()} className="w-full rounded-xl bg-violet-200 px-4 py-3 font-black text-violet-950 transition hover:bg-violet-100">{label}</button>
      <p className="mt-2 text-center text-xs text-violet-100/80">結果とラウンドごとの得点を共有します。参加者名やヒント本文は含みません。</p>
      {message && <p className="mt-2 text-center text-xs font-bold text-violet-100" role="status">{message}</p>}
    </div>
  );
}

"use client";

import Link from "next/link";
import { useState } from "react";

export function ResetPasswordForm({ token }: { token: string }) {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [message, setMessage] = useState("");
  const [isComplete, setIsComplete] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const submit = async () => {
    if (password !== confirmation) {
      setMessage("確認用パスワードが一致しません。");
      return;
    }
    setIsSaving(true);
    setMessage("");
    try {
      const response = await fetch("/api/player-password-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "complete", token, password }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        setMessage(data.error === "PASSWORD_INVALID"
          ? "パスワードは4文字以上128文字以内で入力してください。"
          : data.error === "RESET_INVALID"
            ? "再設定リンクが無効か、有効期限が切れています。もう一度メールを送信してください。"
            : "パスワードの再設定に失敗しました。");
        return;
      }
      setIsComplete(true);
      setMessage("パスワードを変更しました。新しいパスワードでログインできます。");
    } catch {
      setMessage("通信に失敗しました。もう一度試してください。");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 py-10 text-slate-950">
      <section className="w-full max-w-md rounded-xl border border-white/10 bg-white p-6 shadow-2xl">
        <p className="text-xs font-semibold uppercase text-cyan-700">Game Fields</p>
        <h1 className="mt-1 text-2xl font-black">パスワード再設定</h1>
        {!isComplete && token ? (
          <>
            <label className="mt-5 block text-sm font-medium text-slate-700">
              新しいパスワード
              <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete="new-password" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20" placeholder="4文字以上" />
            </label>
            <label className="mt-3 block text-sm font-medium text-slate-700">
              新しいパスワード（確認）
              <input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void submit(); }} type="password" autoComplete="new-password" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20" />
            </label>
            <button type="button" onClick={() => void submit()} disabled={isSaving || !password || !confirmation} className="mt-5 w-full rounded-lg bg-cyan-600 px-3 py-2 font-semibold text-white transition hover:bg-cyan-500 disabled:bg-slate-300">
              {isSaving ? "変更中..." : "パスワードを変更"}
            </button>
          </>
        ) : !isComplete ? (
          <p className="mt-5 text-sm text-rose-700">再設定リンクが正しくありません。ロビーからもう一度メールを送信してください。</p>
        ) : null}
        {message && <p className="mt-4 rounded-lg border border-cyan-100 bg-cyan-50 px-3 py-2 text-sm font-semibold text-cyan-800">{message}</p>}
        <Link href="/games" className="mt-5 inline-flex text-sm font-semibold text-cyan-700 hover:underline">広場へ戻る</Link>
      </section>
    </main>
  );
}

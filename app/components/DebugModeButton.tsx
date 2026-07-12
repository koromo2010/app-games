"use client";

import { useState } from "react";

type DebugModeButtonProps = {
  enabled: boolean;
  disabled?: boolean;
  onChange: (enabled: boolean) => void | Promise<void>;
};

export function DebugModeButton({ enabled, disabled = false, onChange }: DebugModeButtonProps) {
  const [isPasswordOpen, setIsPasswordOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const closePasswordDialog = () => {
    if (isSubmitting) return;
    setIsPasswordOpen(false);
    setPassword("");
    setError("");
  };

  const toggle = async () => {
    if (disabled || isSubmitting) return;
    if (enabled) {
      setIsSubmitting(true);
      try {
        await onChange(false);
      } finally {
        setIsSubmitting(false);
      }
      return;
    }
    setPassword("");
    setError("");
    setIsPasswordOpen(true);
  };

  const authenticate = async () => {
    if (!password || isSubmitting) return;
    setIsSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/debug-auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!response.ok) {
        setError(response.status === 503
          ? "デバッグ用パスワードが未設定です。管理者に確認してください。"
          : "デバッグ用パスワードが違います。");
        return;
      }
      await onChange(true);
      setIsPasswordOpen(false);
      setPassword("");
    } catch {
      setError("デバッグモードを切り替えられませんでした。もう一度試してください。");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => void toggle()}
        disabled={disabled || isSubmitting}
        className={`rounded-lg border px-3 py-1.5 text-sm font-semibold shadow-sm transition disabled:cursor-not-allowed disabled:opacity-50 ${
          enabled
            ? "border-cyan-200 bg-cyan-200 text-slate-950 hover:bg-cyan-100"
            : "border-white/15 bg-white/10 text-cyan-50 hover:bg-white/15"
        }`}
      >
        {isSubmitting ? "確認中..." : enabled ? "デバッグ ON" : "デバッグ OFF"}
      </button>

      {isPasswordOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/70 px-4 py-6 backdrop-blur-sm">
          <form
            role="dialog"
            aria-modal="true"
            aria-labelledby="debug-password-title"
            className="w-full max-w-sm rounded-lg border border-white/20 bg-white p-5 text-slate-950 shadow-2xl"
            onSubmit={(event) => {
              event.preventDefault();
              void authenticate();
            }}
          >
            <p className="text-xs font-semibold uppercase text-cyan-700">Debug mode</p>
            <h2 id="debug-password-title" className="mt-1 text-xl font-bold">パスワード確認</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              デバッグモードをONにするには共通の管理パスワードが必要です。
            </p>
            <input
              autoFocus
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-4 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
              placeholder="パスワード"
              autoComplete="off"
            />
            {error && (
              <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">
                {error}
              </p>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={closePasswordDialog}
                disabled={isSubmitting}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
              >
                キャンセル
              </button>
              <button
                type="submit"
                disabled={!password || isSubmitting}
                className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-cyan-500 disabled:opacity-40"
              >
                {isSubmitting ? "確認中..." : "ONにする"}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}

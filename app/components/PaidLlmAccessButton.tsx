"use client";

import { useEffect, useState } from "react";
import { paidLlmModel } from "@/lib/llm-model";

type LlmAccessStatus = {
  enabled: boolean;
  configured: boolean;
  hasApiKey: boolean;
  model: string;
};

const defaultStatus: LlmAccessStatus = {
  enabled: false,
  configured: false,
  hasApiKey: false,
  model: paidLlmModel,
};

export function PaidLlmAccessButton() {
  const [status, setStatus] = useState<LlmAccessStatus>(defaultStatus);
  const [isOpen, setIsOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const refreshStatus = async () => {
    try {
      const response = await fetch("/api/llm-access", { cache: "no-store" });
      if (!response.ok) return;
      setStatus((await response.json()) as LlmAccessStatus);
    } catch {
      // Access status is a convenience display; game fallback still works.
    }
  };

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void refreshStatus();
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  const connect = async () => {
    setIsSaving(true);
    setMessage("");

    try {
      const response = await fetch("/api/llm-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = (await response.json().catch(() => ({}))) as Partial<LlmAccessStatus> & { error?: string };

      if (!response.ok) {
        setMessage(
          data.error === "OPENAI_API_KEY is not configured."
            ? "OPENAI_API_KEY が未設定です。"
            : data.error === "LLM_ACCESS_PASSWORD is not configured."
              ? "LLM_ACCESS_PASSWORD が未設定です。"
              : "パスワードが違います。",
        );
        return;
      }

      setStatus({
        enabled: Boolean(data.enabled),
        configured: Boolean(data.configured),
        hasApiKey: Boolean(data.hasApiKey),
        model: typeof data.model === "string" ? data.model : defaultStatus.model,
      });
      setPassword("");
      setIsOpen(false);
    } finally {
      setIsSaving(false);
    }
  };

  const disconnect = async () => {
    setIsSaving(true);
    setMessage("");

    try {
      const response = await fetch("/api/llm-access", { method: "DELETE" });
      if (response.ok) {
        setStatus((await response.json()) as LlmAccessStatus);
        setPassword("");
        setIsOpen(false);
      }
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setMessage("");
          setIsOpen(true);
        }}
        className={`rounded-lg border px-3 py-1.5 text-sm font-bold shadow-sm transition ${
          status.enabled
            ? "border-emerald-300 bg-emerald-300 text-slate-950 hover:bg-emerald-200"
            : "border-white/15 bg-white/10 text-slate-100 hover:bg-white/15"
        }`}
      >
        <span className="flex flex-col items-center leading-tight">
          <span>API: {status.enabled ? "有料" : "無料"}</span>
          <span className="text-[10px] font-semibold opacity-80">
            {status.enabled ? status.model : `有料時: ${status.model}`}
          </span>
        </span>
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-[70] grid place-items-center bg-slate-950/70 px-4 py-6 text-slate-950 backdrop-blur-sm">
          <form
            className="w-full max-w-sm rounded-lg border border-white/20 bg-white p-5 shadow-2xl"
            onSubmit={(event) => {
              event.preventDefault();
              void connect();
            }}
          >
            <p className="text-xs font-semibold uppercase text-emerald-700">Paid API access</p>
            <h2 className="mt-1 text-xl font-bold">有料API接続</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              OFF の間は無料のローカル候補を使います。ON にすると、このブラウザの操作だけ OpenAI API を使います。
            </p>
            <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600">
              <p>状態: {status.enabled ? "有料API ON" : "無料モード"}</p>
              <p>モデル: {status.model}</p>
            </div>
            <input
              autoFocus
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-4 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-950 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
              placeholder="API接続パスワード"
              autoComplete="off"
            />
            {message && (
              <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">
                {message}
              </p>
            )}
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              {status.enabled && (
                <button
                  type="button"
                  onClick={() => void disconnect()}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-700 transition hover:bg-slate-50"
                  disabled={isSaving}
                >
                  無料に戻す
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  setPassword("");
                  setMessage("");
                }}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-700 transition hover:bg-slate-50"
                disabled={isSaving}
              >
                閉じる
              </button>
              <button
                type="submit"
                className="rounded-lg border border-emerald-500 bg-emerald-500 px-3 py-2 text-sm font-bold text-white transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={!password || isSaving}
              >
                {isSaving ? "確認中..." : "接続"}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}

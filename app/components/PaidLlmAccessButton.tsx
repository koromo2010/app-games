"use client";

import { useEffect, useState } from "react";
import { freeGroqLlmModel, freeLlmModel, paidLlmModel } from "@/lib/llm-model";

type AccessSource = "personal" | "game-fields" | null;
type PersonalProvider = "openai" | "gemini" | "groq";

type LlmAccessStatus = {
  enabled: boolean;
  source: AccessSource;
  personalEnabled: boolean;
  personalConfigured: boolean;
  personalProvider: PersonalProvider | null;
  gameFieldsEnabled: boolean;
  gameFieldsConfigured: boolean;
  model: string;
  hasFreeApiKey: boolean;
  freeModel: string;
  hasGroqApiKey: boolean;
  groqModel: string;
};

const defaultStatus: LlmAccessStatus = {
  enabled: false,
  source: null,
  personalEnabled: false,
  personalConfigured: false,
  personalProvider: null,
  gameFieldsEnabled: false,
  gameFieldsConfigured: false,
  model: paidLlmModel,
  hasFreeApiKey: false,
  freeModel: freeLlmModel,
  hasGroqApiKey: false,
  groqModel: freeGroqLlmModel,
};

function normalizeStatus(data: Partial<LlmAccessStatus>): LlmAccessStatus {
  const source = data.source === "personal" || data.source === "game-fields" ? data.source : null;
  return {
    enabled: Boolean(source),
    source,
    personalEnabled: source === "personal",
    personalConfigured: Boolean(data.personalConfigured),
    personalProvider:
      data.personalProvider === "openai" || data.personalProvider === "gemini" || data.personalProvider === "groq"
        ? data.personalProvider
        : null,
    gameFieldsEnabled: source === "game-fields",
    gameFieldsConfigured: Boolean(data.gameFieldsConfigured),
    model: typeof data.model === "string" ? data.model : defaultStatus.model,
    hasFreeApiKey: Boolean(data.hasFreeApiKey),
    freeModel: typeof data.freeModel === "string" ? data.freeModel : defaultStatus.freeModel,
    hasGroqApiKey: Boolean(data.hasGroqApiKey),
    groqModel: typeof data.groqModel === "string" ? data.groqModel : defaultStatus.groqModel,
  };
}

function freeApiLabel(status: LlmAccessStatus) {
  if (status.hasFreeApiKey) return `${status.freeModel}${status.hasGroqApiKey ? " → Groq" : ""}`;
  if (status.hasGroqApiKey) return status.groqModel;
  return "ローカル（API不使用）";
}

export function PaidLlmAccessButton() {
  const [status, setStatus] = useState<LlmAccessStatus>(defaultStatus);
  const [isOpen, setIsOpen] = useState(false);
  const [personalApiKey, setPersonalApiKey] = useState("");
  const [personalProvider, setPersonalProvider] = useState<PersonalProvider>("openai");
  const [gameFieldsPassword, setGameFieldsPassword] = useState("");
  const [message, setMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const refreshStatus = async () => {
    try {
      const response = await fetch("/api/llm-access", { cache: "no-store" });
      if (response.ok) setStatus(normalizeStatus(await response.json()));
    } catch {
      // Access status is a convenience display; game fallback still works.
    }
  };

  useEffect(() => {
    const timer = window.setTimeout(() => void refreshStatus(), 0);
    return () => window.clearTimeout(timer);
  }, []);

  const connect = async (mode: "personal" | "game-fields") => {
    setIsSaving(true);
    setMessage("");
    try {
      const response = await fetch("/api/llm-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          provider: mode === "personal" ? personalProvider : undefined,
          apiKey: mode === "personal" ? personalApiKey : undefined,
          password: mode === "game-fields" ? gameFieldsPassword : undefined,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as Partial<LlmAccessStatus> & { error?: string };
      if (!response.ok) {
        const errorMessages: Record<string, string> = {
          "LLM_SESSION_SECRET is not configured.": "個人APIキーを安全に保持するためのサーバー設定が未完了です。",
          "Invalid personal API key.": "APIキーが無効か、選択したAIサービスと一致しません。",
          "Could not validate personal API key.": "APIキーを確認できませんでした。時間をおいて再度お試しください。",
          "OPENAI_API_KEY is not configured.": "Game Fields側のOpenAI APIが未設定です。",
          "LLM_ACCESS_PASSWORD is not configured.": "Game Fields有料枠はまだ利用できません。",
          "Invalid password.": "招待・テスト用パスワードが違います。",
        };
        setMessage(errorMessages[data.error ?? ""] ?? "API接続に失敗しました。");
        return;
      }
      setStatus(normalizeStatus(data));
      setPersonalApiKey("");
      setGameFieldsPassword("");
      const providerNames = { openai: "OpenAI", gemini: "Gemini", groq: "Groq" };
      setMessage(mode === "personal" ? `自分の${providerNames[personalProvider]} APIへ接続しました。` : "Game Fieldsの有料APIへ接続しました。");
    } catch {
      setMessage("通信に失敗しました。もう一度試してください。");
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
        setStatus(normalizeStatus(await response.json()));
        setPersonalApiKey("");
        setGameFieldsPassword("");
        setMessage("無料モードへ戻しました。");
      }
    } finally {
      setIsSaving(false);
    }
  };

  const sourceLabel = status.source === "personal"
    ? `自分の${status.personalProvider === "gemini" ? "Gemini" : status.personalProvider === "groq" ? "Groq" : "OpenAI"}`
    : status.source === "game-fields"
      ? "Game Fields"
      : "無料";

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
          <span>API: {sourceLabel}</span>
          <span className="text-[10px] font-semibold opacity-80">
            {status.enabled ? status.model : freeApiLabel(status)}
          </span>
        </span>
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-[70] grid place-items-center overflow-y-auto bg-slate-950/70 px-4 py-6 text-slate-950 backdrop-blur-sm">
          <div role="dialog" aria-modal="true" aria-labelledby="llm-access-title" className="my-auto w-full max-w-lg rounded-lg border border-white/20 bg-white p-5 shadow-2xl">
            <p className="text-xs font-semibold uppercase text-emerald-700">AI API access</p>
            <h2 id="llm-access-title" className="mt-1 text-xl font-bold">利用するAI API</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              通常は無料のまま遊べます。開発者向けAPIキーを持っている方は自分のAI APIを、将来はGame Fieldsが提供する有料APIも選べます。
            </p>

            <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600">
              <p>現在: {sourceLabel}</p>
              <p>モデル: {status.enabled ? status.model : freeApiLabel(status)}</p>
            </div>

            <section className="mt-4 rounded-lg border border-cyan-200 bg-cyan-50 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-bold text-slate-950">自分で取得したAI APIキーを使う</h3>
                  <p className="mt-1 text-xs leading-5 text-slate-600">開発者向けの設定が分かる方向けです。ChatGPT Plus／ProやGeminiの月額プランとは別の仕組みです。</p>
                </div>
                {status.personalEnabled && <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-bold text-emerald-700">接続中</span>}
              </div>
              <label className="mt-3 block text-xs font-bold text-slate-700">
                AIサービス
                <select
                  value={personalProvider}
                  onChange={(event) => {
                    setPersonalProvider(event.target.value as PersonalProvider);
                    setPersonalApiKey("");
                    setMessage("");
                  }}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
                >
                  <option value="openai">OpenAI</option>
                  <option value="gemini">Google Gemini</option>
                  <option value="groq">Groq</option>
                </select>
              </label>
              <input
                type="password"
                value={personalApiKey}
                onChange={(event) => setPersonalApiKey(event.target.value)}
                className="mt-3 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
                placeholder={personalProvider === "openai" ? "sk-..." : "選択したサービスのAPIキー"}
                autoComplete="off"
                name="openai-api-key"
              />
              <p className="mt-2 text-xs text-cyan-800">
                APIキーの取得先: {personalProvider === "openai" ? (
                  <a href="https://platform.openai.com/api-keys" target="_blank" rel="noreferrer" className="font-bold underline">OpenAI Platform</a>
                ) : personalProvider === "gemini" ? (
                  <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="font-bold underline">Google AI Studio</a>
                ) : (
                  <a href="https://console.groq.com/keys" target="_blank" rel="noreferrer" className="font-bold underline">Groq Console</a>
                )}
              </p>
              <p className="mt-2 text-[11px] leading-5 text-slate-600">
                このゲーム専用のAPIキーと利用上限の設定を推奨します。料金・無料枠は選択したAIサービス側の契約に従います。キーは暗号化されたHttpOnly Cookieに8時間だけ保持し、Redis・アカウント・ログには保存しません。Game FieldsのサーバーはAPI呼び出し時にキーを一時的に処理します。
              </p>
              <button
                type="button"
                onClick={() => void connect("personal")}
                disabled={!personalApiKey || isSaving || !status.personalConfigured}
                className="mt-3 w-full rounded-lg bg-cyan-600 px-3 py-2 text-sm font-bold text-white transition hover:bg-cyan-500 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {isSaving ? "確認中..." : status.personalConfigured ? "自分のAPIへ接続" : "サーバー設定待ち"}
              </button>
            </section>

            <section className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-bold text-slate-950">Game Fieldsの有料API</h3>
                  <p className="mt-1 text-xs leading-5 text-slate-600">自分でAPIキーを用意せず、Game Fieldsへの支払いで利用する予定の枠です。</p>
                </div>
                {status.gameFieldsEnabled && <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-bold text-emerald-700">接続中</span>}
              </div>
              <p className="mt-2 rounded-md bg-white/70 px-2 py-1.5 text-xs font-semibold text-amber-800">現在は招待・動作確認用です。購入機能は今後追加します。</p>
              <input
                type="password"
                value={gameFieldsPassword}
                onChange={(event) => setGameFieldsPassword(event.target.value)}
                className="mt-3 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-100"
                placeholder="招待・テスト用パスワード"
                autoComplete="off"
              />
              <button
                type="button"
                onClick={() => void connect("game-fields")}
                disabled={!gameFieldsPassword || isSaving || !status.gameFieldsConfigured}
                className="mt-3 w-full rounded-lg bg-amber-500 px-3 py-2 text-sm font-bold text-white transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {isSaving ? "確認中..." : status.gameFieldsConfigured ? "招待枠へ接続" : "現在利用不可"}
              </button>
            </section>

            {message && (
              <p className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700">{message}</p>
            )}

            <div className="mt-4 flex flex-wrap justify-end gap-2">
              {status.enabled && (
                <button type="button" onClick={() => void disconnect()} disabled={isSaving} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-700 transition hover:bg-slate-50">
                  無料に戻す
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  setPersonalApiKey("");
                  setGameFieldsPassword("");
                  setMessage("");
                }}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-700 transition hover:bg-slate-50"
                disabled={isSaving}
              >
                閉じる
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

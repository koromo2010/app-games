"use client";

import { useState } from "react";
import type { GameGenerationMeta } from "@/lib/game-ai-types";

export type DebugWordGenerationResult = {
  fields: Array<{ label: string; value: string }>;
  notice?: string;
  generation?: GameGenerationMeta;
};

type DebugWordGenerationTestProps = {
  onGenerate: () => Promise<DebugWordGenerationResult>;
};

export function DebugWordGenerationTest({ onGenerate }: DebugWordGenerationTestProps) {
  const [result, setResult] = useState<DebugWordGenerationResult | null>(null);
  const [error, setError] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);

  const generate = async () => {
    if (isGenerating) return;
    setIsGenerating(true);
    setError("");
    try {
      setResult(await onGenerate());
    } catch (caught) {
      setResult(null);
      setError(caught instanceof Error ? caught.message : "ワード生成のテストに失敗しました。");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 p-3">
      <p className="text-sm font-black text-amber-950">ワード生成だけテスト</p>
      <p className="mt-1 text-xs leading-5 text-amber-800">
        現在の設定で生成結果だけ確認します。部屋・ラウンド・出題履歴は変更しません。
      </p>
      <button
        type="button"
        onClick={() => void generate()}
        disabled={isGenerating}
        className="mt-3 w-full rounded-lg border border-amber-400 bg-white px-3 py-2 text-sm font-bold text-amber-950 transition hover:bg-amber-100 disabled:cursor-wait disabled:opacity-60"
      >
        {isGenerating ? "ワード生成中..." : result ? "もう一度生成" : "ワード生成をテスト"}
      </button>
      {error && (
        <p role="alert" className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold leading-5 text-rose-700">
          {error}
        </p>
      )}
      {result && (
        <div className="mt-3 space-y-2 rounded-lg border border-amber-200 bg-white p-3" aria-live="polite">
          {result.fields.map((field) => (
            <div key={field.label}>
              <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{field.label}</p>
              <p className="whitespace-pre-wrap break-words text-sm font-semibold leading-6 text-slate-950">{field.value || "—"}</p>
            </div>
          ))}
          {result.notice && <p className="text-xs leading-5 text-amber-800">{result.notice}</p>}
          {result.generation && (
            <p className="border-t border-slate-100 pt-2 text-[11px] text-slate-500">
              {result.generation.provider} / {result.generation.model} / {result.generation.latencyMs}ms
            </p>
          )}
        </div>
      )}
    </div>
  );
}

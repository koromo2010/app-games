"use client";

import { useState } from "react";
import {
  createSingleUseMigration011Submitter,
  type SdkMigration011ClientResult,
} from "@/lib/sdk-migration-011-client";

export function SdkMigration011OperatorPanel() {
  const [submitter] = useState(() => createSingleUseMigration011Submitter());
  const [result, setResult] = useState<SdkMigration011ClientResult | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (submitting || result) return;
    setSubmitting(true);
    const next = await submitter();
    setResult(next);
    setSubmitting(false);
  };

  return (
    <section className="rounded-2xl border border-amber-300/25 bg-amber-300/10 p-5">
      <h2 className="text-lg font-black text-amber-100">Development migration 011</h2>
      <p className="mt-2 text-sm leading-6 text-slate-200">
        Development専用SDKデータベースへ、固定済みのmigration 011を一度だけ適用します。
        既存の5分間の管理者MFA確認と、サーバー側のruntime・fingerprint・ledger・object contractをすべて通過した場合だけ実行されます。
      </p>
      <p className="mt-2 text-xs leading-5 text-slate-400">
        この画面は接続情報や認証情報を入力・表示しません。自動再試行はありません。
      </p>
      <button
        type="button"
        disabled={submitting || result !== null}
        onClick={() => void submit()}
        className="mt-5 w-full rounded-xl bg-amber-300 px-4 py-3 font-black text-slate-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {submitting ? "実行中…" : result ? "実行済み" : "Development migration 011を実行"}
      </button>
      {result?.kind === "success" && (
        <div role="status" className="mt-4 rounded-xl border border-emerald-300/30 bg-emerald-300/10 p-4 text-sm text-emerald-50">
          <p className="font-black">{result.status}</p>
          <p className="mt-1">schema {result.observedSchemaVersion} / writes {result.writesPerformed}</p>
        </div>
      )}
      {result?.kind === "stopped" && (
        <div role="alert" className="mt-4 rounded-xl border border-amber-300/30 bg-amber-300/10 p-4 text-sm text-amber-50">
          <p className="font-black">STOPPED</p>
          <p className="mt-1 font-mono text-xs">{result.code}</p>
        </div>
      )}
      {(result?.kind === "failed" || result?.kind === "blocked") && (
        <p role="alert" className="mt-4 rounded-xl border border-rose-300/30 bg-rose-300/10 p-4 text-sm text-rose-50">
          応答を安全に確認できなかったため停止しました。再実行は行いません。
        </p>
      )}
    </section>
  );
}

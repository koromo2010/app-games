"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import {
  createSingleUseMigration011Submitter,
  type SdkMigration011ClientResult,
} from "@/lib/sdk-migration-011-client";
import type { SdkMigration011PageAccess } from "@/lib/sdk-migration-011-page-access";
import {
  performSdkMigration011TotpStepUp,
  type SdkMigration011StepUpFailureCode,
} from "@/lib/sdk-migration-011-step-up-client";

const stepUpFailureMessages: Record<SdkMigration011StepUpFailureCode, string> = {
  INVALID_TOTP_FORMAT: "Authenticatorの6桁コードを入力してください。",
  ADMIN_AUTH_REQUIRED: "full Site Adminセッションを確認できません。ログイン画面へ戻って停止してください。",
  ADMIN_FULL_AUTH_REQUIRED: "full Site Admin権限を確認できません。操作を停止してください。",
  ADMIN_STEP_UP_REQUIRED: "recent MFAを確認できません。操作を停止してください。",
  SITE_ADMIN_TOTP_UNAVAILABLE: "このSite AdminではAuthenticator step-upを利用できません。",
  SITE_ADMIN_CHALLENGE_EXPIRED: "Authenticator challengeを確認できません。新しい操作として停止してください。",
  INVALID_TOTP_CODE: "Authenticatorコードを確認できませんでした。",
  RATE_LIMITED: "Authenticator確認の試行上限に達しました。操作を停止してください。",
  INVALID_RESPONSE: "Authenticator確認の応答を安全に確認できません。操作を停止してください。",
  TRANSPORT_FAILED: "Authenticator確認の通信結果が不明です。操作を停止してください。",
};

export function SdkMigration011OperatorPanel({
  initialAccess,
}: {
  initialAccess: SdkMigration011PageAccess;
}) {
  const router = useRouter();
  const [submitter] = useState(() => createSingleUseMigration011Submitter());
  const [result, setResult] = useState<SdkMigration011ClientResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [totpCode, setTotpCode] = useState("");
  const [stepUpSubmitting, setStepUpSubmitting] = useState(false);
  const [stepUpFailure, setStepUpFailure] = useState<SdkMigration011StepUpFailureCode | null>(null);
  const [awaitingServerReevaluation, setAwaitingServerReevaluation] = useState(false);

  const submitStepUp = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (stepUpSubmitting || awaitingServerReevaluation) return;
    setStepUpSubmitting(true);
    setStepUpFailure(null);
    const next = await performSdkMigration011TotpStepUp(totpCode);
    setTotpCode("");
    setStepUpSubmitting(false);
    if (next.kind === "failed") {
      setStepUpFailure(next.code);
      return;
    }
    setAwaitingServerReevaluation(true);
    router.refresh();
  };

  const submit = async () => {
    if (submitting || result) return;
    setSubmitting(true);
    const next = await submitter();
    setResult(next);
    setSubmitting(false);
  };

  if (initialAccess === "step-up-required") return (
    <section className="rounded-2xl border border-cyan-300/25 bg-cyan-300/10 p-5">
      <h2 className="text-lg font-black text-cyan-100">Authenticator確認</h2>
      <p className="mt-2 text-sm leading-6 text-slate-200">
        full Site Adminセッションは有効です。Migration 011の実行前に、登録済みAuthenticatorの6桁コードでrecent MFAを更新してください。
      </p>
      <p className="mt-2 text-xs leading-5 text-slate-400">
        成功後はこのoperator画面をサーバーで再評価します。Migration 011は自動実行されません。
      </p>
      <form className="mt-5 space-y-3" onSubmit={submitStepUp}>
        <label htmlFor="migration-011-totp" className="block text-sm font-bold text-cyan-50">
          Authenticatorの6桁コード
        </label>
        <input
          id="migration-011-totp"
          type="password"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]{6}"
          maxLength={6}
          required
          value={totpCode}
          onChange={(event) => setTotpCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
          disabled={stepUpSubmitting || awaitingServerReevaluation}
          className="w-full rounded-xl border border-cyan-200/30 bg-slate-950 px-4 py-3 font-mono text-lg tracking-[0.35em] text-white outline-none focus:border-cyan-200 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={stepUpSubmitting || awaitingServerReevaluation || totpCode.length !== 6}
          className="w-full rounded-xl bg-cyan-300 px-4 py-3 font-black text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {awaitingServerReevaluation ? "operator画面を再確認中…" : stepUpSubmitting ? "確認中…" : "Authenticatorを確認"}
        </button>
      </form>
      {stepUpFailure && (
        <p role="alert" className="mt-4 rounded-xl border border-rose-300/30 bg-rose-300/10 p-4 text-sm text-rose-50">
          {stepUpFailureMessages[stepUpFailure]}
        </p>
      )}
    </section>
  );

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

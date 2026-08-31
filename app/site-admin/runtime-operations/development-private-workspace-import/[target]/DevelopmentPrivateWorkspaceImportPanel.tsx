"use client";

import { useRouter } from "next/navigation";
import { type ChangeEvent, type FormEvent, useRef, useState } from "react";
import {
  developmentPrivateWorkspaceImportTargetSpecs,
  type DevelopmentPrivateWorkspaceImportTarget,
} from "@/apps/sdk-portal/lib/development-private-workspace-import-public-contract";
import {
  parseDevelopmentPrivateWorkspaceImportExecute,
  parseDevelopmentPrivateWorkspaceImportPlan,
  parseDevelopmentPrivateWorkspaceImportPlanAccess,
  parseDevelopmentPrivateWorkspaceImportStatus,
  verifyDevelopmentPrivateWorkspaceImportFile,
  type DevelopmentPrivateWorkspaceImportAcceptance,
  type DevelopmentPrivateWorkspaceImportClientPlan,
  type DevelopmentPrivateWorkspaceImportPlanAccess,
  type VerifiedDevelopmentPrivateWorkspaceImportFile,
} from "@/lib/development-private-workspace-import-client";
import type { DevelopmentPrivateWorkspaceImportPageAccess } from "@/lib/development-private-workspace-import-page-access";
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

const bundleFailureMessages = {
  BUNDLE_BYTES_MISMATCH: "bundle bytesがこのtargetの固定値と一致しません。",
  BUNDLE_SHA256_MISMATCH: "bundle SHA-256がこのtargetの固定値と一致しません。",
  BUNDLE_TARGET_MISMATCH: "bundleと画面のtargetが一致しません。",
  BROWSER_CRYPTO_UNAVAILABLE: "このブラウザでbundle identityを安全に確認できません。",
} as const;

type OperationState =
  | "idle"
  | "verifying"
  | "verified"
  | "planning"
  | "planned"
  | "executing"
  | "reconciling"
  | "not-found"
  | "unknown"
  | "stopped"
  | "completed";

async function readPayload(response: Response) {
  try {
    const value = await response.json();
    return value && typeof value === "object" && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

function Acceptance({ value }: { value: DevelopmentPrivateWorkspaceImportAcceptance }) {
  return (
    <section
      data-private-workspace-import-acceptance="complete"
      className="rounded-2xl border border-emerald-300/30 bg-emerald-300/10 p-5"
    >
      <h2 className="text-lg font-black text-emerald-100">Read-only acceptance: COMPLETE</h2>
      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
        <div><dt className="text-slate-400">workspace</dt><dd className="break-all font-mono text-xs text-white">{value.workspaceId}</dd></div>
        <div><dt className="text-slate-400">rows</dt><dd className="font-bold text-white">workspace {value.workspaceRows} / games {value.gameRows} / files {value.fileRows}</dd></div>
        <div><dt className="text-slate-400">visibility</dt><dd className="font-bold text-white">{value.visibility} / private={String(value.private)} / quarantined={String(value.quarantined)}</dd></div>
        <div><dt className="text-slate-400">owner binding</dt><dd className="font-bold text-white">{value.ownerBinding} / rows {value.ownerBindingRows}</dd></div>
        <div className="sm:col-span-2"><dt className="text-slate-400">bundle SHA-256</dt><dd className="break-all font-mono text-xs text-white">{value.bundleSha256}</dd></div>
        <div className="sm:col-span-2"><dt className="text-slate-400">content-set SHA-256</dt><dd className="break-all font-mono text-xs text-white">{value.contentSetSha256}</dd></div>
        <div className="sm:col-span-2"><dt className="text-slate-400">non-effects</dt><dd className="font-bold text-white">grants {value.grants} / releases {value.releases} / publications {value.publications} / aliases {value.aliases} / Rooms {value.rooms}</dd></div>
        {value.statusReceipt && <div className="sm:col-span-2"><dt className="text-slate-400">status receipt</dt><dd className="break-all font-mono text-xs text-white">{value.statusReceipt}</dd></div>}
      </dl>
    </section>
  );
}

export function DevelopmentPrivateWorkspaceImportPanel({
  target,
  initialAccess,
}: {
  target: DevelopmentPrivateWorkspaceImportTarget;
  initialAccess: DevelopmentPrivateWorkspaceImportPageAccess;
}) {
  const router = useRouter();
  const spec = developmentPrivateWorkspaceImportTargetSpecs[target];
  const [totpCode, setTotpCode] = useState("");
  const [stepUpSubmitting, setStepUpSubmitting] = useState(false);
  const [stepUpFailure, setStepUpFailure] = useState<SdkMigration011StepUpFailureCode | null>(null);
  const [runtimeStepUpRequired, setRuntimeStepUpRequired] = useState(false);
  const [awaitingServerReevaluation, setAwaitingServerReevaluation] = useState(false);
  const [operationState, setOperationState] = useState<OperationState>("idle");
  const [targetState, setTargetState] = useState<DevelopmentPrivateWorkspaceImportPlanAccess | null>(null);
  const [targetStateChecking, setTargetStateChecking] = useState(false);
  const [targetStateLocked, setTargetStateLocked] = useState(false);
  const [verified, setVerified] = useState<VerifiedDevelopmentPrivateWorkspaceImportFile | null>(null);
  const [plan, setPlan] = useState<DevelopmentPrivateWorkspaceImportClientPlan | null>(null);
  const [acceptance, setAcceptance] = useState<DevelopmentPrivateWorkspaceImportAcceptance | null>(null);
  const [message, setMessage] = useState("");
  const [planLocked, setPlanLocked] = useState(false);
  const [executeLocked, setExecuteLocked] = useState(false);
  const selectionVersion = useRef(0);
  const planUsed = useRef(false);
  const executeUsed = useRef(false);

  const submitStepUp = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (stepUpSubmitting || awaitingServerReevaluation) return;
    setStepUpSubmitting(true);
    setStepUpFailure(null);
    const result = await performSdkMigration011TotpStepUp(totpCode);
    setTotpCode("");
    setStepUpSubmitting(false);
    if (result.kind === "failed") {
      setStepUpFailure(result.code);
      return;
    }
    setRuntimeStepUpRequired(false);
    setAwaitingServerReevaluation(true);
    router.refresh();
  };

  const selectFile = async (event: ChangeEvent<HTMLInputElement>) => {
    if (planUsed.current || executeUsed.current) return;
    const version = selectionVersion.current + 1;
    selectionVersion.current = version;
    setVerified(null);
    setPlan(null);
    setAcceptance(null);
    setMessage("");
    const file = event.target.files?.[0];
    if (!file) {
      setOperationState("idle");
      return;
    }
    setOperationState("verifying");
    const result = await verifyDevelopmentPrivateWorkspaceImportFile(file, target);
    if (selectionVersion.current !== version) return;
    if (result.kind === "rejected") {
      setOperationState("stopped");
      setMessage(bundleFailureMessages[result.code]);
      return;
    }
    setVerified(result.value);
    setOperationState("verified");
  };

  const checkTargetState = async () => {
    if (targetStateLocked || planUsed.current || executeUsed.current) return;
    setTargetStateLocked(true);
    setTargetStateChecking(true);
    setTargetState(null);
    setMessage("");
    const targetStatePath = `/api/admin/sdk-development-private-workspace-import/${encodeURIComponent(target)}/target-state`;
    try {
      const response = await fetch(targetStatePath, { method: "GET", cache: "no-store" });
      const payload = await readPayload(response);
      const parsed = response.ok
        ? parseDevelopmentPrivateWorkspaceImportPlanAccess(payload, target)
        : null;
      if (!parsed) {
        const error = payload && typeof (payload as Record<string, unknown>).error === "string"
          ? String((payload as Record<string, unknown>).error)
          : "DEVELOPMENT_PRIVATE_IMPORT_UNAVAILABLE";
        setMessage(`read-only target stateを確認できません (${error})。bundleやplanは送信していません。`);
        return;
      }
      setTargetState(parsed);
    } catch {
      setMessage("read-only target stateの通信結果が不明です。bundleやplanは送信していません。");
    } finally {
      setTargetStateChecking(false);
    }
  };

  const requestPlan = async () => {
    if (!verified || planUsed.current || executeUsed.current) return;
    setOperationState("planning");
    setMessage("");
    const planPath = `/api/admin/sdk-development-private-workspace-import/${encodeURIComponent(target)}/plan`;
    let accessResponse: Response;
    let accessPayload: object | null;
    try {
      accessResponse = await fetch(planPath, { method: "GET", cache: "no-store" });
      accessPayload = await readPayload(accessResponse);
    } catch {
      setOperationState("stopped");
      setMessage("plan送信前のread-only認証確認結果が不明です。planは送信していません。");
      return;
    }
    const accessError = accessPayload
      ? (accessPayload as Record<string, unknown>).error
      : null;
    if (accessResponse.status === 403 && accessError === "ADMIN_STEP_UP_REQUIRED") {
      setRuntimeStepUpRequired(true);
      setOperationState("verified");
      return;
    }
    const access = accessResponse.ok
      ? parseDevelopmentPrivateWorkspaceImportPlanAccess(accessPayload, target)
      : null;
    if (!access) {
      setOperationState("stopped");
      setMessage("plan送信前の認証状態を安全に確認できません。planは送信していません。");
      return;
    }
    setTargetState(access);
    if (!access.ready) {
      setOperationState("stopped");
      setMessage("Development target stateがimport前提と一致しません。bundleとplanは送信していません。");
      return;
    }
    planUsed.current = true;
    setPlanLocked(true);
    try {
      const response = await fetch(
        planPath,
        {
          method: "POST",
          headers: { "Content-Type": "application/zip" },
          body: verified.file,
        },
      );
      const payload = await readPayload(response);
      const parsed = response.ok
        ? parseDevelopmentPrivateWorkspaceImportPlan(payload, target)
        : null;
      if (!parsed) {
        const error = payload && typeof (payload as Record<string, unknown>).error === "string"
          && /^DEVELOPMENT_PRIVATE_IMPORT_[A-Z0-9_]+$/.test(String((payload as Record<string, unknown>).error))
          ? String((payload as Record<string, unknown>).error)
          : "DEVELOPMENT_PRIVATE_IMPORT_INVALID_RESPONSE";
        setOperationState("stopped");
        setMessage(`write-free planは受理されませんでした (${error})。planは再送しません。`);
        return;
      }
      setPlan(parsed);
      setOperationState("planned");
    } catch {
      setOperationState("stopped");
      setMessage("write-free planの通信結果が不明です。planは再送しません。");
    }
  };

  const reconcileStatus = async (
    currentVerified: VerifiedDevelopmentPrivateWorkspaceImportFile,
    currentPlan: DevelopmentPrivateWorkspaceImportClientPlan,
  ) => {
    setOperationState("reconciling");
    setMessage("");
    try {
      const response = await fetch(
        `/api/admin/sdk-development-private-workspace-import/${encodeURIComponent(target)}/status/${encodeURIComponent(currentVerified.operationId)}`,
        {
          method: "GET",
          headers: {
            "X-Game-Fields-Private-Import-Plan-Receipt": currentPlan.planReceipt,
            "X-Game-Fields-Private-Import-Bundle-Sha256": currentVerified.sha256,
          },
          cache: "no-store",
        },
      );
      const payload = await readPayload(response);
      const parsed = parseDevelopmentPrivateWorkspaceImportStatus(
        payload,
        target,
        currentVerified.operationId,
      );
      if (response.status === 404 && parsed?.state === "not-found") {
        setAcceptance(null);
        setOperationState("not-found");
        setMessage("このoperation IDのcompleted receiptはまだ観測されていません。DB writeの有無は推定しません。");
        return;
      }
      if (!response.ok || parsed?.state !== "completed") {
        setAcceptance(null);
        setOperationState("unknown");
        setMessage("read-only status応答を安全に確認できません。execute POSTは再送しません。");
        return;
      }
      setAcceptance(parsed.acceptance);
      setOperationState("completed");
    } catch {
      setAcceptance(null);
      setOperationState("unknown");
      setMessage("read-only statusの通信結果が不明です。execute POSTは再送しません。");
    }
  };

  const execute = async () => {
    if (!verified || !plan || executeUsed.current) return;
    executeUsed.current = true;
    setExecuteLocked(true);
    setOperationState("executing");
    setMessage("");
    try {
      const response = await fetch(
        `/api/admin/sdk-development-private-workspace-import/${encodeURIComponent(target)}/execute`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/zip",
            "X-Game-Fields-Private-Import-Operation-Id": verified.operationId,
            "X-Game-Fields-Private-Import-Plan-Receipt": plan.planReceipt,
          },
          body: verified.file,
        },
      );
      const payload = await readPayload(response);
      const parsed = response.ok
        ? parseDevelopmentPrivateWorkspaceImportExecute(payload, target, verified.operationId)
        : null;
      if (parsed) setAcceptance(parsed.acceptance);
    } catch {
      setAcceptance(null);
    }
    await reconcileStatus(verified, plan);
  };

  if (initialAccess === "step-up-required" || runtimeStepUpRequired) return (
    <section className="rounded-2xl border border-cyan-300/25 bg-cyan-300/10 p-5">
      <h2 className="text-lg font-black text-cyan-100">Authenticator確認</h2>
      <p className="mt-2 text-sm leading-6 text-slate-200">
        full Site Adminセッションは有効です。private workspace importの前に、登録済みAuthenticatorの6桁コードでrecent MFAを更新してください。
      </p>
      <p className="mt-2 text-xs leading-5 text-slate-400">
        成功後はこの画面をサーバーで再評価します。選択済みbundleとoperation IDを保持し、planやimportは自動実行されません。
      </p>
      <form className="mt-5 space-y-3" onSubmit={submitStepUp}>
        <label htmlFor="private-workspace-import-totp" className="block text-sm font-bold text-cyan-50">Authenticatorの6桁コード</label>
        <input
          id="private-workspace-import-totp"
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
          {awaitingServerReevaluation ? "画面を再確認中…" : stepUpSubmitting ? "確認中…" : "Authenticatorを確認"}
        </button>
      </form>
      {stepUpFailure && <p role="alert" className="mt-4 rounded-xl border border-rose-300/30 bg-rose-300/10 p-4 text-sm text-rose-50">{stepUpFailureMessages[stepUpFailure]}</p>}
    </section>
  );

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-cyan-300/25 bg-cyan-300/10 p-5">
        <h2 className="text-lg font-black text-cyan-100">Read-only target state</h2>
        <p className="mt-2 text-sm leading-6 text-slate-200">
          bundleを送らず、現在のtarget行数とprivate workspace import前提だけを1回確認します。
        </p>
        <button
          type="button"
          onClick={() => void checkTargetState()}
          disabled={targetStateLocked || planLocked || executeLocked}
          className="mt-4 w-full rounded-xl border border-cyan-200/40 px-4 py-3 font-black text-cyan-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {targetStateChecking ? "read-only確認中…" : targetStateLocked ? "read-only確認済み" : "target stateをread-onlyで確認"}
        </button>
        {targetState && <div data-private-workspace-import-target-state={targetState.ready ? "ready" : "blocked"} className="mt-4 rounded-xl border border-white/15 bg-black/20 p-4 text-sm text-slate-100">
          <p className="font-black">TARGET STATE: {targetState.ready ? "READY" : "BLOCKED"}</p>
          <p className="mt-2">creator {targetState.counts.creatorRows} / deleted {targetState.counts.deletedCreatorRows} / owner {targetState.counts.creatorOwnerRows}</p>
          <p className="mt-1">games {targetState.counts.gameRows} / deleted {targetState.counts.deletedGameRows} / active {targetState.counts.activeGameRows}</p>
          <p className="mt-1">releases {targetState.counts.releaseRows} / current {targetState.counts.currentReleaseRows}</p>
          <p className="mt-1">workspace {targetState.counts.workspaceRows} / games {targetState.counts.workspaceGameRows} / files {targetState.counts.workspaceFileRows}</p>
          <p className="mt-1">identity {String(targetState.integrity.creatorIdentityPresent)} / state tokens {String(targetState.integrity.sourceStateTokenValid && targetState.integrity.publicStateTokenValid && targetState.integrity.unrelatedPrivateStateTokenValid)}</p>
        </div>}
      </section>

      <section className="rounded-2xl border border-white/10 bg-slate-900 p-5">
        <h2 className="text-lg font-black">Local bundle identity</h2>
        <p className="mt-2 text-sm leading-6 text-slate-300">
          file bytesはブラウザ内だけで検証し、planを押すまでHosted Developmentへ送信しません。
        </p>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <div><dt className="text-slate-400">target</dt><dd className="font-bold text-white">{target}</dd></div>
          <div><dt className="text-slate-400">expected</dt><dd className="font-bold text-white">{spec.bundleBytes} bytes / {spec.gameCount} games</dd></div>
          <div className="sm:col-span-2"><dt className="text-slate-400">expected SHA-256</dt><dd className="break-all font-mono text-xs text-white">{spec.bundleSha256}</dd></div>
        </dl>
        <label className="mt-5 block text-sm font-bold text-white">
          user-local ZIP bundle
          <input
            type="file"
            accept=".zip,application/zip"
            onChange={(event) => void selectFile(event)}
            disabled={planLocked || executeLocked}
            className="mt-2 block w-full rounded-xl border border-white/15 bg-black/25 px-4 py-3 text-sm text-slate-200 file:mr-4 file:rounded-lg file:border-0 file:bg-cyan-300 file:px-3 file:py-2 file:font-bold file:text-slate-950 disabled:opacity-50"
          />
        </label>
        {operationState === "verifying" && <p role="status" className="mt-3 text-sm text-cyan-100">client-side SHA-256確認中…</p>}
        {verified && <div data-private-workspace-import-client-verified={target} className="mt-4 rounded-xl border border-emerald-300/30 bg-emerald-300/10 p-4 text-sm text-emerald-50">
          <p className="font-black">client-side identity: VERIFIED</p>
          <p className="mt-1">target {verified.target} / {verified.bytes} bytes</p>
          <p className="mt-1 break-all font-mono text-xs">SHA-256 {verified.sha256}</p>
          <p className="mt-1 break-all font-mono text-xs">fixed operation ID {verified.operationId}</p>
        </div>}
      </section>

      <section className="rounded-2xl border border-amber-300/25 bg-amber-300/10 p-5">
        <h2 className="text-lg font-black text-amber-100">Write-free plan</h2>
        <p className="mt-2 text-sm leading-6 text-slate-200">同じbundleを検証し、writes 0のtarget-bound receiptだけを作成します。plan送信は1回でロックされます。</p>
        <button
          type="button"
          onClick={() => void requestPlan()}
          disabled={!verified || planLocked || operationState === "verifying" || operationState === "stopped"}
          className="mt-4 w-full rounded-xl bg-amber-300 px-4 py-3 font-black text-slate-950 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {operationState === "planning" ? "plan確認中…" : planLocked ? "plan送信済み" : "write-free planを確認"}
        </button>
        {plan && <div data-private-workspace-import-plan="accepted" className="mt-4 rounded-xl border border-emerald-300/30 bg-emerald-300/10 p-4 text-sm text-emerald-50">
          <p className="font-black">PLAN / writesPerformed={plan.writesPerformed}</p>
          <p className="mt-1">target {plan.target} / workspace 1 / games {plan.privateGameRows} / files {plan.privateFileRows}</p>
          <p className="mt-1">private-quarantined / owner unbound / grants・releases・publications・aliases・Rooms 0</p>
          <p className="mt-2 break-all font-mono text-xs">target-bound receipt {plan.planReceipt}</p>
        </div>}
      </section>

      <section className="rounded-2xl border border-rose-300/25 bg-rose-300/10 p-5">
        <h2 className="text-lg font-black text-rose-100">Single-use import execute</h2>
        <p className="mt-2 text-sm leading-6 text-slate-200">同じFile object、固定operation ID、表示済みreceiptでPOSTを最大1回だけ送信します。再送・自動retryはありません。</p>
        <button
          type="button"
          onClick={() => void execute()}
          disabled={!verified || !plan || executeLocked}
          className="mt-4 w-full rounded-xl bg-rose-300 px-4 py-3 font-black text-slate-950 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {operationState === "executing" ? "import実行中…" : executeLocked ? "execute 1/1消費済み" : "private workspaceへ1回だけimport"}
        </button>
      </section>

      {executeLocked && verified && plan && operationState !== "completed" && <section className="rounded-2xl border border-cyan-300/25 bg-cyan-300/10 p-5">
        <h2 className="text-lg font-black text-cyan-100">Read-only status reconciliation</h2>
        <p className="mt-2 text-sm leading-6 text-slate-200">execute POSTは再送せず、同じoperation ID／receipt／bundle hashのGETだけでcompleted receiptを確認します。</p>
        <button
          type="button"
          onClick={() => void reconcileStatus(verified, plan)}
          disabled={operationState === "executing" || operationState === "reconciling"}
          className="mt-4 w-full rounded-xl border border-cyan-200/40 px-4 py-3 font-black text-cyan-50 disabled:opacity-40"
        >
          {operationState === "reconciling" ? "read-only確認中…" : "同じoperationをread-onlyで再確認"}
        </button>
      </section>}

      {message && <p role="alert" className="rounded-xl border border-amber-300/30 bg-amber-300/10 p-4 text-sm leading-6 text-amber-50">{message}</p>}
      {acceptance && operationState === "completed" && <Acceptance value={acceptance} />}
    </div>
  );
}

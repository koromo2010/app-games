"use client";

import { useRouter } from "next/navigation";
import { type ChangeEvent, type FormEvent, useRef, useState } from "react";
import { productionPrivateWorkspaceImportTargetSpec } from "@/apps/sdk-portal/lib/production-private-workspace-import-public-contract";
import {
  diagnoseProductionPrivateWorkspaceImportTargetState,
  parseProductionPrivateWorkspaceImportExecute,
  parseProductionPrivateWorkspaceImportPlan,
  parseProductionPrivateWorkspaceImportStatus,
  parseProductionPrivateWorkspaceImportTargetState,
  verifyProductionPrivateWorkspaceImportFile,
  type ProductionPrivateWorkspaceImportAcceptance,
  type ProductionPrivateWorkspaceImportPlan,
  type ProductionPrivateWorkspaceImportTargetState,
  type VerifiedProductionPrivateWorkspaceImportFile,
} from "@/lib/production-private-workspace-import-client";
import type {
  ProductionPrivateWorkspaceImportPageAccess,
  ProductionPrivateWorkspaceImportPageMode,
} from "@/lib/production-private-workspace-import-page-access";
import { performSdkMigration011TotpStepUp } from "@/lib/sdk-migration-011-step-up-client";

type State = "idle" | "verifying" | "verified" | "planning" | "planned" | "executing" | "reconciling" | "completed" | "stopped";

async function payload(response: Response) {
  try {
    const value = await response.json();
    return value && typeof value === "object" && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

function Acceptance({ value }: { value: ProductionPrivateWorkspaceImportAcceptance }) {
  return (
    <section className="rounded-2xl border border-emerald-300/30 bg-emerald-300/10 p-5" data-production-private-import-acceptance="complete">
      <h2 className="text-lg font-black text-emerald-100">Read-only acceptance: COMPLETE</h2>
      <p className="mt-3 text-sm">workspace {value.workspaceRows} / games {value.gameRows} / files {value.fileRows}</p>
      <p className="mt-2 text-sm">private={String(value.private)} / quarantined={String(value.quarantined)} / owner={value.ownerBinding}</p>
      <p className="mt-2 text-sm">public exposure {value.publicExposure} / grants {value.grants} / releases {value.releases} / publications {value.publications} / aliases {value.aliases} / Rooms {value.rooms}</p>
      <p className="mt-3 break-all font-mono text-xs">bundle {value.bundleSha256}</p>
      <p className="mt-1 break-all font-mono text-xs">manifest {value.workspaceManifestSha256}</p>
      <p className="mt-1 break-all font-mono text-xs">ledger {value.perGameLedgerSha256}</p>
      <p className="mt-1 break-all font-mono text-xs">receipt {value.statusReceipt}</p>
    </section>
  );
}

function TargetStateEvidence({
  value,
  expectedCreatorIdentitySha256,
}: {
  value: ProductionPrivateWorkspaceImportTargetState;
  expectedCreatorIdentitySha256: string;
}) {
  const failures = diagnoseProductionPrivateWorkspaceImportTargetState(value, expectedCreatorIdentitySha256);
  return (
    <div
      className={`mt-4 rounded-xl border p-4 text-sm ${failures.length === 0
        ? "border-emerald-300/30 bg-emerald-300/10"
        : "border-amber-300/30 bg-amber-300/10"}`}
      data-production-private-import-target-state={failures.length === 0 ? "ready" : "blocked"}
    >
      <p className="font-black">TARGET STATE: {failures.length === 0 ? "READY" : "BLOCKED"}</p>
      <p className="mt-2">creator identity exact={String(value.creatorIdentitySha256 === expectedCreatorIdentitySha256)} / A3 exact={String(value.recoveryIdentityExact)}</p>
      <p className="mt-2">creator {value.counts.creatorRows}/{value.counts.deletedCreatorRows}/{value.counts.creatorOwnerRows} / games {value.counts.gameRows}/{value.counts.deletedGameRows}/{value.counts.activeGameRows}</p>
      <p className="mt-2">releases {value.counts.releaseRows}/{value.counts.currentReleaseRows} / A3 {value.counts.recoveryOperationRows}/{value.counts.recoveryQuarantineGameRows}</p>
      <p className="mt-2">workspace {value.counts.workspaceRows}/{value.counts.workspaceGameRows}/{value.counts.workspaceFileRows}</p>
      <p className="mt-2">state tokens source={String(value.sourceStateTokenValid)} / public={String(value.publicStateTokenValid)} / unrelated-private={String(value.unrelatedPrivateStateTokenValid)}</p>
      {failures.length > 0 && <ul className="mt-3 list-disc space-y-1 pl-5 font-mono text-xs" data-production-private-import-target-failures>
        {failures.map((failure) => <li key={`${failure.code}:${failure.field}`}>
          {failure.code}: {failure.field} expected={String(failure.expected)} observed={String(failure.observed)}
        </li>)}
      </ul>}
    </div>
  );
}

export function ProductionPrivateWorkspaceImportPanel({
  mode,
  initialAccess,
}: {
  mode: ProductionPrivateWorkspaceImportPageMode;
  initialAccess: ProductionPrivateWorkspaceImportPageAccess;
}) {
  const router = useRouter();
  const [totp, setTotp] = useState("");
  const [stepUpBusy, setStepUpBusy] = useState(false);
  const [state, setState] = useState<State>("idle");
  const [verified, setVerified] = useState<VerifiedProductionPrivateWorkspaceImportFile | null>(null);
  const [targetState, setTargetState] = useState<ProductionPrivateWorkspaceImportTargetState | null>(null);
  const [plan, setPlan] = useState<ProductionPrivateWorkspaceImportPlan | null>(null);
  const [acceptance, setAcceptance] = useState<ProductionPrivateWorkspaceImportAcceptance | null>(null);
  const [message, setMessage] = useState("");
  const [targetStateLocked, setTargetStateLocked] = useState(false);
  const [planLocked, setPlanLocked] = useState(false);
  const [executeLocked, setExecuteLocked] = useState(false);
  const selection = useRef(0);
  const targetStateUsed = useRef(false);
  const planUsed = useRef(false);
  const executeUsed = useRef(false);

  const stepUp = async (event: FormEvent) => {
    event.preventDefault();
    if (stepUpBusy || totp.length !== 6) return;
    setStepUpBusy(true);
    const result = await performSdkMigration011TotpStepUp(totp);
    setTotp("");
    if (result.kind === "verified") router.refresh();
    else setMessage(`Authenticator確認を完了できません (${result.code})。`);
    setStepUpBusy(false);
  };

  const selectFile = async (event: ChangeEvent<HTMLInputElement>) => {
    if (planUsed.current || executeUsed.current) return;
    const version = ++selection.current;
    const file = event.target.files?.[0];
    setVerified(null);
    setTargetState(null);
    setPlan(null);
    setAcceptance(null);
    setMessage("");
    if (!file) return setState("idle");
    setState("verifying");
    const result = await verifyProductionPrivateWorkspaceImportFile(file, "moi-lab2");
    if (selection.current !== version) return;
    if (result.kind === "rejected") {
      setState("stopped");
      setMessage(`local bundleを受理できません (${result.code})。bundleは送信していません。`);
      return;
    }
    setVerified(result.value);
    setState("verified");
  };

  const checkTarget = async () => {
    if (mode !== "execution" || targetStateUsed.current || !verified) return;
    targetStateUsed.current = true;
    setTargetStateLocked(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/sdk-production-private-workspace-import/moi-lab2/target-state", {
        method: "GET",
        cache: "no-store",
      });
      const parsed = response.ok
        ? parseProductionPrivateWorkspaceImportTargetState(await payload(response), "moi-lab2")
        : null;
      if (!parsed) {
        setState("stopped");
        setMessage("Production target preflightの応答形式が不正です。bundleは送信していません。");
        return;
      }
      setTargetState(parsed);
      const failures = diagnoseProductionPrivateWorkspaceImportTargetState(
        parsed,
        verified.manifest.creatorIdentitySha256,
      );
      if (failures.length > 0) {
        setState("stopped");
        setMessage(`Production target preflightはBLOCKEDです (${failures.map(({ code }) => code).join(", ")})。bundleは送信していません。`);
        return;
      }
    } catch {
      setState("stopped");
      setMessage("Production targetのread-only確認結果が不明です。bundleは送信していません。");
    }
  };

  const requestPlan = async () => {
    if (mode !== "execution" || !verified || !targetState?.ready || planUsed.current) return;
    planUsed.current = true;
    setPlanLocked(true);
    setState("planning");
    setMessage("");
    try {
      const response = await fetch("/api/admin/sdk-production-private-workspace-import/moi-lab2/plan", {
        method: "POST",
        headers: { "Content-Type": "application/zip" },
        body: verified.file,
      });
      const parsed = response.ok
        ? parseProductionPrivateWorkspaceImportPlan(await payload(response), "moi-lab2", verified)
        : null;
      if (!parsed) {
        setState("stopped");
        setMessage("write-free planを安全に確認できません。planは再送しません。");
        return;
      }
      setPlan(parsed);
      setState("planned");
    } catch {
      setState("stopped");
      setMessage("write-free planの結果が不明です。planは再送しません。");
    }
  };

  const reconcile = async (
    selected: VerifiedProductionPrivateWorkspaceImportFile,
    prepared: ProductionPrivateWorkspaceImportPlan,
  ) => {
    setState("reconciling");
    try {
      const response = await fetch(
        `/api/admin/sdk-production-private-workspace-import/moi-lab2/status/${encodeURIComponent(selected.operationId)}`,
        {
          method: "GET",
          headers: {
            "X-Game-Fields-Production-Private-Import-Plan-Receipt": prepared.planReceipt,
            "X-Game-Fields-Production-Private-Import-Bundle-Sha256": selected.sha256,
          },
          cache: "no-store",
        },
      );
      const parsed = parseProductionPrivateWorkspaceImportStatus(
        await payload(response),
        "moi-lab2",
        selected.operationId,
      );
      if (response.ok && parsed?.state === "completed") {
        setAcceptance(parsed.acceptance);
        setState("completed");
        return;
      }
      setState("stopped");
      setMessage(response.status === 404 && parsed?.state === "not-found"
        ? "completed receiptは観測されていません。execute POSTは再送しません。"
        : "read-only statusを安全に確認できません。execute POSTは再送しません。");
    } catch {
      setState("stopped");
      setMessage("read-only status結果が不明です。execute POSTは再送しません。");
    }
  };

  const execute = async () => {
    if (mode !== "execution" || !verified || !plan || executeUsed.current) return;
    executeUsed.current = true;
    setExecuteLocked(true);
    setState("executing");
    setMessage("");
    try {
      const response = await fetch("/api/admin/sdk-production-private-workspace-import/moi-lab2/execute", {
        method: "POST",
        headers: {
          "Content-Type": "application/zip",
          "X-Game-Fields-Production-Private-Import-Operation-Id": verified.operationId,
          "X-Game-Fields-Production-Private-Import-Plan-Receipt": plan.planReceipt,
        },
        body: verified.file,
      });
      if (response.ok) parseProductionPrivateWorkspaceImportExecute(
        await payload(response), "moi-lab2", verified.operationId,
      );
    } catch {
      // Reconciliation below is the only follow-up; execute is never retried.
    }
    await reconcile(verified, plan);
  };

  if (initialAccess === "step-up-required") return (
    <section className="rounded-2xl border border-cyan-300/30 bg-cyan-300/10 p-5">
      <h2 className="text-lg font-black">Authenticator step-up</h2>
      <p className="mt-2 text-sm">full Site Admin sessionは有効です。Production import前にrecent MFAを更新します。成功してもimportは自動実行されません。</p>
      <form className="mt-4 space-y-3" onSubmit={stepUp}>
        <input type="password" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required value={totp} onChange={(event) => setTotp(event.target.value.replace(/\D/g, "").slice(0, 6))} className="w-full rounded-xl border border-cyan-200/30 bg-slate-950 px-4 py-3 font-mono text-lg tracking-[0.35em]" />
        <button disabled={stepUpBusy || totp.length !== 6} className="w-full rounded-xl bg-cyan-300 px-4 py-3 font-black text-slate-950 disabled:opacity-40">Authenticatorを確認</button>
      </form>
      {message && <p role="alert" className="mt-4 text-sm text-rose-100">{message}</p>}
    </section>
  );

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-white/10 bg-slate-900 p-5">
        <h2 className="text-lg font-black">User-local bundle identity</h2>
        <p className="mt-2 text-sm text-slate-300">bytes、bundle SHA、manifest、ledger、file countをこのブラウザ内だけで確認します。</p>
        <p className="mt-3 break-all font-mono text-xs">expected {productionPrivateWorkspaceImportTargetSpec.bundleSha256}</p>
        <input type="file" accept=".zip,application/zip" onChange={(event) => void selectFile(event)} disabled={planLocked || executeLocked} className="mt-4 block w-full rounded-xl border border-white/15 bg-black/25 px-4 py-3 text-sm file:mr-4 file:rounded-lg file:border-0 file:bg-cyan-300 file:px-3 file:py-2 file:font-bold file:text-slate-950" />
        {state === "verifying" && <p className="mt-3 text-sm text-cyan-100">bundleをlocal-onlyで検証中…</p>}
        {verified && <div className="mt-4 rounded-xl border border-emerald-300/30 bg-emerald-300/10 p-4 text-sm" data-production-private-import-client-verified>
          <p className="font-black">LOCAL IDENTITY: VERIFIED</p>
          <p className="mt-2">bytes {verified.bytes} / games {verified.manifest.gameCount} / entries {verified.manifest.entryCount} / runtime files {verified.manifest.runtimeFileCount}</p>
          <p className="mt-2 break-all font-mono text-xs">bundle {verified.sha256}</p>
          <p className="mt-1 break-all font-mono text-xs">manifest {verified.manifest.workspaceManifestSha256}</p>
          <p className="mt-1 break-all font-mono text-xs">ledger {verified.manifest.perGameLedgerSha256}</p>
          <p className="mt-1 break-all font-mono text-xs">Production operation {verified.operationId}</p>
          <p className="mt-1 break-all font-mono text-xs">target identity {verified.manifest.creatorIdentitySha256}</p>
        </div>}
      </section>

      {mode === "preparation" && verified && <section className="rounded-2xl border border-amber-300/30 bg-amber-300/10 p-5">
        <h2 className="text-lg font-black text-amber-100">APPROVAL_REQUEST準備完了</h2>
        <p className="mt-2 text-sm">この画面にはupload、plan、execute controlがありません。上のexact identityをcheckpointへ固定して承認待ちに進めます。</p>
      </section>}

      {mode === "execution" && <>
        <section className="rounded-2xl border border-cyan-300/30 bg-cyan-300/10 p-5">
          <h2 className="text-lg font-black">Production target preflight</h2>
          <button type="button" onClick={() => void checkTarget()} disabled={!verified || targetStateLocked} className="mt-4 w-full rounded-xl border border-cyan-200/40 px-4 py-3 font-black disabled:opacity-40">read-only target stateを1回確認</button>
          {targetState && verified && <TargetStateEvidence
            value={targetState}
            expectedCreatorIdentitySha256={verified.manifest.creatorIdentitySha256}
          />}
        </section>
        <section className="rounded-2xl border border-amber-300/30 bg-amber-300/10 p-5">
          <h2 className="text-lg font-black">Write-free plan</h2>
          <button type="button" onClick={() => void requestPlan()} disabled={!verified || !targetState?.ready || planLocked} className="mt-4 w-full rounded-xl bg-amber-300 px-4 py-3 font-black text-slate-950 disabled:opacity-40">承認済みbundleでplanを1回送信</button>
          {plan && <p className="mt-3 break-all font-mono text-xs">receipt {plan.planReceipt}</p>}
        </section>
        <section className="rounded-2xl border border-rose-300/30 bg-rose-300/10 p-5">
          <h2 className="text-lg font-black">Single-use Production import</h2>
          <button type="button" onClick={() => void execute()} disabled={!plan || executeLocked} className="mt-4 w-full rounded-xl bg-rose-300 px-4 py-3 font-black text-slate-950 disabled:opacity-40">private workspaceを1件だけ作成</button>
          <p className="mt-2 text-xs">結果不明でもPOSTは再送せず、同じoperationのstatus GETだけを使用します。</p>
        </section>
      </>}

      {acceptance && <Acceptance value={acceptance} />}
      {message && <p role="alert" className="rounded-xl border border-amber-300/30 bg-amber-300/10 p-4 text-sm">{message}</p>}
    </div>
  );
}

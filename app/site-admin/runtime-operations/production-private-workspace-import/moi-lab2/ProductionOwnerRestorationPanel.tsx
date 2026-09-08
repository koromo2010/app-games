"use client";

import { useRef, useState } from "react";
import {
  initialCompletionDiagnosticProjection,
  projectCompletionDiagnosticResponse,
  projectCompletionDiagnosticTransportFailure,
  startCompletionDiagnosticProjection,
} from "@/lib/production-owner-restoration-diagnostic-projection";

const fixedProductionAccountFingerprint = "opf_v1_QTP2zsdJ7Z6c6vgDTPI03XbqOJgsiJfzrGrs2D6L-nM";

type AccountProjection = {
  schemaVersion: 1;
  environment: "production" | "development";
  target: "moi-lab2";
  selectionBasis: "OPERATOR_SELECTED_RESTORATION_TARGET";
  username: "moi";
  accountState: "ACTIVE_RECOVERY_READY" | "ACTIVE_RECOVERY_UNREGISTERED";
  grant: "present" | "absent";
  fingerprint: string;
};

type OwnerBindingPlan = {
  schemaVersion: 1;
  environment: "production" | "development";
  phase: "write-free-owner-binding-plan";
  target: "moi-lab2";
  selectionBasis: "OPERATOR_SELECTED_RESTORATION_TARGET";
  username: "moi";
  accountFingerprint: string;
  workspaceIdentity: { operationId: string; bundleSha256: string; workspaceManifestSha256: string; perGameLedgerSha256: string; fingerprint: string };
  counts: { workspaces: 1; games: 2; runtimeFiles: 21 };
  currentWorkspaceStateToken: string;
  plannedEffect: { ownerBindings: 1; ownerUsername: "moi"; visibilityAfter: "private-quarantined"; quarantinedAfter: true; publicAfter: false };
  nonEffects: { grants: 0; releases: 0; publications: 0; aliases: 0; rooms: 0 };
  planReceipt: string;
};

const fingerprintPattern = /^opf_v1_[A-Za-z0-9_-]{43}$/;
const workspaceFingerprintPattern = /^wpf_v1_[A-Za-z0-9_-]{43}$/;
const stateTokenPattern = /^wst_v1_[A-Za-z0-9_-]{43}$/;
const planReceiptPattern = /^obp_v1_[A-Za-z0-9_-]{43}$/;
const sha256Pattern = /^[0-9a-f]{64}$/;

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function exactKeys(value: Record<string, unknown>, keys: string[]) {
  return Object.keys(value).sort().join(",") === [...keys].sort().join(",");
}

function parseAccount(value: unknown): AccountProjection | null {
  const v = object(value);
  if (!v || !exactKeys(v, ["schemaVersion", "environment", "target", "selectionBasis", "username", "accountState", "grant", "fingerprint"])) return null;
  if (v.schemaVersion !== 1 || (v.environment !== "production" && v.environment !== "development")
    || v.target !== "moi-lab2" || v.selectionBasis !== "OPERATOR_SELECTED_RESTORATION_TARGET"
    || v.username !== "moi" || (v.accountState !== "ACTIVE_RECOVERY_READY" && v.accountState !== "ACTIVE_RECOVERY_UNREGISTERED")
    || (v.grant !== "present" && v.grant !== "absent") || typeof v.fingerprint !== "string" || !fingerprintPattern.test(v.fingerprint)) return null;
  return v as AccountProjection;
}

function parsePlan(value: unknown, account: AccountProjection | null): OwnerBindingPlan | null {
  const v = object(value); const wi = object(v?.workspaceIdentity); const counts = object(v?.counts);
  const effect = object(v?.plannedEffect); const non = object(v?.nonEffects);
  if (!v || !wi || !counts || !effect || !non) return null;
  if (!exactKeys(v, ["schemaVersion", "environment", "phase", "target", "selectionBasis", "username", "accountFingerprint", "workspaceIdentity", "counts", "currentWorkspaceStateToken", "plannedEffect", "nonEffects", "planReceipt"])) return null;
  if (!exactKeys(wi, ["operationId", "bundleSha256", "workspaceManifestSha256", "perGameLedgerSha256", "fingerprint"])
    || !exactKeys(counts, ["workspaces", "games", "runtimeFiles"])
    || !exactKeys(effect, ["ownerBindings", "ownerUsername", "visibilityAfter", "quarantinedAfter", "publicAfter"])
    || !exactKeys(non, ["grants", "releases", "publications", "aliases", "rooms"])) return null;
  if (v.schemaVersion !== 1 || (v.environment !== "production" && v.environment !== "development")
    || (account && v.environment !== account.environment) || v.phase !== "write-free-owner-binding-plan"
    || v.target !== "moi-lab2" || v.selectionBasis !== "OPERATOR_SELECTED_RESTORATION_TARGET"
    || v.username !== "moi" || typeof v.accountFingerprint !== "string" || !fingerprintPattern.test(v.accountFingerprint)
    || (v.environment === "production" && v.accountFingerprint !== fixedProductionAccountFingerprint)
    || (account && v.accountFingerprint !== account.fingerprint)
    || wi.operationId !== "06eb6940-fd24-59b0-8d00-47eba9a9ce8c"
    || typeof wi.bundleSha256 !== "string" || !sha256Pattern.test(wi.bundleSha256)
    || typeof wi.workspaceManifestSha256 !== "string" || !sha256Pattern.test(wi.workspaceManifestSha256)
    || typeof wi.perGameLedgerSha256 !== "string" || !sha256Pattern.test(wi.perGameLedgerSha256)
    || typeof wi.fingerprint !== "string" || !workspaceFingerprintPattern.test(wi.fingerprint)
    || counts.workspaces !== 1 || counts.games !== 2 || counts.runtimeFiles !== 21
    || typeof v.currentWorkspaceStateToken !== "string" || !stateTokenPattern.test(v.currentWorkspaceStateToken)
    || effect.ownerBindings !== 1 || effect.ownerUsername !== "moi" || effect.visibilityAfter !== "private-quarantined"
    || effect.quarantinedAfter !== true || effect.publicAfter !== false
    || non.grants !== 0 || non.releases !== 0 || non.publications !== 0 || non.aliases !== 0 || non.rooms !== 0
    || typeof v.planReceipt !== "string" || !planReceiptPattern.test(v.planReceipt)) return null;
  return v as OwnerBindingPlan;
}

async function json(response: Response) { try { return await response.json(); } catch { return null; } }

const safePlanErrorCodes = new Set([
  "OWNER_RESTORATION_ACCOUNT_NOT_FOUND",
  "OWNER_RESTORATION_ACCOUNT_AMBIGUOUS",
  "OWNER_RESTORATION_ACCOUNT_FINGERPRINT_CHANGED",
  "OWNER_RESTORATION_INTERNAL_AUTH_REJECTED",
  "OWNER_RESTORATION_WORKSPACE_NOT_FOUND",
  "OWNER_RESTORATION_WORKSPACE_UNAVAILABLE",
  "OWNER_RESTORATION_WORKSPACE_RESPONSE_INVALID",
  "OWNER_RESTORATION_PLAN_INPUT_INVALID",
  "OWNER_RESTORATION_PLAN_UNAVAILABLE",
]);

function safePlanError(value: unknown) {
  const v = object(value);
  return v && typeof v.error === "string" && safePlanErrorCodes.has(v.error)
    ? v.error
    : "OWNER_RESTORATION_PLAN_UNAVAILABLE";
}

export function ProductionOwnerRestorationPanel() {
  const [account, setAccount] = useState<AccountProjection | null>(null);
  const [plan, setPlan] = useState<OwnerBindingPlan | null>(null);
  const [diagnosticState, setDiagnosticState] = useState(initialCompletionDiagnosticProjection);
  const [message, setMessage] = useState("");
  const [accountLocked, setAccountLocked] = useState(false);
  const [planLocked, setPlanLocked] = useState(false);
  const diagnosticRequestInFlight = useRef(false);

  const readAccount = async () => {
    if (accountLocked) return;
    setAccountLocked(true); setMessage(""); setPlan(null);
    try {
      const response = await fetch("/api/admin/sdk-production-private-workspace-owner-restoration/moi-lab2/account", { method: "GET", cache: "no-store" });
      const parsed = parseAccount(await json(response));
      if (!response.ok || !parsed) throw new Error();
      setAccount(parsed);
    } catch { setMessage("exact username moi のsecret-free fingerprintを安全に固定できませんでした。"); }
  };

  const readPlan = async () => {
    if (planLocked) return;
    setPlanLocked(true); setMessage("");
    try {
      const response = await fetch("/api/admin/sdk-production-private-workspace-owner-restoration/moi-lab2/plan", { method: "GET", cache: "no-store" });
      const payload = await json(response);
      if (!response.ok) {
        setMessage(`write-free plan fail-closed: ${safePlanError(payload)}`);
        return;
      }
      const parsed = parsePlan(payload, account);
      if (!parsed) {
        setMessage("write-free plan fail-closed: OWNER_RESTORATION_PLAN_RESPONSE_INVALID");
        return;
      }
      setPlan(parsed);
    } catch { setMessage("write-free plan fail-closed: OWNER_RESTORATION_PLAN_UNAVAILABLE"); }
  };

  const readDiagnostic = async () => {
    if (diagnosticState.consumed || diagnosticRequestInFlight.current) return;
    diagnosticRequestInFlight.current = true;
    setDiagnosticState((current) => startCompletionDiagnosticProjection(current));
    try {
      const response = await fetch("/api/admin/sdk-production-private-workspace-owner-restoration/moi-lab2/completed-import-diagnostic", { method: "GET", cache: "no-store" });
      const payload = await json(response);
      setDiagnosticState(projectCompletionDiagnosticResponse(response.status, payload));
    } catch { setDiagnosticState(projectCompletionDiagnosticTransportFailure());
    } finally { diagnosticRequestInFlight.current = false; }
  };

  const diagnostic = diagnosticState.phase === "result" ? diagnosticState.diagnostic : null;

  return <section className="rounded-2xl border border-violet-300/30 bg-violet-300/10 p-5" data-production-owner-restoration>
    <h2 className="text-lg font-black">Owner restoration preparation</h2>
    <p className="mt-2 text-sm">operator-selected mapping: workspace <b>moi-lab2</b> → exact username <b>moi</b></p>
    <p className="mt-1 text-xs text-slate-300">この画面はfingerprint取得とwrite-free planだけを行い、owner bindingやgrant等は実行しません。</p>
    <p className="mt-1 break-all font-mono text-xs text-slate-400">fixed Production account fingerprint {fixedProductionAccountFingerprint}</p>
    <button type="button" onClick={() => void readAccount()} disabled={accountLocked} className="mt-4 w-full rounded-xl border border-violet-200/40 px-4 py-3 font-black disabled:opacity-40">exact moi account fingerprintを1回確認</button>
    {account && <div className="mt-4 rounded-xl border border-emerald-300/30 bg-emerald-300/10 p-4 text-sm" data-owner-account-fingerprint>
      <p className="font-black">EXACT ACCOUNT: UNIQUE</p>
      <p className="mt-2">username {account.username} / state {account.accountState} / grant {account.grant}</p>
      <p className="mt-2 break-all font-mono text-xs">fingerprint {account.fingerprint}</p>
    </div>}
    <button type="button" onClick={() => void readDiagnostic()} disabled={diagnosticState.consumed} className="mt-4 w-full rounded-xl border border-violet-200/40 px-4 py-3 font-black disabled:opacity-40">canonical completed-import diagnosticを1回確認</button>
    {diagnosticState.phase === "pending" && <p className="mt-4 rounded-xl border border-sky-300/30 bg-sky-300/10 p-4 text-sm" data-completed-import-diagnostic-pending>completed-import diagnosticを安全に確認しています。</p>}
    {diagnosticState.consumed && <p className="mt-2 text-sm" data-completed-import-diagnostic-http data-completed-import-diagnostic-consumed>
      HTTP {diagnosticState.phase === "pending" ? "未確定" : diagnosticState.httpStatus ?? "応答未確認"} / 診断送信済み（再送不可）
    </p>}
    {diagnostic && <div className="mt-4 rounded-xl border border-sky-300/30 bg-sky-300/10 p-4 text-sm" data-completed-import-diagnostic>
      <p className="font-black">COMPLETED-IMPORT DIAGNOSTIC</p>
      <p className="mt-2">canonical reader {diagnostic.canonicalReader.matched ? "MATCHED" : "EXCLUDED"} / exclusions {diagnostic.canonicalReader.excludedBy.join(",") || "none"}</p>
      <p className="mt-2">operation {diagnostic.operation.row} / state {diagnostic.operation.state} / phase {diagnostic.operation.phase}</p>
      <p className="mt-2">workspace join {diagnostic.workspace.join} / private-quarantined {diagnostic.workspace.privateQuarantined} / unbound {diagnostic.workspace.ownerUnbound}</p>
      <p className="mt-2">bundle {diagnostic.integrity.bundleMatch} / manifest {diagnostic.integrity.manifestMatch} / ledger {diagnostic.integrity.ledgerMatch}</p>
      <p className="mt-2">games 2 {diagnostic.integrity.games2} / runtime files 21 {diagnostic.integrity.runtimeFiles21} / non-effects grants {diagnostic.nonEffects.grants0} release {diagnostic.nonEffects.releases0} publication {diagnostic.nonEffects.publications0}</p>
      <p className="mt-2 break-all font-mono text-xs">database selector match {String(diagnostic.database.selectorMatch)} / fingerprint match {String(diagnostic.database.fingerprintMatch)}</p>
    </div>}
    {diagnostic?.completionEvidence && <div className="mt-4 break-all rounded-xl border border-sky-300/30 p-4 text-sm" data-completed-import-completion-evidence>
      <p className="font-black">完了記録の照合資料（修復可否は未判定）</p>
      <p>同一SQL snapshot / receipt {diagnostic.completionEvidence.terminalReceiptState} / read-back SHA {diagnostic.completionEvidence.readBackShaState} / completed_at {diagnostic.completionEvidence.completedAtState}</p>
      <p>DB内plan整合 {diagnostic.completionEvidence.planSelfConsistency} / 実file hash {diagnostic.completionEvidence.fileContentHashes} / game-file集合 {diagnostic.completionEvidence.gameFileSets} / provenance {diagnostic.completionEvidence.gameProvenance}</p>
      <p>原本bundle・元plan・before-stateとの一致、広域tokenの履歴は未照合です。</p>
      <details className="mt-2"><summary>offline照合用の安全なJSON</summary><pre className="whitespace-pre-wrap text-xs">{JSON.stringify(diagnostic.completionEvidence, null, 2)}</pre></details>
    </div>}
    {diagnosticState.phase === "failure" && <p role="alert" className="mt-4 rounded-xl border border-amber-300/30 bg-amber-300/10 p-4 text-sm" data-completed-import-diagnostic-failure>completed-import diagnostic fail-closed: {diagnosticState.code}</p>}
    <button type="button" onClick={() => void readPlan()} disabled={planLocked} className="mt-4 w-full rounded-xl bg-violet-300 px-4 py-3 font-black text-slate-950 disabled:opacity-40">owner bindingのwrite-free planを1回確認</button>
    {plan && <div className="mt-4 rounded-xl border border-emerald-300/30 bg-emerald-300/10 p-4 text-sm" data-owner-binding-write-free-plan>
      <p className="font-black">WRITE-FREE OWNER-BINDING PLAN</p>
      <p className="mt-2">workspace {plan.counts.workspaces} / games {plan.counts.games} / runtime files {plan.counts.runtimeFiles}</p>
      <p className="mt-2">effect owner binding 1 / after private-quarantined / public=false</p>
      <p className="mt-2">non-effects grants 0 / releases 0 / publications 0 / aliases 0 / Rooms 0</p>
      <p className="mt-2 break-all font-mono text-xs">account {plan.accountFingerprint}</p>
      <p className="mt-1 break-all font-mono text-xs">workspace {plan.workspaceIdentity.fingerprint}</p>
      <p className="mt-1 break-all font-mono text-xs">state {plan.currentWorkspaceStateToken}</p>
      <p className="mt-1 break-all font-mono text-xs">receipt {plan.planReceipt}</p>
    </div>}
    {message && <p role="alert" className="mt-4 rounded-xl border border-amber-300/30 bg-amber-300/10 p-4 text-sm">{message}</p>}
  </section>;
}

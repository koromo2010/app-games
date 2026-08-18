"use client";

import { GAME_SDK_CREATOR_VISIBLE_MODULE_CATALOG, type GameSdkModuleId } from "@game-fields/game-sdk/modules";
import { useState } from "react";
import type { CreatorModuleProfileProposalView } from "@/lib/module-profile-proposal-store";

type Props = { initialProposal: CreatorModuleProfileProposalView; initialAudit: unknown[]; instanceId: string; gameId: string };

export function ModuleProfileProposalReview({ initialProposal, initialAudit, instanceId, gameId }: Props) {
  const [proposal, setProposal] = useState(initialProposal);
  const [decisions, setDecisions] = useState<Record<string, { mode: "required" | "disabled"; reason?: string }>>(
    Object.fromEntries(initialProposal.diff.map((item) => [item.id, item.after])),
  );
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const labels = new Map(GAME_SDK_CREATOR_VISIBLE_MODULE_CATALOG.map((item) => [item.id, item.label]));

  const edit = (id: GameSdkModuleId, value: { mode: "required" | "disabled"; reason?: string }) => setDecisions((current) => ({ ...current, [id]: value }));
  const save = async () => {
    setBusy(true); setMessage("");
    const response = await fetch(`/api/instances/${encodeURIComponent(instanceId)}/games/${encodeURIComponent(gameId)}/module-proposals/${encodeURIComponent(proposal.id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ moduleDecisions: decisions }) });
    const result = await response.json().catch(() => null);
    if (!response.ok || !result?.proposal) { setMessage(result?.error ?? "変更案を保存できませんでした。"); setBusy(false); return; }
    setProposal(result.proposal as CreatorModuleProfileProposalView); setMessage("変更案を更新しました。内容を確認してから承認してください。"); setBusy(false);
  };
  const approve = async () => {
    if (!window.confirm("このmodule構成変更案を本人の判断で承認し、active profileを更新しますか？")) return;
    setBusy(true); setMessage("");
    const response = await fetch(`/api/instances/${encodeURIComponent(instanceId)}/games/${encodeURIComponent(gameId)}/module-proposals/${encodeURIComponent(proposal.id)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirm: true }) });
    const result = await response.json().catch(() => null);
    if (!response.ok || result?.approved !== true) { setMessage(result?.error ?? "承認できませんでした。"); setBusy(false); return; }
    setProposal((current) => ({ ...current, status: "approved", approvalAllowed: false, activeProfileChanged: true }));
    setMessage("承認しました。active profileを更新し、以前のprototype承認を無効化しました。"); setBusy(false);
  };

  return <div className="dashboard-empty" data-module-proposal-review>
    <p><strong>状態:</strong> {proposal.status} · proposer {proposal.proposerClient} · environment {proposal.environment}</p>
    <p><strong>base revision:</strong> {proposal.baseModuleProfileRevision}<br /><strong>base digest:</strong> {proposal.baseModuleContractDigest}</p>
    {proposal.compatibilityState !== "compatible" && <p role="status">
      この変更案は現在のモジュール構成ルールと互換性がないため、詳細表示・編集・承認はできません。active profileは変更されていません。
    </p>}
    {proposal.compatibilityState === "compatible" && <>
    <h2>変更差分</h2>
    <div className="module-review-list">{proposal.diff.map((item) => {
      const choice = decisions[item.id] ?? item.after;
      return <div className="module-review-row" key={item.id}><div><strong>{labels.get(item.id) ?? item.id}</strong><p>{item.id}: {item.before.mode} → {choice.mode}</p></div><label>判定<select value={choice.mode} disabled={proposal.status !== "pending" || busy} onChange={(event) => edit(item.id, event.target.value === "disabled" ? { mode: "disabled", reason: choice.reason ?? "" } : { mode: "required" })}><option value="required">required</option><option value="disabled">disabled</option></select></label>{choice.mode === "disabled" && <label>理由<input value={choice.reason ?? ""} disabled={proposal.status !== "pending" || busy} onChange={(event) => edit(item.id, { mode: "disabled", reason: event.target.value })} /></label>}</div>;
    })}</div>
    <h2>依存関係・影響・警告</h2><ul>{proposal.dependencies.map((item) => <li key={`dependency-${item}`}>{item}</li>)}{proposal.impact.map((item) => <li key={`impact-${item}`}>{item}</li>)}{proposal.warnings.map((item) => <li key={`warning-${item}`}>{item}</li>)}</ul>
    <p><strong>仕様:</strong> {String(proposal.specification.title ?? "")} — {String(proposal.specification.coreLoop ?? "")}</p>
    {proposal.approvalAllowed && <div className="module-review-actions"><button type="button" onClick={save} disabled={busy}>変更案を保存</button><button type="button" onClick={approve} disabled={busy}>この変更案を承認</button></div>}
    </>}
    {message && <p role="status">{message}</p>}
    <details><summary>監査履歴 ({initialAudit.length})</summary><p>状態遷移の履歴を保持しています。非公開のmodule差分は表示しません。</p></details>
  </div>;
}

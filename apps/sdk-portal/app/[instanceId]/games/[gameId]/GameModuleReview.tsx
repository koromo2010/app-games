"use client";

import {
  GAME_SDK_CREATOR_CONFIGURABLE_MODULE_IDS,
  GAME_SDK_CREATOR_VISIBLE_MODULE_CATALOG,
  type CreatorGameSdkModuleProfile,
  type GameSdkModuleGroup,
  type GameSdkModuleId,
} from "@game-fields/game-sdk/modules";
import { classifyCreatorGameModules } from "@/lib/module-profile-classification";
import Link from "next/link";
import { useMemo, useRef, useState } from "react";

type ModuleContractSummary = {
  moduleProfileRevision: string;
  moduleContractDigest: string | null;
  moduleProfileConfirmedAt: string | null;
  establishmentKind: "initial-default" | "human-confirmation" | "pending-human-confirmation";
  origin: "system-default" | "owner-confirmation" | "unestablished-change";
  changeConfirmationState: "none" | "pending-human-confirmation";
  humanConfirmationRequired: boolean;
  prototypeAuthoringAllowed: boolean;
  pendingProposal: { id: string; createdAt: string | null } | null;
  auditRecord: {
    event: "initial-default-established" | "human-confirmed" | "module-contract-unestablished";
    actorKind: "system" | "owner" | null;
    occurredAt: string | null;
  };
};

type Props = {
  instanceId: string;
  gameId: string;
  initialProfile: CreatorGameSdkModuleProfile;
  canCustomize: boolean;
  placement?: "fixed" | "inline";
  initialContract?: ModuleContractSummary | null;
};

const groupLabels: Record<GameSdkModuleGroup, string> = {
  platform: "Platform固定",
  shell: "共通シェル",
  flow: "進行部品",
  resource: "素材・外部機能",
};

function profileSignature(profile: CreatorGameSdkModuleProfile) {
  return JSON.stringify(profile);
}

export function GameModuleReview({
  instanceId,
  gameId,
  initialProfile,
  canCustomize,
  placement = "fixed",
  initialContract = null,
}: Props) {
  const [open, setOpen] = useState(false);
  const [profile, setProfile] = useState(initialProfile);
  const [savedProfile] = useState(initialProfile);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [contract, setContract] = useState(initialContract);
  const [proposalReviewUrl, setProposalReviewUrl] = useState<string | null>(null);
  const proposalRequestId = useRef<string | null>(null);
  const classification = classifyCreatorGameModules(profile);
  const readOnlySet = new Set(classification.required);
  const configurableSet = new Set(GAME_SDK_CREATOR_CONFIGURABLE_MODULE_IDS);
  const composedCount = classification.required.length
    + classification.removable.length;
  const dirty = profileSignature(profile) !== profileSignature(savedProfile);
  const definitionsByGroup = useMemo(() => (
    Object.fromEntries(
      (Object.keys(groupLabels) as GameSdkModuleGroup[]).map((group) => [
        group,
        GAME_SDK_CREATOR_VISIBLE_MODULE_CATALOG.filter(
          (definition) => definition.group === group,
        ),
      ]),
    ) as Record<
      GameSdkModuleGroup,
      typeof GAME_SDK_CREATOR_VISIBLE_MODULE_CATALOG[number][]
    >
  ), []);

  const setRequired = (id: GameSdkModuleId, required: boolean) => {
    const definition = GAME_SDK_CREATOR_VISIBLE_MODULE_CATALOG.find(
      (item) => item.id === id,
    );
    if (!canCustomize || !definition || !configurableSet.has(id)) return;
    if (required) {
      setProfile((current) => ({
        ...current,
        [id]: { mode: "required" },
      }));
      setMessage("");
      return;
    }
    setProfile((value) => ({
      ...value,
      [id]: { mode: "disabled" },
    }));
    setMessage("");
  };

  const resetRequired = () => {
    setProfile((current) => Object.fromEntries(
      GAME_SDK_CREATOR_VISIBLE_MODULE_CATALOG.map((definition) => [
        definition.id,
        configurableSet.has(definition.id)
          ? { mode: "required" as const }
          : current[definition.id] ?? { mode: "required" as const },
      ]),
    ) as CreatorGameSdkModuleProfile);
    setMessage("");
  };

  const save = async () => {
    if (!canCustomize || saving || !dirty) return;
    setSaving(true);
    setMessage("");
    setProposalReviewUrl(null);
    const updates = Object.fromEntries(
      GAME_SDK_CREATOR_VISIBLE_MODULE_CATALOG
        .filter((definition) => configurableSet.has(definition.id))
        .map((definition) => [
          definition.id,
          profile[definition.id] ?? { mode: "required" as const },
        ]),
    );
    proposalRequestId.current ??= crypto.randomUUID();
    try {
      const response = await fetch(
        `/api/instances/${instanceId}/games/${gameId}/modules`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            updates,
            requestId: proposalRequestId.current,
          }),
        },
      );
      const result = await response.json().catch(() => null) as {
        saved?: boolean;
        noChange?: boolean;
        activeProfileChanged?: boolean;
        humanConfirmationRequired?: boolean;
        moduleContract?: ModuleContractSummary;
        proposal?: { id?: string };
        reviewUrl?: string;
      } | null;
      if (!response.ok || result?.saved !== true) {
        throw new Error("SAVE_FAILED");
      }
      proposalRequestId.current = null;
      if (result.noChange === true && result.moduleContract) {
        setProfile(savedProfile);
        setContract(result.moduleContract);
        setMessage("canonical profileは現在のcontractと同一です。変更案や再確認は発生していません。");
      } else if (
        result.activeProfileChanged === false
        && result.humanConfirmationRequired === true
        && result.proposal?.id
        && result.reviewUrl
      ) {
        setProfile(savedProfile);
        if (result.moduleContract) setContract(result.moduleContract);
        setProposalReviewUrl(result.reviewUrl);
        setMessage("module構成の変更案を保存しました。active profileはまだ変更されていません。");
      } else {
        throw new Error("SAVE_FAILED");
      }
    } catch {
      setMessage("保存できませんでした。ログイン状態を確認してください。");
    } finally {
      setSaving(false);
    }
  };

  const confirm = async () => {
    if (saving || dirty) return;
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch(
        `/api/instances/${instanceId}/games/${gameId}/modules`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ humanConfirmed: true }),
        },
      );
      const result = await response.json().catch(() => null) as {
        confirmed?: boolean;
        contractEstablished?: boolean;
        moduleContract?: {
          moduleProfileRevision: string;
          moduleContractDigest: string;
          confirmedAt: string;
          moduleContractState: ModuleContractSummary;
        };
      } | null;
      if (
        !response.ok
        || result?.confirmed !== true
        || result.contractEstablished !== true
        || !result.moduleContract?.moduleContractState
      ) {
        throw new Error("CONFIRM_FAILED");
      }
      setContract(result.moduleContract.moduleContractState);
      setMessage("module profileを人間の判断で確定しました。制作クライアントへ戻り、操作プロトタイプ作成を続けられます。");
    } catch {
      setMessage("確定できませんでした。保存状態とログイン状態を確認してください。");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={`module-review module-review--${placement}`}>
      <button
        type="button"
        className="module-review-trigger"
        onClick={() => setOpen(true)}
      >
        共通モジュール
        <strong>
          進行・共通 {composedCount} · 任意 {classification.available.length} · 共通DB {classification.standard.length}
        </strong>
      </button>
      {open && (
        <div
          className="module-review-backdrop"
          onClick={() => setOpen(false)}
        >
          <aside
            className="module-review-panel"
            aria-label="共通モジュール契約"
            onClick={(event) => event.stopPropagation()}
          >
            <header>
              <div>
                <p>INITIAL DEFAULT / HUMAN REVIEW ON CHANGE</p>
                <h2>共通モジュール</h2>
              </div>
              <button type="button" onClick={() => setOpen(false)}>
                閉じる
              </button>
            </header>
            <div className="module-review-intro">
              <strong>
                このゲームで確認できるモジュールは{GAME_SDK_CREATOR_VISIBLE_MODULE_CATALOG.length}件です。
              </strong>
              <span>
                初期デフォルトはsystem-default由来のcontractとして自動確定されます。人間が確認した記録にはせず、構成を変更する場合だけ変更案と本人確認が必要です。
              </span>
              <span>
                共通DBはPlatform標準として固定です。LLM・トランプ・描画はゲーム側が必要に応じて自由に利用でき、module構成で使用を強制・禁止しません。
              </span>
              {!canCustomize && (
                <span>
                  この環境では共通モジュールのカスタマイズを利用できません。
                </span>
              )}
              <span>
                確認専用 {classification.required.length}件 · 使用 {classification.removable.length}件 · 未使用 {classification.optional.length}件 · 任意利用 {classification.available.length}件 · 共通DB標準 {classification.standard.length}件
              </span>
              <span>
                状態: {contract?.changeConfirmationState === "pending-human-confirmation"
                  ? `module変更の人間確認待ち（active contract: ${contract.establishmentKind === "initial-default" ? "初期デフォルト" : "人間が明示確定済み"}）`
                  : contract?.establishmentKind === "initial-default"
                    ? "初期デフォルトで自動確定"
                    : contract?.establishmentKind === "human-confirmation"
                      ? "人間が明示確定済み"
                      : "module contract未確定"}
                {contract?.moduleProfileRevision ? ` · profile ${contract.moduleProfileRevision}` : ""}
              </span>
              {contract?.auditRecord && (
                <span>
                  由来: {contract.origin} · audit {contract.auditRecord.event} / actor {contract.auditRecord.actorKind ?? "none"}
                </span>
              )}
            </div>
            <div className="module-review-list">
              {(Object.keys(groupLabels) as GameSdkModuleGroup[])
                .filter((group) => definitionsByGroup[group].length > 0)
                .map(
                (group) => (
                  <section key={group}>
                    <h3>{groupLabels[group]}</h3>
                    {definitionsByGroup[group].map((definition) => {
                      const decision = profile[definition.id]
                        ?? (definition.profilePolicy === "available"
                          || definition.profilePolicy === "platform-standard"
                          ? { mode: "available" as const }
                          : { mode: "required" as const });
                      const required = decision.mode === "required";
                      const tierLabel = definition.profilePolicy === "platform-standard"
                        ? "共通DB標準"
                        : definition.profilePolicy === "available"
                          ? "任意利用"
                          : readOnlySet.has(definition.id)
                        ? "確認専用"
                        : required
                          ? "使用"
                          : "未使用";
                      const selectable = configurableSet.has(definition.id);
                      return (
                        <div className="module-review-item" key={definition.id}>
                          {selectable ? (
                            <input
                              type="checkbox"
                              aria-label={`${definition.label}を使用する`}
                              checked={required}
                              disabled={!canCustomize}
                              onChange={(event) => setRequired(
                                definition.id,
                                event.target.checked,
                              )}
                            />
                          ) : (
                            <span className="module-review-policy-marker" aria-hidden="true">
                              {definition.profilePolicy === "available" ? "任" : "固"}
                            </span>
                          )}
                          <span>
                            <b>{definition.label}</b>
                            <small>{definition.description}</small>
                            <em>{tierLabel}</em>
                            {decision.mode === "disabled" && decision.reason && (
                              <em>未使用の理由: {decision.reason}</em>
                            )}
                          </span>
                        </div>
                      );
                    })}
                  </section>
                ),
              )}
            </div>
            <footer>
              <div>
                <strong>
                  確認専用 {classification.required.length} · 使用 {classification.removable.length} · 未使用 {classification.optional.length} · 任意 {classification.available.length} · 共通DB {classification.standard.length}
                </strong>
                {message && <span role="status">{message}</span>}
                {proposalReviewUrl && (
                  <Link href={proposalReviewUrl}>変更案を確認して確定する</Link>
                )}
              </div>
              <button type="button" disabled={!canCustomize} onClick={resetRequired}>
                初期分類に戻す
              </button>
              <button
                type="button"
                disabled={!canCustomize || !dirty || saving}
                onClick={() => void save()}
              >
                {saving ? "保存中…" : "module変更案を作成"}
              </button>
              {contract?.establishmentKind === "pending-human-confirmation" && (
                <button
                  type="button"
                  disabled={saving || dirty}
                  onClick={() => void confirm()}
                >
                  変更後のmodule構成を確定
                </button>
              )}
            </footer>
          </aside>
        </div>
      )}
    </div>
  );
}

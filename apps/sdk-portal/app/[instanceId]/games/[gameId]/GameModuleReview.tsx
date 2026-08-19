"use client";

import {
  GAME_SDK_CREATOR_CONFIGURABLE_MODULE_IDS,
  GAME_SDK_CREATOR_VISIBLE_MODULE_CATALOG,
  type CreatorGameSdkModuleProfile,
  type GameSdkModuleGroup,
  type GameSdkModuleId,
} from "@game-fields/game-sdk/modules";
import { classifyCreatorGameModules } from "@/lib/module-profile-classification";
import { useMemo, useState } from "react";

type Props = {
  instanceId: string;
  gameId: string;
  initialProfile: CreatorGameSdkModuleProfile;
  canCustomize: boolean;
  placement?: "fixed" | "inline";
  initialContract?: {
    moduleProfileRevision: string;
    moduleContractDigest: string | null;
    moduleProfileConfirmedAt: string | null;
  } | null;
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
  const [savedProfile, setSavedProfile] = useState(initialProfile);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [contract, setContract] = useState(initialContract);
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
    const updates = Object.fromEntries(
      GAME_SDK_CREATOR_VISIBLE_MODULE_CATALOG
        .filter((definition) => configurableSet.has(definition.id))
        .map((definition) => [
          definition.id,
          profile[definition.id] ?? { mode: "required" as const },
        ]),
    );
    try {
      const response = await fetch(
        `/api/instances/${instanceId}/games/${gameId}/modules`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ updates }),
        },
      );
      const result = await response.json().catch(() => null) as {
        saved?: boolean;
        moduleProfile?: CreatorGameSdkModuleProfile;
        moduleContract?: Props["initialContract"];
      } | null;
      if (!response.ok || result?.saved !== true || !result.moduleProfile) {
        throw new Error("SAVE_FAILED");
      }
      setProfile(result.moduleProfile);
      setSavedProfile(result.moduleProfile);
      setContract(result.moduleContract ?? null);
      setMessage("module profileを保存しました。操作プロトタイプ作成前に内容を確定してください。");
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
        moduleContract?: {
          moduleProfileRevision: string;
          moduleContractDigest: string;
          confirmedAt: string;
        };
      } | null;
      if (!response.ok || result?.confirmed !== true || !result.moduleContract) {
        throw new Error("CONFIRM_FAILED");
      }
      setContract({
        moduleProfileRevision: result.moduleContract.moduleProfileRevision,
        moduleContractDigest: result.moduleContract.moduleContractDigest,
        moduleProfileConfirmedAt: result.moduleContract.confirmedAt,
      });
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
            aria-label="共通モジュールの人間レビュー"
            onClick={(event) => event.stopPropagation()}
          >
            <header>
              <div>
                <p>HUMAN REVIEW ONLY</p>
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
                進行部品は原則必須です。不要な場合はAIから削除を提案でき、人間の確認後にだけ外せます。制作GPTには確定後のpackage向け契約だけを渡します。
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
                状態: {contract?.moduleProfileConfirmedAt ? "確定済み" : "未確定"}
                {contract?.moduleProfileRevision ? ` · profile ${contract.moduleProfileRevision}` : ""}
              </span>
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
              </div>
              <button type="button" disabled={!canCustomize} onClick={resetRequired}>
                初期分類に戻す
              </button>
              <button
                type="button"
                disabled={!canCustomize || !dirty || saving}
                onClick={() => void save()}
              >
                {saving ? "保存中…" : "人間の判断を保存"}
              </button>
              <button
                type="button"
                disabled={saving || dirty || Boolean(contract?.moduleProfileConfirmedAt)}
                onClick={() => void confirm()}
              >
                このmodule構成を確定
              </button>
            </footer>
          </aside>
        </div>
      )}
    </div>
  );
}

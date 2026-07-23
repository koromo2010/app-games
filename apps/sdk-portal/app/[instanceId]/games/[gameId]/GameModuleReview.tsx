"use client";

import {
  GAME_SDK_MODULE_CATALOG,
  GAME_SDK_MODULE_IDS,
  type GameSdkModuleGroup,
  type GameSdkModuleId,
  type GameSdkModuleProfile,
} from "@game-fields/game-sdk/modules";
import { classifyCreatorGameModules } from "@/lib/module-profile-classification";
import { useMemo, useState } from "react";

type Props = {
  instanceId: string;
  gameId: string;
  initialProfile: GameSdkModuleProfile;
  canCustomize: boolean;
};

const groupLabels: Record<GameSdkModuleGroup, string> = {
  platform: "Platform固定",
  shell: "共通シェル",
  flow: "進行部品",
  resource: "素材・外部機能",
};

function profileSignature(profile: GameSdkModuleProfile) {
  return JSON.stringify(profile);
}

export function GameModuleReview({
  instanceId,
  gameId,
  initialProfile,
  canCustomize,
}: Props) {
  const [open, setOpen] = useState(false);
  const [profile, setProfile] = useState(initialProfile);
  const [savedProfile, setSavedProfile] = useState(initialProfile);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const classification = classifyCreatorGameModules(profile);
  const requiredSet = new Set(classification.required);
  const composedCount = classification.required.length
    + classification.removable.length;
  const dirty = profileSignature(profile) !== profileSignature(savedProfile);
  const definitionsByGroup = useMemo(() => (
    Object.fromEntries(
      (Object.keys(groupLabels) as GameSdkModuleGroup[]).map((group) => [
        group,
        GAME_SDK_MODULE_CATALOG.filter(
          (definition) => definition.group === group,
        ),
      ]),
    ) as Record<
      GameSdkModuleGroup,
      typeof GAME_SDK_MODULE_CATALOG[number][]
    >
  ), []);

  const setRequired = (id: GameSdkModuleId, required: boolean) => {
    const definition = GAME_SDK_MODULE_CATALOG.find(
      (item) => item.id === id,
    );
    if (!canCustomize || !definition || requiredSet.has(id)) return;
    if (required) {
      setProfile((current) => ({
        ...current,
        [id]: { mode: "required" },
      }));
      setMessage("");
      return;
    }
    const current = profile[id];
    const reason = window.prompt(
      `${definition.label}を必須から外す理由を入力してください。`,
      current.mode === "disabled" ? current.reason : "",
    )?.trim();
    if (!reason) return;
    setProfile((value) => ({
      ...value,
      [id]: {
        mode: "disabled",
        reason: reason.slice(0, 240),
      },
    }));
    setMessage("");
  };

  const resetRequired = () => {
    setProfile((current) => Object.fromEntries(
      GAME_SDK_MODULE_CATALOG.map((definition) => [
        definition.id,
        !requiredSet.has(definition.id)
          ? { mode: "required" as const }
          : current[definition.id],
      ]),
    ) as GameSdkModuleProfile);
    setMessage("");
  };

  const save = async () => {
    if (!canCustomize || saving || !dirty) return;
    setSaving(true);
    setMessage("");
    const updates = Object.fromEntries(
      GAME_SDK_MODULE_CATALOG
        .filter((definition) => !requiredSet.has(definition.id))
        .map((definition) => [
          definition.id,
          profile[definition.id],
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
        moduleProfile?: GameSdkModuleProfile;
      } | null;
      if (!response.ok || result?.saved !== true || !result.moduleProfile) {
        throw new Error("SAVE_FAILED");
      }
      setProfile(result.moduleProfile);
      setSavedProfile(result.moduleProfile);
      setMessage("人間レビューのmodule profileを保存しました。");
    } catch {
      setMessage("保存できませんでした。ログイン状態を確認してください。");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="module-review">
      <button
        type="button"
        className="module-review-trigger"
        onClick={() => setOpen(true)}
      >
        共通モジュール
        <strong>{composedCount}/{GAME_SDK_MODULE_IDS.length} 使用</strong>
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
                初期モックは全{GAME_SDK_MODULE_IDS.length}件を使用します。
              </strong>
              <span>
                必須はPlatform固定、解除可は初期必須、任意は自動合成しません。制作GPTには確定後の必須一覧だけを渡します。
              </span>
              {!canCustomize && (
                <span>
                  この環境では共通モジュールのカスタマイズを利用できません。
                </span>
              )}
              <span>
                必須 {classification.required.length}件 · 解除可 {classification.removable.length}件 · 任意 {classification.optional.length}件
              </span>
            </div>
            <div className="module-review-list">
              {(Object.keys(groupLabels) as GameSdkModuleGroup[]).map(
                (group) => (
                  <section key={group}>
                    <h3>{groupLabels[group]}</h3>
                    {definitionsByGroup[group].map((definition) => {
                      const decision = profile[definition.id];
                      const required = decision.mode === "required";
                      const tierLabel = requiredSet.has(definition.id)
                        ? "必須"
                        : required
                          ? "解除可"
                          : "任意";
                      return (
                        <label key={definition.id}>
                          <input
                            type="checkbox"
                            checked={required}
                            disabled={!canCustomize || requiredSet.has(definition.id)}
                            onChange={(event) => setRequired(
                              definition.id,
                              event.target.checked,
                            )}
                          />
                          <span>
                            <b>{definition.label}</b>
                            <small>{definition.description}</small>
                            <em>{tierLabel}{requiredSet.has(definition.id) ? " · Platform固定" : ""}</em>
                            {decision.mode === "disabled" && decision.reason && (
                              <em>任意化理由: {decision.reason}</em>
                            )}
                          </span>
                        </label>
                      );
                    })}
                  </section>
                ),
              )}
            </div>
            <footer>
              <div>
                <strong>
                  必須 {classification.required.length} · 解除可 {classification.removable.length} · 任意 {classification.optional.length}
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
            </footer>
          </aside>
        </div>
      )}
    </div>
  );
}

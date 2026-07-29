"use client";

import { useState } from "react";
import {
  gameSdkSettingOptionValue,
  type GameSdkSettingDefinition,
  type GameSdkSettingValue,
} from "@game-fields/game-sdk";
import { panel, secondary } from "./game-sdk-frame-shared";
import type { CommonView, PackageRoom, SafeCommand } from "./game-sdk-frame-types";

type Props = {
  room: PackageRoom;
  common: CommonView | undefined;
  visible: boolean;
  settingDefinitions: readonly GameSdkSettingDefinition[];
  pending: boolean;
  defaultsEndpoint: string;
  onSaveDefaults: (settings: Record<string, GameSdkSettingValue>) => void;
  setMessage: (message: string) => void;
  run: (operation: () => Promise<PackageRoom>) => Promise<PackageRoom | null>;
  send: (command: SafeCommand) => Promise<PackageRoom>;
};

export function GameSdkLobbyPanel({
  room,
  common,
  visible,
  settingDefinitions,
  pending,
  defaultsEndpoint,
  onSaveDefaults,
  setMessage,
  run,
  send,
}: Props) {
  const [copyingInvite, setCopyingInvite] = useState(false);
  if (!visible) return null;

  const copyInviteLink = async () => {
    if (copyingInvite) return;
    setCopyingInvite(true);
    try {
      const inviteUrl = `${window.location.origin}/join/${encodeURIComponent(room.code)}`;
      await navigator.clipboard.writeText(inviteUrl);
      setMessage("招待リンクをコピーしました。");
    } catch {
      setMessage("招待リンクをコピーできませんでした。ブラウザの権限を確認してください。");
    } finally {
      setCopyingInvite(false);
    }
  };

  return (
    <div className={panel}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-black">部屋設定</h2>
        <button
          type="button"
          className={secondary}
          disabled={copyingInvite}
          onClick={() => void copyInviteLink()}
        >
          {copyingInvite ? "コピー中…" : "招待リンクをコピー"}
        </button>
      </div>
      <div className="mt-3 space-y-3">
        {settingDefinitions.map((definition) => {
          const value = common?.settings[definition.key]
            ?? definition.defaultValue;
          return (
            <label key={definition.key} className="block text-sm font-bold">
              {definition.label.ja}
              {definition.type === "select" && definition.options ? (
                <select
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
                  disabled={!common?.permissions.canEditRoomSettings || pending}
                  value={String(value)}
                  onChange={(event) => {
                    const option = definition.options?.find(
                      (candidate) => String(gameSdkSettingOptionValue(candidate)) === event.target.value,
                    );
                    if (!option) return;
                    void run(() => send({
                      type: "room/update-settings",
                      settings: {
                        [definition.key]: gameSdkSettingOptionValue(option),
                      },
                    }));
                  }}
                >
                  {definition.options.map((option) => {
                    const optionValue = gameSdkSettingOptionValue(option);
                    return <option key={String(optionValue)} value={String(optionValue)}>{typeof option === "object" ? option.label.ja : `${optionValue}${definition.unit?.ja ?? ""}`}</option>;
                  })}
                </select>
              ) : definition.type === "boolean" ? (
                <input
                  type="checkbox"
                  className="mt-2 block size-5 accent-cyan-600"
                  disabled={!common?.permissions.canEditRoomSettings || pending}
                  checked={value === true}
                  onChange={(event) => {
                    void run(() => send({
                      type: "room/update-settings",
                      settings: {
                        [definition.key]: event.target.checked,
                      },
                    }));
                  }}
                />
              ) : definition.type === "number" ? (
                <input
                  key={`${room.revision}:${definition.key}`}
                  type="number"
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
                  disabled={!common?.permissions.canEditRoomSettings || pending}
                  defaultValue={typeof value === "number" ? value : ""}
                  min={definition.minimum}
                  max={definition.maximum}
                  onBlur={(event) => {
                    const nextValue = Number(event.target.value);
                    if (!Number.isFinite(nextValue) || nextValue === value) return;
                    void run(() => send({
                      type: "room/update-settings",
                      settings: {
                        [definition.key]: nextValue,
                      },
                    }));
                  }}
                />
              ) : definition.type === "text" ? (
                <input
                  key={`${room.revision}:${definition.key}`}
                  type="text"
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
                  disabled={!common?.permissions.canEditRoomSettings || pending}
                  defaultValue={typeof value === "string" ? value : ""}
                  onBlur={(event) => {
                    if (event.target.value === value) return;
                    void run(() => send({
                      type: "room/update-settings",
                      settings: {
                        [definition.key]: event.target.value,
                      },
                    }));
                  }}
                />
              ) : (
                <span className="mt-1 block rounded-lg bg-slate-100 px-3 py-2">{String(value)}</span>
              )}
            </label>
          );
        })}
      </div>
      {common?.permissions.canEditRoomSettings && (
        <button
          type="button"
          className={`${secondary} mt-4 w-full`}
          disabled={pending}
          onClick={() => void fetch(defaultsEndpoint, {
            method: "PUT",
            credentials: "same-origin",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ settings: common.settings }),
          }).then(async (response) => {
            if (!response.ok) throw new Error("DEFAULT_SAVE_FAILED");
            const body = await response.json() as {
              settings: Record<string, GameSdkSettingValue>;
            };
            onSaveDefaults(body.settings);
            setMessage("この設定を次回の既定値に保存しました。");
          }).catch(() => {
            setMessage("既定値を保存できませんでした。");
          })}
        >
          この設定を次回の既定値にする
        </button>
      )}
    </div>
  );
}

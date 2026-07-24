"use client";

import { RoomTimeLimitControl } from "@/app/components/RoomTimeLimitControl";
import {
  gameSdkSettingOptionValue,
  type GameSdkSettingDefinition,
  type GameSdkSettingOption,
  type GameSdkSettingPlatformRole,
  type GameSdkSettingValue,
} from "@game-fields/game-sdk";

export type SdkPreviewSettingValues = Record<string, GameSdkSettingValue>;

type Props = {
  definitions: readonly GameSdkSettingDefinition[];
  values: SdkPreviewSettingValues;
  onChange: (
    definition: GameSdkSettingDefinition,
    value: GameSdkSettingValue,
  ) => void;
};

const controlClass =
  "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20";

export function createSdkPreviewSettingValues(
  definitions: readonly GameSdkSettingDefinition[],
): SdkPreviewSettingValues {
  return Object.fromEntries(
    definitions.map((definition) => [
      definition.key,
      definition.defaultValue,
    ]),
  );
}

export function sdkPreviewSettingByRole(
  definitions: readonly GameSdkSettingDefinition[],
  role: GameSdkSettingPlatformRole,
) {
  return definitions.find((definition) => definition.platformRole === role);
}

export function sdkPreviewNumericSettingValue(
  definitions: readonly GameSdkSettingDefinition[],
  values: SdkPreviewSettingValues,
  role: GameSdkSettingPlatformRole,
) {
  const definition = sdkPreviewSettingByRole(definitions, role);
  const value = definition ? values[definition.key] : undefined;
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : null;
}

function optionLabel(
  option: string | number | GameSdkSettingOption,
) {
  return typeof option === "object"
    ? option.label.ja
    : String(option);
}

function optionWithValue(
  definition: GameSdkSettingDefinition,
  rawValue: string,
) {
  return definition.options?.find(
    (option) => String(gameSdkSettingOptionValue(option)) === rawValue,
  );
}

function clampNumber(
  definition: GameSdkSettingDefinition,
  value: number,
) {
  const minimum = definition.minimum ?? (
    definition.platformRole === "time-limit" ? 0 : Number.MIN_SAFE_INTEGER
  );
  const maximum = definition.maximum ?? (
    definition.platformRole === "time-limit" ? 3600 : Number.MAX_SAFE_INTEGER
  );
  const clamped = Math.max(minimum, Math.min(maximum, value));
  return definition.platformRole ? Math.floor(clamped) : clamped;
}

function settingUnit(
  definition: GameSdkSettingDefinition,
) {
  return definition.unit?.ja ?? "";
}

export function formatSdkPreviewSettingValue(
  definition: GameSdkSettingDefinition,
  value: GameSdkSettingValue,
) {
  if (definition.platformRole === "time-limit" && value === 0) {
    return "なし";
  }
  if (definition.type === "boolean") {
    return value === true ? "あり" : "なし";
  }
  const selected = definition.options?.find(
    (option) => gameSdkSettingOptionValue(option) === value,
  );
  const label = selected ? optionLabel(selected) : String(value);
  return `${label}${settingUnit(definition)}`;
}

export function SdkPreviewSettingsControl({
  definitions,
  values,
  onChange,
}: Props) {
  return (
    <div className="space-y-4" data-sdk-preview-settings>
      {definitions.map((definition) => {
        const value = values[definition.key] ?? definition.defaultValue;
        const id = `sdk-preview-setting-${definition.key}`;
        if (definition.platformRole === "time-limit") {
          const presets = (definition.options ?? []).flatMap((option) => {
            const optionValue = gameSdkSettingOptionValue(option);
            return typeof optionValue === "number" ? [optionValue] : [];
          });
          const presetLabels = new Map(
            (definition.options ?? []).flatMap((option) => {
              const optionValue = gameSdkSettingOptionValue(option);
              return typeof optionValue === "number" && typeof option === "object"
                ? [[optionValue, option.label.ja] as const]
                : [];
            }),
          );
          return (
            <div key={definition.key}>
              <RoomTimeLimitControl
                label={definition.label.ja}
                value={typeof value === "number" ? value : 0}
                onChange={(seconds) => onChange(
                  definition,
                  clampNumber(definition, seconds),
                )}
                presets={presets}
                allowCustom={definition.type === "number"}
                minimumSeconds={Math.max(0, definition.minimum ?? 0)}
                maximumSeconds={Math.min(3600, definition.maximum ?? 3600)}
                formatPreset={(seconds) => presetLabels.get(seconds) ?? (
                  seconds === 0 ? "なし" : `${seconds}秒`
                )}
              />
              {definition.help?.ja && (
                <p className="mt-1 text-xs text-slate-500">{definition.help.ja}</p>
              )}
            </div>
          );
        }
        if (definition.type === "boolean") {
          return (
            <label
              key={definition.key}
              htmlFor={id}
              className="flex items-center justify-between gap-4 rounded-lg border border-slate-200 px-3 py-2"
            >
              <span>
                <span className="block text-sm font-bold text-slate-700">
                  {definition.label.ja}
                </span>
                {definition.help?.ja && (
                  <span className="mt-1 block text-xs text-slate-500">
                    {definition.help.ja}
                  </span>
                )}
              </span>
              <input
                id={id}
                type="checkbox"
                checked={value === true}
                onChange={(event) => onChange(definition, event.target.checked)}
                className="h-5 w-5 accent-cyan-600"
              />
            </label>
          );
        }
        if (definition.type === "select") {
          return (
            <label key={definition.key} htmlFor={id} className="block">
              <span className="text-sm font-bold text-slate-700">
                {definition.label.ja}
              </span>
              <select
                id={id}
                value={String(value)}
                onChange={(event) => {
                  const selected = optionWithValue(
                    definition,
                    event.target.value,
                  );
                  if (selected !== undefined) {
                    onChange(definition, gameSdkSettingOptionValue(selected));
                  }
                }}
                className={controlClass}
              >
                {definition.options?.map((option) => {
                  const optionValue = gameSdkSettingOptionValue(option);
                  return (
                    <option
                      key={`${typeof optionValue}:${String(optionValue)}`}
                      value={String(optionValue)}
                    >
                      {optionLabel(option)}{settingUnit(definition)}
                    </option>
                  );
                })}
              </select>
              {definition.help?.ja && (
                <span className="mt-1 block text-xs text-slate-500">
                  {definition.help.ja}
                </span>
              )}
            </label>
          );
        }
        if (definition.type === "number") {
          return (
            <label key={definition.key} htmlFor={id} className="block">
              <span className="text-sm font-bold text-slate-700">
                {definition.label.ja}
              </span>
              <span className="mt-1 flex items-center gap-2">
                <input
                  id={id}
                  type="number"
                  value={typeof value === "number" ? value : 0}
                  min={definition.minimum}
                  max={definition.maximum}
                  onChange={(event) => onChange(
                    definition,
                    clampNumber(definition, Number(event.target.value)),
                  )}
                  className={`${controlClass} mt-0`}
                />
                {settingUnit(definition) && (
                  <span className="text-sm text-slate-600">
                    {settingUnit(definition)}
                  </span>
                )}
              </span>
              {definition.help?.ja && (
                <span className="mt-1 block text-xs text-slate-500">
                  {definition.help.ja}
                </span>
              )}
            </label>
          );
        }
        return (
          <label key={definition.key} htmlFor={id} className="block">
            <span className="text-sm font-bold text-slate-700">
              {definition.label.ja}
            </span>
            <input
              id={id}
              type="text"
              value={typeof value === "string" ? value : ""}
              maxLength={200}
              onChange={(event) => onChange(definition, event.target.value)}
              className={controlClass}
            />
            {definition.help?.ja && (
              <span className="mt-1 block text-xs text-slate-500">
                {definition.help.ja}
              </span>
            )}
          </label>
        );
      })}
    </div>
  );
}

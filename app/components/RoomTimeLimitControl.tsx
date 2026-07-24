"use client";

import { commonTimeLimitMaxSeconds, commonTimeLimitOptions } from "@/lib/game-room-config";
import { useAppLocale } from "./AppLocaleProvider";

type RoomTimeLimitControlProps = {
  label: string;
  value: number;
  onChange: (seconds: number) => void;
  presets?: readonly number[];
  allowCustom?: boolean;
  minimumSeconds?: number;
  maximumSeconds?: number;
  formatPreset?: (seconds: number) => string;
};

const controlClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20";

export function RoomTimeLimitControl({
  label,
  value,
  onChange,
  presets = commonTimeLimitOptions,
  allowCustom = true,
  minimumSeconds = 0,
  maximumSeconds = commonTimeLimitMaxSeconds,
  formatPreset,
}: RoomTimeLimitControlProps) {
  const { t } = useAppLocale();
  const normalizedPresets = [...new Set(
    presets
      .filter((seconds) => Number.isFinite(seconds))
      .map((seconds) => Math.max(
        minimumSeconds,
        Math.min(maximumSeconds, Math.floor(seconds)),
      )),
  )].sort((a, b) => a - b);
  const presetValue = normalizedPresets.includes(value)
    ? String(value)
    : "custom";

  return (
    <fieldset>
      <legend className="text-sm font-medium text-slate-700">{label}</legend>
      <div className={`mt-1 grid gap-2 ${allowCustom ? "grid-cols-2" : "grid-cols-1"}`}>
        <select
          value={presetValue}
          onChange={(event) => {
            if (event.target.value !== "custom") onChange(Number(event.target.value));
          }}
          aria-label={t("game.timePreset", { label })}
          className={controlClass}
        >
          {normalizedPresets.map((seconds) => (
            <option key={seconds} value={seconds}>
              {formatPreset?.(seconds) ?? (
                seconds === 0 ? t("game.none") : t("game.seconds", { seconds })
              )}
            </option>
          ))}
          {allowCustom && <option value="custom">{t("game.custom")}</option>}
        </select>
        {allowCustom && (
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input
              key={value}
              type="number"
              min={minimumSeconds}
              max={maximumSeconds}
              step={1}
              defaultValue={value}
              onBlur={(event) => onChange(Number(event.target.value))}
              onKeyDown={(event) => {
                if (event.key === "Enter") event.currentTarget.blur();
              }}
              aria-label={t("game.timeInput", { label })}
              className={controlClass}
            />
            {t("game.secondsUnit")}
          </label>
        )}
      </div>
      {allowCustom && (
        <p className="mt-1 text-xs text-slate-500">{t("game.timeHelp", { max: maximumSeconds })}</p>
      )}
    </fieldset>
  );
}

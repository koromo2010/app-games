"use client";

import { commonTimeLimitMaxSeconds, commonTimeLimitOptions } from "@/lib/game-room-config";
import { useAppLocale } from "./AppLocaleProvider";

type RoomTimeLimitControlProps = {
  label: string;
  value: number;
  onChange: (seconds: number) => void;
};

const controlClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20";

export function RoomTimeLimitControl({ label, value, onChange }: RoomTimeLimitControlProps) {
  const { t } = useAppLocale();
  const presetValue = commonTimeLimitOptions.includes(value as (typeof commonTimeLimitOptions)[number])
    ? String(value)
    : "custom";

  return (
    <fieldset>
      <legend className="text-sm font-medium text-slate-700">{label}</legend>
      <div className="mt-1 grid grid-cols-2 gap-2">
        <select
          value={presetValue}
          onChange={(event) => {
            if (event.target.value !== "custom") onChange(Number(event.target.value));
          }}
          aria-label={t("game.timePreset", { label })}
          className={controlClass}
        >
          {commonTimeLimitOptions.map((seconds) => (
            <option key={seconds} value={seconds}>
              {seconds === 0 ? t("game.none") : t("game.seconds", { seconds })}
            </option>
          ))}
          <option value="custom">{t("game.custom")}</option>
        </select>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input
            key={value}
            type="number"
            min={0}
            max={commonTimeLimitMaxSeconds}
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
      </div>
      <p className="mt-1 text-xs text-slate-500">{t("game.timeHelp", { max: commonTimeLimitMaxSeconds })}</p>
    </fieldset>
  );
}

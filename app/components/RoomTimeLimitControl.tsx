import { commonTimeLimitMaxSeconds, commonTimeLimitOptions } from "@/lib/game-room-config";

type RoomTimeLimitControlProps = {
  label: string;
  value: number;
  onChange: (seconds: number) => void;
};

const controlClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20";

export function RoomTimeLimitControl({ label, value, onChange }: RoomTimeLimitControlProps) {
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
          aria-label={`${label}のプリセット`}
          className={controlClass}
        >
          {commonTimeLimitOptions.map((seconds) => (
            <option key={seconds} value={seconds}>
              {seconds === 0 ? "なし" : `${seconds}秒`}
            </option>
          ))}
          <option value="custom">カスタム</option>
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
            aria-label={`${label}を秒数で入力`}
            className={controlClass}
          />
          秒
        </label>
      </div>
      <p className="mt-1 text-xs text-slate-500">0秒は時間制限なし、最大{commonTimeLimitMaxSeconds}秒です。</p>
    </fieldset>
  );
}

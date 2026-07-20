"use client";

import { useAppLocale } from "./AppLocaleProvider";

type RoomConfigItem = {
  label: string;
  value: string;
};

type RoomConfigSummaryProps = {
  items: RoomConfigItem[];
  title?: string;
};

export function RoomConfigSummary({ items, title }: RoomConfigSummaryProps) {
  const { t } = useAppLocale();
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <p className="text-sm font-bold text-slate-950">{title ?? t("game.currentRoomSettings")}</p>
      <dl className="mt-2 space-y-2">
        {items.map((item) => (
          <div key={item.label} className="flex items-start justify-between gap-3 text-xs">
            <dt className="text-slate-500">{item.label}</dt>
            <dd className="text-right font-semibold text-slate-800">{item.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

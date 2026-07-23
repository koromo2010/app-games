"use client";

import type { ReactNode } from "react";

type DebugToolsSectionProps = {
  title: string;
  description?: string;
  children: ReactNode;
};

export function DebugToolsSection({ title, description, children }: DebugToolsSectionProps) {
  return (
    <section className="rounded-lg border border-cyan-200 bg-cyan-50 p-2.5">
      <p className="text-xs font-bold text-cyan-950">{title}</p>
      {description && <p className="mt-1 text-[11px] leading-4 text-cyan-900/75">{description}</p>}
      <div className="mt-2 space-y-2">{children}</div>
    </section>
  );
}

type DebugToolButtonProps = {
  children: ReactNode;
  disabled?: boolean;
  tone?: "default" | "danger";
  onClick: () => void;
};

export function DebugToolButton({
  children,
  disabled = false,
  tone = "default",
  onClick,
}: DebugToolButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`w-full rounded-md border px-3 py-2 text-xs font-bold transition disabled:cursor-not-allowed disabled:opacity-40 ${
        tone === "danger"
          ? "border-rose-300 bg-white text-rose-700 hover:bg-rose-50"
          : "border-cyan-300 bg-white text-cyan-900 hover:bg-cyan-100"
      }`}
    >
      {children}
    </button>
  );
}

type DebugPlayerOption = {
  id: string;
  name: string;
};

type DebugPlayerSwitcherProps = {
  label?: string;
  players: readonly DebugPlayerOption[];
  value: string;
  disabled?: boolean;
  onChange: (playerId: string) => void;
};

export function DebugPlayerSwitcher({
  label = "操作プレイヤー",
  players,
  value,
  disabled = false,
  onChange,
}: DebugPlayerSwitcherProps) {
  return (
    <label className="block text-xs font-bold text-cyan-950">
      {label}
      <select
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1.5 w-full rounded-md border border-cyan-300 bg-white px-2.5 py-2 text-xs font-semibold text-slate-900 disabled:opacity-50"
      >
        {players.map((player) => (
          <option key={player.id} value={player.id}>{player.name}</option>
        ))}
      </select>
    </label>
  );
}

"use client";

import { AppLink as Link } from "@/app/components/AppLink";
import { useAppLocale } from "@/app/components/AppLocaleProvider";
import { appIntlLocale } from "@/lib/app-i18n";
import type { ActiveWordWolfRoom } from "./use-lobby-room-data";

export function LobbyResumePanel({ room, isLoading, onResume }: { room: ActiveWordWolfRoom | null; isLoading: boolean; onResume: () => void }) {
  const { locale, t } = useAppLocale();
  if (!room && !isLoading) return null;
  const phase = room?.phase === "lobby" ? t("resume.phase.lobby")
    : room?.phase === "clue" ? t("resume.phase.clue")
      : room?.phase === "vote" ? t("resume.phase.vote")
        : room?.phase === "wolfGuess" ? t("resume.phase.wolfGuess") : t("resume.phase.result");
  const date = room ? new Intl.DateTimeFormat(appIntlLocale(locale), { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(room.updatedAt)) : "";
  return <div className="rounded-lg border border-cyan-200 bg-cyan-50 p-4 shadow-[0_18px_50px_rgba(15,23,42,0.16)]">
    <p className="text-xs font-semibold uppercase text-cyan-700">Resume</p>
    <h2 className="mt-1 text-lg font-bold text-slate-950">{t("resume.title")}</h2>
    {isLoading && !room ? <p className="mt-3 text-sm text-slate-600">{t("resume.checking")}</p> : room ? <>
      <div className="mt-3 grid grid-cols-2 gap-2 text-sm"><div className="rounded-lg bg-white px-3 py-2"><p className="text-xs text-slate-500">ROOM</p><p className="font-bold text-slate-950">{room.code}</p></div><div className="rounded-lg bg-white px-3 py-2"><p className="text-xs text-slate-500">{t("resume.status")}</p><p className="font-bold text-slate-950">{phase}</p></div></div>
      <p className="mt-2 text-xs text-slate-600">{t("resume.participants", { count: room.players.length, date })}</p>
      <Link href="/wordwolf" onClick={onResume} className="mt-3 inline-flex w-full justify-center rounded-lg bg-cyan-600 px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-cyan-500">{t("resume.action")}</Link>
    </> : null}
  </div>;
}

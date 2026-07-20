"use client";

import Image from "next/image";
import type { DragEvent } from "react";
import { PaidLlmAccessButton } from "../components/PaidLlmAccessButton";
import { LobbyAccountMenu } from "./LobbyAccountMenu";
import { useAppLocale } from "@/app/components/AppLocaleProvider";

type Props = { siteName: string; name: string; avatarColor: string; avatarImage: string | null; isLoggedIn: boolean; isInfoOpen: boolean; isAvatarSaving: boolean; isAvatarDragging: boolean; onOpenInfo: () => void; onOpenMyPage: () => void; onColorChange: (color: string) => void; onImageChange: (image: string) => void; onFile: (file?: File) => void; onDrop: (event: DragEvent<HTMLElement>) => void; onDraggingChange: (dragging: boolean) => void };

export function LobbyHeader(props: Props) {
  const { t } = useAppLocale();
  return <section className="border-b border-white/10 bg-[radial-gradient(circle_at_20%_0%,rgba(34,211,238,0.22),transparent_34%),linear-gradient(135deg,#020617_0%,#111827_55%,#3f2b12_100%)] text-white"><div className="mx-auto max-w-6xl px-4 py-4 sm:py-5"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div className="flex min-w-0 items-center gap-3"><Image src="/site-icon" alt="" width={56} height={56} unoptimized className="h-14 w-14 shrink-0 rounded-2xl object-cover shadow-lg shadow-slate-950/30" /><div className="min-w-0"><div className="flex flex-wrap items-baseline gap-x-3 gap-y-1"><h1 className="text-3xl font-black tracking-normal sm:text-4xl">{props.siteName}</h1><p className="text-[11px] font-bold tracking-[0.14em] text-cyan-200">{t("site.subtitle")}</p></div><p className="mt-1 max-w-2xl text-sm leading-5 text-slate-200">{t("site.description")}</p></div></div><div className="flex flex-wrap items-center justify-end gap-2">
    {props.isLoggedIn && <button type="button" aria-expanded={props.isInfoOpen} aria-controls="lobby-account-panel" onClick={props.onOpenInfo} className="flex items-center gap-2 rounded-lg border border-white/15 bg-white/10 px-3 py-2 text-sm font-bold text-white transition hover:border-cyan-200/60 hover:bg-white/20 lg:hidden"><span aria-hidden="true">☰</span>{t("site.info")}</button>}
    <PaidLlmAccessButton />
    <LobbyAccountMenu name={props.name} color={props.avatarColor} image={props.avatarImage} isLoggedIn={props.isLoggedIn} isSaving={props.isAvatarSaving} isDragging={props.isAvatarDragging} onColorChange={props.onColorChange} onImageChange={props.onImageChange} onFile={props.onFile} onDrop={props.onDrop} onDraggingChange={props.onDraggingChange} onOpenMyPage={props.onOpenMyPage} onOpenInfo={props.onOpenInfo} />
  </div></div></div></section>;
}

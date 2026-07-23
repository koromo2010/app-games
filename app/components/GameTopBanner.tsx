import Image from "next/image";
import type { ReactNode } from "react";
import { AiActivityVital } from "@/app/components/AiActivityVital";

type GameTopBannerProps = {
  eyebrow: string;
  title: ReactNode;
  children: ReactNode;
};

export const gameTopBannerOffsetClass = "pt-[132px] sm:pt-[82px]";

export function GameTopBanner({ eyebrow, title, children }: GameTopBannerProps) {
  return (
    <header className="fixed inset-x-0 top-0 z-40 border-b border-white/10 bg-[radial-gradient(circle_at_20%_0%,rgba(34,211,238,0.22),transparent_34%),linear-gradient(135deg,#020617_0%,#111827_55%,#3f2b12_100%)] text-white shadow-2xl shadow-slate-950/30">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 shrink-0 items-center gap-3">
          <Image src="/site-icon" alt="" width={44} height={44} unoptimized className="h-11 w-11 shrink-0 rounded-xl object-cover shadow-lg shadow-slate-950/30" />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="truncate text-xs font-semibold uppercase text-cyan-200">{eyebrow}</p>
              <AiActivityVital />
            </div>
            <h1 className="mt-0.5 truncate text-2xl font-black tracking-normal sm:text-3xl">{title}</h1>
          </div>
        </div>
        <div className="flex min-h-10 max-w-full flex-nowrap items-center gap-2 overflow-x-auto pb-1 text-sm sm:justify-end sm:pb-0 [&>*]:shrink-0 [&>a]:flex [&>a]:h-10 [&>a]:items-center [&>button]:h-10">
          {children}
        </div>
      </div>
    </header>
  );
}

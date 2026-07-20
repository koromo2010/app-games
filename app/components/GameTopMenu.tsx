"use client";

import { createPortal } from "react-dom";
import { useRef, useState, type MouseEvent, type ReactNode } from "react";
import { UserReportButton } from "@/app/components/UserReportButton";
import { useAppLocale } from "@/app/components/AppLocaleProvider";

type Props = { children: ReactNode };

export const gameTopMenuItemClass = "flex w-full items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 transition hover:bg-slate-50";
export const gameTopMenuDangerItemClass = "flex w-full items-center justify-center rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-bold text-rose-700 transition hover:bg-rose-100";
export const gameTopBannerActionClass = "rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-sm font-bold text-white transition hover:bg-white/20";
export const gameTopBannerDangerActionClass = "rounded-lg border border-rose-300/50 bg-rose-500/15 px-3 py-1.5 text-sm font-bold text-rose-100 transition hover:bg-rose-500/25";

export function GameTopMenu({ children }: Props) {
  const { t } = useAppLocale();
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState({ top: 80, left: 12 });
  const buttonRef = useRef<HTMLButtonElement>(null);

  const openMenu = () => {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (rect) {
      const width = Math.min(288, window.innerWidth - 24);
      setPosition({ top: rect.bottom + 8, left: Math.max(12, Math.min(rect.right - width, window.innerWidth - width - 12)) });
    }
    setIsOpen(true);
  };

  const closeSelectedItem = (event: MouseEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest("[data-menu-close='true']")) setIsOpen(false);
  };

  return (
    <>
      <button ref={buttonRef} type="button" onClick={openMenu} className="rounded-lg border border-white/15 bg-white/10 px-3 py-1.5 font-bold text-white transition hover:bg-white/15" aria-haspopup="dialog" aria-expanded={isOpen}>
        MENU <span aria-hidden="true">▼</span>
      </button>
      {isOpen && createPortal(
        <div className="fixed inset-0 z-[9998]" onClick={() => setIsOpen(false)}>
          <div role="dialog" aria-label={t("game.menu")} className="fixed w-[min(18rem,calc(100vw-1.5rem))] rounded-lg border border-slate-200 bg-white p-3 text-slate-900 shadow-2xl" style={position} onClick={(event) => { event.stopPropagation(); closeSelectedItem(event); }}>
            <div className="flex items-center justify-between gap-2"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Game menu</p><button type="button" onClick={() => setIsOpen(false)} className="rounded border border-slate-200 px-2 py-1 text-xs font-bold text-slate-500">{t("site.close")}</button></div>
            <div className="mt-3 space-y-2 [&>a]:flex [&>a]:w-full [&>button]:flex [&>button]:min-h-10 [&>button]:w-full [&>button]:items-center [&>button]:justify-between">
              {children}
              <UserReportButton variant="menu" />
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

"use client";

import { createPortal } from "react-dom";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Props = {
  open: boolean;
  href: string;
  title: string;
  onClose: () => void;
  keepAlive?: boolean;
};

const overlayHistoryKey = "gameFieldsPageOverlay";

export function FullScreenPageOverlay({ open, href, title, onClose, keepAlive = false }: Props) {
  const [hasOpened, setHasOpened] = useState(open);
  const onCloseRef = useRef(onClose);
  const backButtonRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);
  useEffect(() => {
    if (!open || hasOpened) return;
    const timer = window.setTimeout(() => setHasOpened(true), 0);
    return () => window.clearTimeout(timer);
  }, [hasOpened, open]);
  const embeddedHref = useMemo(() => {
    const separator = href.includes("?") ? "&" : "?";
    return `${href}${separator}embedded=1`;
  }, [href]);

  const close = useCallback(() => {
    if (window.history.state?.[overlayHistoryKey]) window.history.back();
    else onCloseRef.current();
  }, []);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    if (!window.history.state?.[overlayHistoryKey]) {
      window.history.pushState({ ...window.history.state, [overlayHistoryKey]: true }, "");
    }
    const focusFrame = window.requestAnimationFrame(() => backButtonRef.current?.focus());

    const onPopState = () => onCloseRef.current();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    const onMessage = (event: MessageEvent) => {
      if (event.origin === window.location.origin && event.data?.type === "game-fields:close-overlay") close();
    };
    window.addEventListener("popstate", onPopState);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("message", onMessage);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.cancelAnimationFrame(focusFrame);
      window.removeEventListener("popstate", onPopState);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("message", onMessage);
    };
  }, [close, open]);

  if (!open && (!keepAlive || !hasOpened)) return null;
  return createPortal(
    <div className={open ? "fixed inset-0 z-[10000] bg-slate-950/80 p-2 text-white backdrop-blur-sm sm:p-4" : "hidden"} role="dialog" aria-modal={open ? true : undefined} aria-hidden={!open} aria-label={title}>
      <div className="mx-auto flex h-full w-full max-w-6xl flex-col overflow-hidden rounded-xl border border-white/20 bg-slate-950 shadow-2xl">
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-white/15 bg-slate-900 px-3 py-2 sm:px-4">
          <button ref={backButtonRef} type="button" onClick={close} className="rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm font-bold text-white transition hover:bg-white/20">← 戻る</button>
          <h2 className="truncate text-sm font-bold text-slate-100 sm:text-base">{title}</h2>
          <button type="button" onClick={close} className="grid h-9 w-9 place-items-center rounded-lg border border-white/20 bg-white/10 text-lg font-bold text-white transition hover:bg-white/20" aria-label={`${title}を閉じる`}>×</button>
        </header>
        <iframe title={title} src={embeddedHref} className="min-h-0 flex-1 bg-slate-950" />
      </div>
    </div>,
    document.body,
  );
}

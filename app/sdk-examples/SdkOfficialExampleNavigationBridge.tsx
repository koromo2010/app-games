"use client";

import type { MouseEvent, ReactNode } from "react";

const portalNavigationMessageType = "game-fields:sdk-official-example:navigate";

export function SdkOfficialExampleNavigationBridge({ children }: { children: ReactNode }) {
  const handleClickCapture = (event: MouseEvent<HTMLDivElement>) => {
    if (window.parent === window) return;
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

    const target = event.target;
    if (!(target instanceof Element)) return;
    const anchor = target.closest<HTMLAnchorElement>("a[href]");
    if (!anchor) return;

    const href = new URL(anchor.href, window.location.href);
    if (href.origin !== window.location.origin || !/^\/(?:[a-z]{2}\/)?games\/?$/.test(href.pathname)) return;

    event.preventDefault();
    window.parent.postMessage({
      type: portalNavigationMessageType,
      href: "/sdk-examples",
    }, "*");
  };

  return <div onClickCapture={handleClickCapture}>{children}</div>;
}


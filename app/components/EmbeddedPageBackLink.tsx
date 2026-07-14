"use client";

import Link from "next/link";
import type { MouseEvent, ReactNode } from "react";

type Props = { href: string; className?: string; children: ReactNode };

export function EmbeddedPageBackLink({ href, className, children }: Props) {
  const leave = (event: MouseEvent<HTMLAnchorElement>) => {
    if (new URLSearchParams(window.location.search).get("embedded") !== "1") return;
    event.preventDefault();
    window.parent.postMessage({ type: "game-fields:close-overlay" }, window.location.origin);
  };
  return <Link href={href} onClick={leave} className={className}>{children}</Link>;
}

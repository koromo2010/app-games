"use client";

import { usePathname } from "next/navigation";
import { globalLocaleSwitcherPlacement } from "@/lib/locale-switcher-route";
import { LocaleSwitcher } from "@/app/components/LocaleSwitcher";

export function GlobalLocaleSwitcher() {
  const placement = globalLocaleSwitcherPlacement(usePathname());

  if (placement === "hidden") return null;

  if (placement === "site-admin-flow") {
    return (
      <div
        className="relative z-10 flex shrink-0 justify-end border-b border-white/10 bg-slate-950 px-3 py-3 sm:px-4"
        data-global-locale-switcher
        data-locale-switcher-placement="site-admin-flow"
      >
        <LocaleSwitcher className="shrink-0" />
      </div>
    );
  }

  return (
    <div
      className="fixed right-3 top-3 z-[100]"
      data-global-locale-switcher
      data-locale-switcher-placement="public-fixed"
    >
      <LocaleSwitcher hideWhenAuthenticated />
    </div>
  );
}

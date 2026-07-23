"use client";

import { AppLink as Link } from "@/app/components/AppLink";
import { useAppLocale } from "./AppLocaleProvider";

export function SiteFooter({ siteName = "GAME FIELDS" }: { siteName?: string }) {
  const { t } = useAppLocale();
  return <footer className="border-t border-white/10 bg-slate-950 text-slate-300">
    <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-6 sm:flex-row sm:items-end sm:justify-between">
      <div><p className="font-black tracking-[0.16em] text-white">{siteName}</p><p className="mt-1 text-xs text-slate-500">{t("site.subtitle")}</p></div>
      <nav aria-label={t("footer.navigation")} className="flex flex-wrap gap-x-5 gap-y-2 text-xs font-semibold">
        <Link href="/terms" className="hover:text-cyan-300">{t("footer.terms")}</Link>
        <Link href="/privacy" className="hover:text-cyan-300">{t("footer.privacy")}</Link>
        <Link href="/contact" className="hover:text-cyan-300">{t("footer.contact")}</Link>
      </nav>
      <p className="text-[11px] text-slate-600">© {new Date().getFullYear()} {siteName}</p>
    </div>
  </footer>;
}

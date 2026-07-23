import { isAppLocale, type AppLocale } from "./app-locale.ts";

export type AppLocaleRouteAction =
  | { kind: "next"; locale: AppLocale }
  | { kind: "redirect"; locale: AppLocale; pathname: string }
  | { kind: "rewrite"; locale: AppLocale; pathname: string };

const unlocalizedPathPrefixes = ["/api", "/_next", "/site-icon", "/favicon.ico", "/robots.txt", "/sitemap.xml", "/manifest.webmanifest"];

export function localizedAppHref(href: string, locale: AppLocale) {
  if (!href.startsWith("/") || href.startsWith("//")) return href;
  const url = new URL(href, "https://game-fields.invalid");
  if (unlocalizedPathPrefixes.some((prefix) => url.pathname === prefix || url.pathname.startsWith(`${prefix}/`))) return href;
  if (/\/[^/]+\.[^/]+$/.test(url.pathname)) return href;
  const firstSegment = url.pathname.split("/")[1];
  if (isAppLocale(firstSegment)) return href;
  const pathname = url.pathname === "/" ? `/${locale}` : `/${locale}${url.pathname}`;
  return `${pathname}${url.search}${url.hash}`;
}

export function appLocaleRouteAction(
  pathname: string,
  rewrittenLocale: string | null,
  preferredLocale: AppLocale,
): AppLocaleRouteAction {
  const firstSegment = pathname.split("/")[1];
  const pathLocale = isAppLocale(firstSegment) ? firstSegment : null;

  if (!pathLocale && isAppLocale(rewrittenLocale)) {
    return { kind: "next", locale: rewrittenLocale };
  }
  if (!pathLocale) {
    return {
      kind: "redirect",
      locale: preferredLocale,
      pathname: `/${preferredLocale}${pathname === "/" ? "" : pathname}`,
    };
  }
  return {
    kind: "rewrite",
    locale: pathLocale,
    pathname: pathname.slice(pathLocale.length + 1) || "/",
  };
}

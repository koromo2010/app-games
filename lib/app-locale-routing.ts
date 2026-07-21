import { isAppLocale, type AppLocale } from "./app-locale.ts";

export type AppLocaleRouteAction =
  | { kind: "next"; locale: AppLocale }
  | { kind: "redirect"; locale: AppLocale; pathname: string }
  | { kind: "rewrite"; locale: AppLocale; pathname: string };

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

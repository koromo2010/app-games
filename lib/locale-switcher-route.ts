import { isAppLocale } from "./app-locale.ts";

export type GlobalLocaleSwitcherPlacement = "public-fixed" | "site-admin-flow" | "hidden";

export function unlocalizedAppPathname(pathname: string) {
  const segments = pathname.split("/");
  if (isAppLocale(segments[1])) segments.splice(1, 1);
  const normalized = segments.join("/") || "/";
  return normalized.length > 1 && normalized.endsWith("/")
    ? normalized.slice(0, -1)
    : normalized;
}

export function globalLocaleSwitcherPlacement(pathname: string): GlobalLocaleSwitcherPlacement {
  const unlocalizedPathname = unlocalizedAppPathname(pathname);
  if (unlocalizedPathname === "/admin") return "hidden";
  if (
    unlocalizedPathname === "/site-admin"
    || unlocalizedPathname.startsWith("/site-admin/")
  ) return "site-admin-flow";
  return "public-fixed";
}

import { NextRequest, NextResponse } from "next/server";
import { defaultAppLocale, isAppLocale, type AppLocale } from "@/lib/app-locale";

const APP_LOCALE_COOKIE = "game_fields_locale";

function preferredLocale(request: NextRequest): AppLocale {
  const cookieLocale = request.cookies.get(APP_LOCALE_COOKIE)?.value;
  if (isAppLocale(cookieLocale)) return cookieLocale;

  const acceptedLanguages = request.headers.get("accept-language")?.toLowerCase() ?? "";
  return acceptedLanguages.startsWith("en") || acceptedLanguages.includes(",en")
    ? "en"
    : defaultAppLocale;
}

function localeFromPathname(pathname: string): AppLocale | null {
  const firstSegment = pathname.split("/")[1];
  return isAppLocale(firstSegment) ? firstSegment : null;
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const pathLocale = localeFromPathname(pathname);

  if (!pathLocale) {
    const locale = preferredLocale(request);
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = `/${locale}${pathname === "/" ? "" : pathname}`;
    return NextResponse.redirect(redirectUrl);
  }

  const rewriteUrl = request.nextUrl.clone();
  const unprefixedPathname = pathname.slice(pathLocale.length + 1) || "/";
  rewriteUrl.pathname = unprefixedPathname;

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-app-locale", pathLocale);

  const response = NextResponse.rewrite(rewriteUrl, {
    request: { headers: requestHeaders },
  });
  response.cookies.set(APP_LOCALE_COOKIE, pathLocale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
  return response;
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|site-icon|robots.txt|sitemap.xml|manifest.webmanifest|.*\\.[^/]+$).*)",
  ],
};

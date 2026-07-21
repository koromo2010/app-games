import { NextRequest, NextResponse } from "next/server";
import { defaultAppLocale, isAppLocale, type AppLocale } from "@/lib/app-locale";
import { appLocaleRouteAction } from "@/lib/app-locale-routing";

const APP_LOCALE_COOKIE = "game_fields_locale";

function preferredLocale(request: NextRequest): AppLocale {
  const cookieLocale = request.cookies.get(APP_LOCALE_COOKIE)?.value;
  if (isAppLocale(cookieLocale)) return cookieLocale;

  const acceptedLanguages = request.headers.get("accept-language")?.toLowerCase() ?? "";
  return acceptedLanguages.startsWith("en") || acceptedLanguages.includes(",en")
    ? "en"
    : defaultAppLocale;
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const action = appLocaleRouteAction(
    pathname,
    request.headers.get("x-app-locale"),
    preferredLocale(request),
  );

  // A locale-prefixed request is rewritten to the existing unprefixed App
  // Router route. Next.js may run the proxy again for that internal URL, so
  // keep the forwarded locale instead of redirecting back to the same prefix.
  if (action.kind === "next") {
    return NextResponse.next();
  }

  if (action.kind === "redirect") {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = action.pathname;
    return NextResponse.redirect(redirectUrl);
  }

  const rewriteUrl = request.nextUrl.clone();
  rewriteUrl.pathname = action.pathname;

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-app-locale", action.locale);

  const response = NextResponse.rewrite(rewriteUrl, {
    request: { headers: requestHeaders },
  });
  response.cookies.set(APP_LOCALE_COOKIE, action.locale, {
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

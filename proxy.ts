import { NextRequest, NextResponse } from "next/server";
import { defaultAppLocale, isAppLocale, type AppLocale } from "@/lib/app-locale";
import { appLocaleRouteAction } from "@/lib/app-locale-routing";
import { legacyGamePlayRoute } from "@/lib/game-routes";

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
  const legacyGameRoute = legacyGamePlayRoute(pathname);
  if (legacyGameRoute) {
    const redirectUrl = new URL(request.url);
    const locale = legacyGameRoute.locale ?? preferredLocale(request);
    redirectUrl.pathname = `/${locale}${legacyGameRoute.playPath}`;
    return NextResponse.redirect(redirectUrl, 308);
  }

  // Next.js' automatic trailing-slash redirect is disabled so legacy aliases
  // can be resolved first. Keep the normal no-slash canonical URL for all
  // application routes that reach this matcher, while leaving APIs, assets,
  // and metadata routes outside this redirect boundary.
  if (pathname.length > 1 && pathname.endsWith("/")) {
    const redirectUrl = new URL(request.url);
    redirectUrl.pathname = pathname.slice(0, -1);
    return NextResponse.redirect(redirectUrl, 308);
  }

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
    "/((?!api|_next(?:/|$)|favicon.ico|site-icon|robots.txt|sitemap.xml|manifest.webmanifest|.*\\.[^/]+$).*)",
  ],
};

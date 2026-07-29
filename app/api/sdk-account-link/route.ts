import { randomBytes } from "node:crypto";
import { getAuthenticatedPlayer, isPlayerAuthConfigurationError } from "@/lib/player-auth";
import { createSdkAccountLinkCode } from "@/lib/sdk-account-link";

const defaultAllowedOrigins = [
  "https://sdk.game-fields.com",
  "https://sdk-dev.game-fields.com",
  "https://app-games-sdk-portal.vercel.app",
  "https://app-games-sdk-portal-game-fields.vercel.app",
];

function allowedCallbackOrigins() {
  const configured = process.env.SDK_ACCOUNT_LINK_ALLOWED_ORIGINS
    ?.split(/[\s,]+/)
    .map((value) => value.trim().replace(/\/$/, ""))
    .filter((value) => /^https:\/\/[a-z0-9.-]+(?::\d+)?$/i.test(value))
    ?? [];
  return new Set([...defaultAllowedOrigins, ...configured]);
}

export async function GET(request: Request) {
  try {
    const player = await getAuthenticatedPlayer();
    if (!player?.id) {
      const loginUrl = new URL("/games", request.url);
      loginUrl.searchParams.set("sdkLoginRequired", "1");
      loginUrl.searchParams.set("sdkReturn", request.url);
      return Response.redirect(loginUrl, 303);
    }
    const url = new URL(request.url);
    const callback = url.searchParams.get("callback") ?? "";
    const state = url.searchParams.get("state") ?? "";
    let callbackUrl: URL;
    try { callbackUrl = new URL(callback); } catch { return Response.json({ error: "INVALID_CALLBACK" }, { status: 400 }); }
    if (!allowedCallbackOrigins().has(callbackUrl.origin) || callbackUrl.pathname !== "/api/account-link/callback") {
      return Response.json({ error: "INVALID_CALLBACK" }, { status: 400 });
    }
    const code = createSdkAccountLinkCode({
      playerId: player.id,
      playerName: player.name,
      audience: callbackUrl.origin,
      expiresAt: Date.now() + 60_000,
    });
    callbackUrl.searchParams.set("code", code);
    callbackUrl.searchParams.set("state", state || randomBytes(16).toString("base64url"));
    return Response.redirect(callbackUrl, 303);
  } catch (error) {
    if (isPlayerAuthConfigurationError(error) || (error instanceof Error && error.message === "SDK_ACCOUNT_LINK_SECRET_NOT_CONFIGURED")) {
      return Response.json({ error: "ACCOUNT_LINK_NOT_CONFIGURED" }, { status: 503 });
    }
    return Response.json({ error: "ACCOUNT_LINK_FAILED" }, { status: 500 });
  }
}

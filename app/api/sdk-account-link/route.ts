import { randomBytes } from "node:crypto";
import { getAuthenticatedPlayerId, isPlayerAuthConfigurationError } from "@/lib/player-auth";
import { createSdkAccountLinkCode } from "@/lib/sdk-account-link";

const allowedOrigins = new Set([
  "https://sdk.game-fields.com",
  "https://sdk-dev.game-fields.com",
]);

export async function GET(request: Request) {
  try {
    const playerId = await getAuthenticatedPlayerId();
    if (!playerId) {
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
    if (!allowedOrigins.has(callbackUrl.origin) || callbackUrl.pathname !== "/api/account-link/callback") {
      return Response.json({ error: "INVALID_CALLBACK" }, { status: 400 });
    }
    const code = createSdkAccountLinkCode({
      playerId,
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

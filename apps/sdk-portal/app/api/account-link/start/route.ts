import { randomBytes } from "node:crypto";
import { setAccountLinkState } from "@/lib/account-session";
import { normalizeAccountLinkReturnPath } from "@/lib/account-link-return";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const returnTo = normalizeAccountLinkReturnPath(
    url.searchParams.get("returnTo"),
  );
  try {
    const appBase = process.env.GAME_FIELDS_APP_BASE_URL?.replace(/\/$/, "")
      ?? (process.env.VERCEL_GIT_COMMIT_REF === "main" ? "https://www.game-fields.com" : "https://dev.game-fields.com");
    const callback = `${url.origin}/api/account-link/callback`;
    const target = new URL("/api/sdk-account-link", appBase);
    target.searchParams.set("callback", callback);
    const state = randomBytes(16).toString("base64url");
    await setAccountLinkState(state, returnTo);
    target.searchParams.set("state", state);
    return Response.redirect(target, 303);
  } catch {
    const errorUrl = new URL("/account-link-error", url.origin);
    errorUrl.searchParams.set("returnTo", returnTo);
    return Response.redirect(errorUrl, 303);
  }
}

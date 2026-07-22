import { consumeAccountLinkState, setSdkAccountSession, verifyAccountLinkCode } from "@/lib/account-session";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    if (!await consumeAccountLinkState(url.searchParams.get("state") ?? "")) {
      return Response.json({ error: "ACCOUNT_LINK_STATE_INVALID" }, { status: 401 });
    }
    const playerId = verifyAccountLinkCode(url.searchParams.get("code") ?? "", url.origin);
    if (!playerId) return Response.json({ error: "ACCOUNT_LINK_CODE_INVALID" }, { status: 401 });
    await setSdkAccountSession(playerId);
    return Response.redirect(new URL("/?linked=1", url.origin), 303);
  } catch (error) {
    if (error instanceof Error && error.message === "SDK_ACCOUNT_LINK_SECRET_NOT_CONFIGURED") {
      return Response.json({ error: "ACCOUNT_LINK_NOT_CONFIGURED" }, { status: 503 });
    }
    return Response.json({ error: "ACCOUNT_LINK_FAILED" }, { status: 500 });
  }
}

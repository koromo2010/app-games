import {
  parseSdkPreviewAccountLinkCode,
} from "@/lib/sdk-account-link";
import {
  requireSdkPreviewAuthenticatedPlayer,
  setSdkPreviewAccountSession,
} from "@/lib/sdk-preview-account-session";
import {
  sdkPreviewCreatorSlugPattern,
} from "@/lib/sdk-preview-runtime-source";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(payload: unknown, status = 200) {
  return Response.json(payload, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

function objectBody(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export async function POST(request: Request) {
  try {
    const body = objectBody(await request.json().catch(() => null));
    const creatorSlug = typeof body?.creatorSlug === "string"
      ? body.creatorSlug.trim().toLowerCase()
      : "";
    if (!sdkPreviewCreatorSlugPattern.test(creatorSlug)) {
      return json({ error: "SDK_PREVIEW_SESSION_INPUT_REQUIRED" }, 400);
    }

    const linkCode = typeof body?.linkCode === "string"
      ? body.linkCode.trim()
      : "";
    if (linkCode) {
      const payload = parseSdkPreviewAccountLinkCode(linkCode, {
        audience: new URL(request.url).origin,
        creatorSlug,
      });
      if (!payload) {
        return json({ error: "SDK_PREVIEW_SESSION_LINK_INVALID" }, 401);
      }
      await setSdkPreviewAccountSession({
        playerId: payload.playerId,
        creatorSlug,
      });
      return json({
        authenticated: true,
        source: "sdk-account-link",
      });
    }

    const session = await requireSdkPreviewAuthenticatedPlayer(creatorSlug);
    return json({
      authenticated: true,
      source: session.source,
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (code === "PLAYER_AUTH_REQUIRED") {
      return json({ error: code }, 401);
    }
    if (
      code === "SDK_ACCOUNT_LINK_SECRET_NOT_CONFIGURED"
      || code === "PLAYER_SESSION_SECRET_NOT_CONFIGURED"
    ) {
      return json({ error: "SDK_PREVIEW_SESSION_UNAVAILABLE" }, 503);
    }
    return json({ error: "SDK_PREVIEW_SESSION_FAILED" }, 500);
  }
}

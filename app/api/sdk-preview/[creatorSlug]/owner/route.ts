import { getAuthenticatedPlayerId } from "@/lib/player-auth";
import { checkSdkCreatorOwnership } from "@/lib/sdk-dashboard-ownership";
import { sdkPreviewCreatorSlugPattern } from "@/lib/sdk-preview-runtime-source";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(payload: unknown, status = 200) {
  return Response.json(payload, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

export async function GET(
  _: Request,
  context: { params: Promise<{ creatorSlug: string }> },
) {
  try {
    const { creatorSlug: rawCreatorSlug } = await context.params;
    const creatorSlug = rawCreatorSlug.trim().toLowerCase();
    if (!sdkPreviewCreatorSlugPattern.test(creatorSlug)) {
      return json({ owner: false }, 400);
    }
    const playerId = await getAuthenticatedPlayerId();
    if (!playerId) return json({ owner: false }, 401);
    const owner = await checkSdkCreatorOwnership({ creatorSlug, playerId });
    return json({ owner });
  } catch (error) {
    if (
      error instanceof Error
      && (
        error.message === "SDK_ACCOUNT_LINK_SECRET_NOT_CONFIGURED"
        || error.message === "PLAYER_SESSION_SECRET_NOT_CONFIGURED"
      )
    ) {
      return json({ owner: false }, 503);
    }
    return json({ owner: false }, 502);
  }
}

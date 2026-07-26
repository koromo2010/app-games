import {
  requireRecentSiteAdminMfa,
  requireSiteAdminSession,
  siteAdminAuthorizationError,
} from "@/lib/site-admin-auth";
import { appendSiteAdminAuditLog } from "@/lib/site-admin-passkey-store";
import { sdkPromotionInternalBaseUrl } from "@/lib/sdk-preview-runtime-source";
import { sdkServiceHeaders } from "@/lib/sdk-service-auth";
import { expectedAppEnvironment } from "@/lib/storage-environment-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function internalUrl() {
  return `${sdkPromotionInternalBaseUrl()}/api/internal/promotions`;
}

function promotionTarget() {
  return expectedAppEnvironment() === "production" ? "main" : "development";
}

function requirePromotionReadEnvironment() {
  const environment = expectedAppEnvironment();
  const branch = process.env.VERCEL_GIT_COMMIT_REF;
  if (
    !(
      (environment === "production" && branch === "main")
      || (environment === "development" && branch === "develop")
    )
  ) {
    throw new Error("SDK_PROMOTION_MAIN_ONLY");
  }
}

function requirePromotionAdminEnvironment() {
  const environment = expectedAppEnvironment();
  const branch = process.env.VERCEL_GIT_COMMIT_REF;
  if (!(
    (environment === "production" && branch === "main")
    || (environment === "development" && branch === "develop")
  )) {
    throw new Error("SDK_PROMOTION_MAIN_ONLY");
  }
}

function routeError(error: unknown, fallback: string) {
  if (
    error instanceof Error
    && error.message === "SDK_PROMOTION_MAIN_ONLY"
  ) {
    return Response.json({ error: error.message }, { status: 403 });
  }
  return siteAdminAuthorizationError(error)
    ?? Response.json({ error: fallback }, { status: 503 });
}

async function proxyPayload(response: Response): Promise<unknown> {
  return response.json().catch(() => ({
    error: "SDK_PROMOTION_INVALID_RESPONSE",
  })) as Promise<unknown>;
}

export async function GET() {
  try {
    await requireSiteAdminSession();
    requirePromotionReadEnvironment();
    const url = internalUrl();
    const response = await fetch(url, {
      headers: sdkServiceHeaders("GET", url),
      cache: "no-store",
    });
    const payload = await proxyPayload(response);
    const portalBaseUrl = sdkPromotionInternalBaseUrl();
    const enriched = response.ok
      && payload
      && typeof payload === "object"
      && "games" in payload
      && Array.isArray(payload.games)
      ? {
          ...payload,
          games: payload.games.map((game: unknown) => {
            if (!game || typeof game !== "object") return game;
            const creatorSlug = "creatorSlug" in game
              && typeof game.creatorSlug === "string"
              ? game.creatorSlug
              : "";
            const gameId = "gameId" in game && typeof game.gameId === "string"
              ? game.gameId
              : "";
            return {
              ...game,
              reviewUrl: creatorSlug && gameId
                ? `${portalBaseUrl}/${creatorSlug}/games/${gameId}`
                : null,
            };
          }),
        }
      : payload;
    return Response.json(enriched, {
      status: response.status,
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return routeError(error, "SDK_PROMOTIONS_LOAD_FAILED");
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireRecentSiteAdminMfa();
    requirePromotionAdminEnvironment();
    const body = await request.json().catch(() => null);
    if (
      !body
      || typeof body !== "object"
      || !("target" in body)
      || body.target !== promotionTarget()
    ) {
      return Response.json(
        { error: "SDK_PROMOTION_TARGET_MISMATCH" },
        { status: 400 },
      );
    }
    const url = internalUrl();
    const response = await fetch(url, {
      method: "POST",
      headers: {
        ...sdkServiceHeaders("POST", url),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    const payload = await proxyPayload(response);
    if (response.ok) {
      await appendSiteAdminAuditLog(
        request,
        session,
        "sdk-game.promote",
        payload && typeof payload === "object" && "publicGameId" in payload
          ? String(payload.publicGameId)
          : "sdk-game",
        null,
        payload,
      );
    }
    return Response.json(payload, {
      status: response.status,
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return routeError(error, "SDK_PROMOTION_FAILED");
  }
}

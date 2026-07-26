import {
  requireRecentSiteAdminMfa,
  requireSiteAdminSession,
  siteAdminAuthorizationError,
} from "@/lib/site-admin-auth";
import { appendSiteAdminAuditLog } from "@/lib/site-admin-passkey-store";
import {
  sdkDevelopmentInternalBaseUrl,
  sdkPromotionInternalBaseUrl,
} from "@/lib/sdk-preview-runtime-source";
import { sdkServiceHeaders } from "@/lib/sdk-service-auth";
import { expectedAppEnvironment } from "@/lib/storage-environment-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function requireMain() {
  if (
    expectedAppEnvironment() !== "production"
    || process.env.VERCEL_GIT_COMMIT_REF !== "main"
  ) throw new Error("APP_RELEASE_MAIN_ONLY");
}

function releaseEndpoint(base: string, lineageId?: string) {
  return `${base}/api/internal/app-releases${
    lineageId ? `?lineageId=${encodeURIComponent(lineageId)}` : ""
  }`;
}

function developmentCatalogEndpoint() {
  return `${sdkDevelopmentInternalBaseUrl()}/api/runtime-catalog?channel=development`;
}

async function call(url: string, init?: RequestInit) {
  const method = init?.method ?? "GET";
  const response = await fetch(url, {
    ...init,
    headers: {
      ...sdkServiceHeaders(method, url),
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });
  const payload = await response.json().catch(() => ({ error: "APP_RELEASE_INVALID_RESPONSE" }));
  return { response, payload };
}

function errorCode(result: Awaited<ReturnType<typeof call>>) {
  const payload = result.payload as { error?: unknown } | null;
  return typeof payload?.error === "string"
    ? payload.error
    : `HTTP_${result.response.status}`;
}

function developmentReleases(payload: unknown) {
  if (!payload || typeof payload !== "object") return [];
  const games = (payload as { games?: unknown }).games;
  if (!Array.isArray(games)) return [];
  return games.map((game) => {
    const item = game as Record<string, unknown>;
    return {
      id: `development:${String(item.lineageId ?? item.id ?? "unknown")}`,
      lineageId: item.lineageId,
      publicGameId: item.id,
      sourceCreatorSlug: item.sourceCreatorSlug,
      sourceGameId: item.sourceGameId,
      title: item.title,
      description: item.description,
      revision: item.revision,
      packageRootSha256: item.packageRootSha256,
      serverBundleSha256: item.serverBundleSha256,
      appSetSourceSha256: item.appSetSourceSha256,
      manifest: item.manifest,
      modulePolicy: item.modulePolicy,
      releaseKind: "promotion",
      releasedAt: item.releasedAt,
    };
  });
}

function routeError(error: unknown) {
  if (error instanceof Error && error.message === "APP_RELEASE_MAIN_ONLY") {
    return Response.json({ error: error.message }, { status: 403 });
  }
  return siteAdminAuthorizationError(error)
    ?? Response.json({ error: "APP_RELEASE_FAILED" }, { status: 503 });
}

export async function GET(request: Request) {
  try {
    await requireSiteAdminSession();
    requireMain();
    const lineageId = new URL(request.url).searchParams.get("lineageId") ?? undefined;
    const [development, main] = await Promise.all([
      call(developmentCatalogEndpoint()),
      call(releaseEndpoint(sdkPromotionInternalBaseUrl(), lineageId)),
    ]);
    const developmentOk = development.response.ok;
    const mainOk = main.response.ok;
    const body = {
      development: developmentOk
        ? { releases: developmentReleases(development.payload) }
        : { releases: [], error: errorCode(development) },
      main: mainOk
        ? main.payload
        : { releases: [], history: [], error: errorCode(main) },
    };
    return Response.json(body, {
      status: developmentOk || mainOk ? 200 : 503,
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return routeError(error);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireRecentSiteAdminMfa();
    requireMain();
    const body = await request.json().catch(() => null) as {
      action?: unknown; snapshot?: unknown; lineageId?: unknown; releaseId?: unknown;
    } | null;
    if (body?.action !== "promote" && body?.action !== "rollback") {
      return Response.json({ error: "APP_RELEASE_INPUT_INVALID" }, { status: 400 });
    }
    const url = releaseEndpoint(sdkPromotionInternalBaseUrl());
    const result = await call(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (result.response.ok) {
      await appendSiteAdminAuditLog(
        request,
        session,
        body.action === "promote" ? "sdk-app.promote-dev-to-main" : "sdk-app.rollback",
        typeof body.lineageId === "string" ? body.lineageId : "sdk-app",
        null,
        { releaseId: typeof body.releaseId === "string" ? body.releaseId : null },
      );
    }
    return Response.json(result.payload, { status: result.response.status });
  } catch (error) {
    return routeError(error);
  }
}

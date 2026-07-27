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

type UpstreamSource = "development-runtime-catalog" | "main-release-store";

type UpstreamDiagnostic = {
  source: UpstreamSource;
  endpoint: string;
  status: number | null;
  code: string;
  cause?: string;
};

type UpstreamResult = {
  response: Response | null;
  payload: unknown;
  diagnostic: UpstreamDiagnostic;
};

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

function displayEndpoint(url: string) {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}${parsed.search}`;
  } catch {
    return "INVALID_UPSTREAM_URL";
  }
}

function payloadError(payload: unknown, status: number) {
  if (payload && typeof payload === "object" && "error" in payload) {
    const error = (payload as { error?: unknown }).error;
    if (typeof error === "string" && error) return error;
  }
  return `HTTP_${status}`;
}

async function call(source: UpstreamSource, url: string, init?: RequestInit): Promise<UpstreamResult> {
  const method = init?.method ?? "GET";
  try {
    const response = await fetch(url, {
      ...init,
      headers: {
        ...sdkServiceHeaders(method, url),
        ...(init?.headers ?? {}),
      },
      cache: "no-store",
    });
    const payload = await response.json().catch(() => ({ error: "APP_RELEASE_INVALID_RESPONSE" }));
    return {
      response,
      payload,
      diagnostic: {
        source,
        endpoint: displayEndpoint(url),
        status: response.status,
        code: payloadError(payload, response.status),
      },
    };
  } catch (error) {
    const cause = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    console.error("[app-releases] upstream request failed", {
      source,
      endpoint: displayEndpoint(url),
      method,
      cause,
    });
    return {
      response: null,
      payload: { error: "APP_RELEASE_UPSTREAM_FETCH_FAILED" },
      diagnostic: {
        source,
        endpoint: displayEndpoint(url),
        status: null,
        code: "APP_RELEASE_UPSTREAM_FETCH_FAILED",
        cause,
      },
    };
  }
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
      sourceRevision: item.sourceRevision ?? item.revision,
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
  const auth = siteAdminAuthorizationError(error);
  if (auth) return auth;
  const cause = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  console.error("[app-releases] route failed", { cause });
  return Response.json({
    error: "APP_RELEASE_FAILED",
    diagnostic: {
      source: "main-release-store",
      endpoint: "/api/admin/app-releases",
      status: null,
      code: "APP_RELEASE_FAILED",
      cause,
    },
  }, { status: 503 });
}

export async function GET(request: Request) {
  try {
    await requireSiteAdminSession();
    requireMain();
    const lineageId = new URL(request.url).searchParams.get("lineageId") ?? undefined;
    const [development, main] = await Promise.all([
      call("development-runtime-catalog", developmentCatalogEndpoint()),
      call("main-release-store", releaseEndpoint(sdkPromotionInternalBaseUrl(), lineageId)),
    ]);
    const developmentOk = development.response?.ok === true;
    const mainOk = main.response?.ok === true;
    return Response.json({
      development: developmentOk
        ? { releases: developmentReleases(development.payload) }
        : { releases: [], error: development.diagnostic },
      main: mainOk
        ? main.payload
        : { releases: [], history: [], error: main.diagnostic },
    }, {
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
    const result = await call("main-release-store", url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!result.response) {
      return Response.json({ error: result.diagnostic.code, diagnostic: result.diagnostic }, { status: 503 });
    }
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
    return Response.json(
      result.response.ok ? result.payload : { error: result.diagnostic.code, diagnostic: result.diagnostic },
      { status: result.response.status },
    );
  } catch (error) {
    return routeError(error);
  }
}

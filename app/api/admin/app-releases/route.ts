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

function endpoint(base: string, lineageId?: string) {
  return `${base}/api/internal/app-releases${
    lineageId ? `?lineageId=${encodeURIComponent(lineageId)}` : ""
  }`;
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
      call(endpoint(sdkDevelopmentInternalBaseUrl())),
      call(endpoint(sdkPromotionInternalBaseUrl(), lineageId)),
    ]);
    if (!development.response.ok || !main.response.ok) {
      const failed = !development.response.ok ? development : main;
      return Response.json(failed.payload, { status: failed.response.status });
    }
    return Response.json({
      development: development.payload,
      main: main.payload,
    }, { headers: { "Cache-Control": "private, no-store" } });
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
    const url = endpoint(sdkPromotionInternalBaseUrl());
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

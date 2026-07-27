import { requireSdkServiceRequest } from "@/lib/sdk-service-auth";
import {
  AppReleaseError,
  listAppReleaseHistory,
  listAppReleaseDecisions,
  listCurrentAppReleases,
  promoteAppRelease,
  rejectAppRelease,
  rollbackAppRelease,
} from "@/lib/app-release-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function authorize(request: Request) {
  try {
    requireSdkServiceRequest(request);
    return null;
  } catch {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }
}

function errorResponse(error: unknown) {
  if (error instanceof AppReleaseError) {
    return Response.json({
      error: error.detail ? `${error.code}:${error.detail}` : error.code,
      code: error.code,
      detail: error.detail,
    }, { status: error.status });
  }
  const detail = error instanceof Error
    ? `${error.name}: ${error.message}`
    : String(error);
  console.error("[internal-app-releases] unhandled failure", { detail });
  return Response.json({
    error: `APP_RELEASE_FAILED:${detail}`,
    code: "APP_RELEASE_FAILED",
    detail,
  }, { status: 503 });
}

export async function GET(request: Request) {
  const denied = authorize(request);
  if (denied) return denied;
  try {
    const lineageId = new URL(request.url).searchParams.get("lineageId") ?? undefined;
    return Response.json({
      releases: await listCurrentAppReleases(),
      history: await listAppReleaseHistory(lineageId),
      decisions: await listAppReleaseDecisions(),
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  const denied = authorize(request);
  if (denied) return denied;
  if (process.env.VERCEL_GIT_COMMIT_REF !== "main") {
    return Response.json({ error: "APP_RELEASE_MAIN_ONLY" }, { status: 403 });
  }
  const body = await request.json().catch(() => null) as {
    action?: unknown;
    snapshot?: unknown;
    lineageId?: unknown;
    releaseId?: unknown;
    reason?: unknown;
    actorRef?: unknown;
  } | null;
  try {
    const decision = { reason: body?.reason, actorRef: body?.actorRef };
    const release = body?.action === "promote"
      ? await promoteAppRelease(body.snapshot, decision)
      : body?.action === "reject"
        ? await rejectAppRelease(body.snapshot, decision)
      : body?.action === "rollback"
        ? await rollbackAppRelease(
            typeof body.lineageId === "string" ? body.lineageId : "",
            typeof body.releaseId === "string" ? body.releaseId : "",
            decision,
          )
        : (() => { throw new AppReleaseError("APP_RELEASE_INPUT_INVALID", 400); })();
    return Response.json({
      released: body?.action !== "reject",
      rejected: body?.action === "reject",
      release,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

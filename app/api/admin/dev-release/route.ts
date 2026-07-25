import {
  requireRecentSiteAdminMfa,
  requireSiteAdminSession,
  siteAdminAuthorizationError,
} from "@/lib/site-admin-auth";
import { appendSiteAdminAuditLog } from "@/lib/site-admin-passkey-store";
import { expectedAppEnvironment } from "@/lib/storage-environment-guard";
import {
  GitHubReleaseError,
  loadDevMainReleaseStatus,
  promoteDevelopToMain,
} from "@/lib/github-release";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function releaseError(error: unknown) {
  if (error instanceof GitHubReleaseError) {
    return Response.json({ error: error.code }, { status: error.status });
  }
  return Response.json({ error: "GITHUB_RELEASE_FAILED" }, { status: 503 });
}

function requireMainEnvironment() {
  if (
    expectedAppEnvironment() !== "production"
    || process.env.VERCEL_GIT_COMMIT_REF !== "main"
  ) {
    throw new GitHubReleaseError("GITHUB_RELEASE_MAIN_ONLY", 403);
  }
}

export async function GET() {
  try {
    await requireSiteAdminSession();
    requireMainEnvironment();
    return Response.json(await loadDevMainReleaseStatus(), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return siteAdminAuthorizationError(error) ?? releaseError(error);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireRecentSiteAdminMfa();
    requireMainEnvironment();
    const body = await request.json().catch(() => null) as {
      confirmation?: unknown;
      expectedMainSha?: unknown;
      expectedDevelopSha?: unknown;
    } | null;
    if (
      body?.confirmation !== "dev→main"
      || typeof body.expectedMainSha !== "string"
      || typeof body.expectedDevelopSha !== "string"
    ) {
      throw new GitHubReleaseError("GITHUB_RELEASE_INPUT_INVALID", 400);
    }
    const result = await promoteDevelopToMain({
      expectedMainSha: body.expectedMainSha,
      expectedDevelopSha: body.expectedDevelopSha,
    });
    await appendSiteAdminAuditLog(
      request,
      session,
      "code.promote-develop-to-main",
      result.repository,
      { mainSha: result.previousMainSha },
      { mainSha: result.mainSha },
    );
    return Response.json(result, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return siteAdminAuthorizationError(error) ?? releaseError(error);
  }
}

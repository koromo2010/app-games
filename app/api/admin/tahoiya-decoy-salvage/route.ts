import { appendSiteAdminAuditLog } from "@/lib/site-admin-passkey-store";
import {
  requireRecentSiteAdminMfa,
  requireSiteAdminSession,
  siteAdminAuthorizationError,
} from "@/lib/site-admin-auth";
import {
  inspectTahoiyaDecoyCandidateStats,
} from "@/lib/tahoiya-decoy-candidate-store";
import { salvageTahoiyaDecoyCandidateBatch } from "@/lib/tahoiya-decoy-salvage";
import { createRequestTelemetry } from "@/lib/observability";
import { rateLimitPolicies, rateLimitResponseFor } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const publicErrors = new Set([
  "POSTGRES_STORE_NOT_CONFIGURED",
  "TAHOIYA_DECOY_SALVAGE_CURSOR_INVALID",
  "APP_ENV_MISSING_OR_INVALID",
  "APP_ENV_VERCEL_ENV_MISMATCH",
]);

function safeError(error: unknown, fallback: string) {
  return error instanceof Error && publicErrors.has(error.message) ? error.message : fallback;
}

export async function GET() {
  try {
    await requireSiteAdminSession();
    return Response.json({ stats: await inspectTahoiyaDecoyCandidateStats() });
  } catch (error) {
    return siteAdminAuthorizationError(error)
      ?? Response.json({ error: safeError(error, "TAHOIYA_DECOY_STATUS_FAILED") }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const telemetry = createRequestTelemetry(request, "/api/admin/tahoiya-decoy-salvage", {
    game: "tahoiya",
    operation: "decoy-salvage",
  });
  const limited = await rateLimitResponseFor(request, rateLimitPolicies.profileMutation);
  if (limited) return limited;
  try {
    const session = await requireRecentSiteAdminMfa();
    const body = await request.json().catch(() => null) as { cursor?: unknown } | null;
    if (!body || typeof body.cursor !== "string") {
      return Response.json({ error: "TAHOIYA_DECOY_SALVAGE_CURSOR_INVALID" }, { status: 400 });
    }
    const result = await salvageTahoiyaDecoyCandidateBatch(body.cursor);
    const stats = result.done ? await inspectTahoiyaDecoyCandidateStats() : null;
    if (result.done) {
      await appendSiteAdminAuditLog(request, session, "tahoiya.decoy-salvage", "tahoiya_decoy_candidates", null, {
        candidateCount: stats?.candidateCount ?? 0,
        wordCount: stats?.wordCount ?? 0,
        eventCount: stats?.eventCount ?? 0,
      });
      telemetry.success("tahoiya.decoy-salvage", {
        affectedCount: stats?.candidateCount ?? result.importedEvents,
        sourceCount: result.scannedKeys,
      });
    }
    return Response.json({ result, stats });
  } catch (error) {
    const response = siteAdminAuthorizationError(error);
    if (response) return response;
    telemetry.failure("tahoiya.decoy-salvage", error, 500, { action: "batch" });
    return Response.json({ error: safeError(error, "TAHOIYA_DECOY_SALVAGE_FAILED") }, { status: 500 });
  }
}

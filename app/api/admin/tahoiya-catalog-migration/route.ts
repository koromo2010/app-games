import { createRequestTelemetry } from "@/lib/observability";
import { rateLimitPolicies, rateLimitResponseFor } from "@/lib/rate-limit";
import {
  requireFullSiteAdminSession,
  requireRecentSiteAdminMfa,
  siteAdminAuthorizationError,
} from "@/lib/site-admin-auth";
import { appendSiteAdminAuditLog } from "@/lib/site-admin-passkey-store";
import {
  importTahoiyaCatalogBatch,
  inspectTahoiyaCatalogMigration,
} from "@/lib/tahoiya-catalog-migration";
import { ensureTahoiyaGitCandidates } from "@/lib/tahoiya-topic-catalog";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const publicErrors = new Set([
  "APP_ENV_MISSING_OR_INVALID",
  "APP_ENV_VERCEL_ENV_MISMATCH",
  "TAHOIYA_CATALOG_CURSOR_INVALID",
  "TAHOIYA_CATALOG_MIGRATION_PREVIEW_ONLY",
  "TAHOIYA_CATALOG_SCHEMA_MISSING",
  "VOCABULARY_ADMIN_STORE_NOT_CONFIGURED",
]);

function safeError(error: unknown, fallback: string) {
  return error instanceof Error && publicErrors.has(error.message) ? error.message : fallback;
}

export async function GET() {
  try {
    await requireFullSiteAdminSession();
    await ensureTahoiyaGitCandidates();
    return Response.json({ status: await inspectTahoiyaCatalogMigration() });
  } catch (error) {
    return siteAdminAuthorizationError(error)
      ?? Response.json({ error: safeError(error, "TAHOIYA_CATALOG_STATUS_FAILED") }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const telemetry = createRequestTelemetry(request, "/api/admin/tahoiya-catalog-migration", {
    operation: "tahoiya-catalog-migration",
  });
  const limited = await rateLimitResponseFor(request, rateLimitPolicies.profileMutation);
  if (limited) return limited;
  try {
    const session = await requireRecentSiteAdminMfa();
    const body = await request.json().catch(() => null) as { cursor?: unknown } | null;
    if (!body || typeof body.cursor !== "string") {
      return Response.json({ error: "TAHOIYA_CATALOG_CURSOR_INVALID" }, { status: 400 });
    }
    await ensureTahoiyaGitCandidates();
    const result = await importTahoiyaCatalogBatch(body.cursor);
    if (result.done) {
      await appendSiteAdminAuditLog(request, session, "vocabulary.tahoiya-catalog-migration", "tahoiya_topics", null, {
        processed: result.processed,
        imported: result.imported,
        historyMemberships: result.historyMemberships,
        sourceValidCount: result.status?.sourceValidCount ?? null,
        targetTopicCount: result.status?.targetTopicCount ?? null,
      });
      telemetry.success("vocabulary.tahoiya-catalog-migration", {
        action: "complete",
        affectedCount: result.status?.targetTopicCount ?? result.imported,
        sourceCount: result.status?.sourceValidCount,
      });
    }
    return Response.json({ result });
  } catch (error) {
    const response = siteAdminAuthorizationError(error);
    if (response) return response;
    telemetry.failure("vocabulary.tahoiya-catalog-migration", error, 500, { action: "batch" });
    return Response.json({ error: safeError(error, "TAHOIYA_CATALOG_MIGRATION_FAILED") }, { status: 500 });
  }
}

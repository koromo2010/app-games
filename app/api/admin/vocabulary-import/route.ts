import { createRequestTelemetry } from "@/lib/observability";
import { rateLimitPolicies, rateLimitResponseFor } from "@/lib/rate-limit";
import { requireRecentSiteAdminMfa, requireFullSiteAdminSession, siteAdminAuthorizationError } from "@/lib/site-admin-auth";
import { appendSiteAdminAuditLog } from "@/lib/site-admin-passkey-store";
import { importLegacyVocabularyBatch, inspectLegacyVocabularyImport } from "@/lib/vocabulary-legacy-import";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const publicErrors = new Set([
  "APP_ENV_MISSING_OR_INVALID",
  "APP_ENV_VERCEL_ENV_MISMATCH",
  "LEGACY_VOCABULARY_CATALOG_NOT_FOUND",
  "LEGACY_VOCABULARY_CURSOR_INVALID",
  "LEGACY_VOCABULARY_IMPORT_PREVIEW_ONLY",
  "LEGACY_VOCABULARY_SOURCE_NOT_CONFIGURED",
  "LEGACY_VOCABULARY_SOURCE_TARGET_MUST_DIFFER",
  "VOCABULARY_ADMIN_STORE_NOT_CONFIGURED",
]);

function safeError(error: unknown, fallback: string) {
  return error instanceof Error && publicErrors.has(error.message) ? error.message : fallback;
}

export async function GET() {
  try {
    await requireFullSiteAdminSession();
    return Response.json({ status: await inspectLegacyVocabularyImport() });
  } catch (error) {
    return siteAdminAuthorizationError(error)
      ?? Response.json({ error: safeError(error, "LEGACY_VOCABULARY_STATUS_FAILED") }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const telemetry = createRequestTelemetry(request, "/api/admin/vocabulary-import", { operation: "vocabulary-legacy-import" });
  const limited = await rateLimitResponseFor(request, rateLimitPolicies.profileMutation);
  if (limited) return limited;
  try {
    const session = await requireRecentSiteAdminMfa();
    const body = await request.json().catch(() => null) as { afterId?: unknown } | null;
    if (!body || typeof body.afterId !== "number") {
      return Response.json({ error: "LEGACY_VOCABULARY_CURSOR_INVALID" }, { status: 400 });
    }
    const result = await importLegacyVocabularyBatch(body.afterId);
    if (result.done) {
      await appendSiteAdminAuditLog(request, session, "vocabulary.legacy-import", "shared_word_catalog", null, {
        processed: result.processed,
        sourceActiveCount: result.status?.sourceActiveCount ?? null,
        targetWordwolfEligibleCount: result.status?.targetWordwolfEligibleCount ?? null,
      });
      telemetry.success("vocabulary.legacy-import", {
        action: "complete",
        affectedCount: result.status?.targetWordwolfEligibleCount ?? result.imported,
        sourceCount: result.status?.sourceActiveCount,
      });
    }
    return Response.json({ result });
  } catch (error) {
    const response = siteAdminAuthorizationError(error);
    if (response) return response;
    telemetry.failure("vocabulary.legacy-import", error, 500, { action: "batch" });
    return Response.json({ error: safeError(error, "LEGACY_VOCABULARY_IMPORT_FAILED") }, { status: 500 });
  }
}

import { createRequestTelemetry } from "@/lib/observability";
import { rateLimitPolicies, rateLimitResponseFor } from "@/lib/rate-limit";
import { requireRecentSiteAdminMfa, requireSiteAdminSession, siteAdminAuthorizationError } from "@/lib/site-admin-auth";
import { appendSiteAdminAuditLog } from "@/lib/site-admin-passkey-store";
import { listVocabularyDrafts, reviewVocabularyDraft } from "@/lib/vocabulary-admin-store";

export const dynamic = "force-dynamic";

const publicVocabularyErrors = new Set([
  "VOCABULARY_ADMIN_STORE_NOT_CONFIGURED",
  "VOCABULARY_DRAFT_ALREADY_REVIEWED",
  "VOCABULARY_DRAFT_KIND_NOT_SUPPORTED",
  "VOCABULARY_DRAFT_NOT_FOUND",
]);

function safeVocabularyError(error: unknown, fallback: string) {
  return error instanceof Error && publicVocabularyErrors.has(error.message) ? error.message : fallback;
}

export async function GET() {
  try {
    await requireSiteAdminSession();
    return Response.json({ drafts: await listVocabularyDrafts() });
  } catch (error) {
    return siteAdminAuthorizationError(error)
      ?? Response.json({ error: safeVocabularyError(error, "VOCABULARY_DRAFTS_LOAD_FAILED") }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const telemetry = createRequestTelemetry(request, "/api/admin/vocabulary-drafts", { operation: "vocabulary-draft-review" });
  const limited = await rateLimitResponseFor(request, rateLimitPolicies.profileMutation);
  if (limited) return limited;
  try {
    const session = await requireRecentSiteAdminMfa();
    const body = await request.json() as { id?: unknown; decision?: unknown };
    if (typeof body.id !== "string" || (body.decision !== "active" && body.decision !== "rejected")) {
      return Response.json({ error: "VOCABULARY_DRAFT_INVALID" }, { status: 400 });
    }
    const result = await reviewVocabularyDraft(body.id, body.decision, session.email ?? "site-admin");
    await appendSiteAdminAuditLog(request, session, "vocabulary-draft.review", body.id, null, result);
    telemetry.success("vocabulary.review", { action: body.decision, affectedCount: 1 });
    return Response.json({ result });
  } catch (error) {
    const response = siteAdminAuthorizationError(error);
    if (response) return response;
    telemetry.failure("vocabulary.review", error, 500, { action: "review" });
    return Response.json({ error: safeVocabularyError(error, "VOCABULARY_DRAFT_REVIEW_FAILED") }, { status: 500 });
  }
}

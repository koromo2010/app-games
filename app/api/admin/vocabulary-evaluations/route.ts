import { createRequestTelemetry } from "@/lib/observability";
import { rateLimitPolicies, rateLimitResponseFor } from "@/lib/rate-limit";
import { requireRecentSiteAdminMfa, requireSiteAdminSession, siteAdminAuthorizationError } from "@/lib/site-admin-auth";
import { appendSiteAdminAuditLog } from "@/lib/site-admin-passkey-store";
import { castVocabularyWordGameVote, listVocabularyWordGameEvaluations } from "@/lib/vocabulary-admin-store";

export const dynamic = "force-dynamic";

const publicErrors = new Set([
  "VOCABULARY_ADMIN_STORE_NOT_CONFIGURED",
  "VOCABULARY_EVALUATION_NOT_FOUND",
  "VOCABULARY_EVALUATION_VOTE_INVALID",
  "VOCABULARY_HUMAN_VOTES_NOT_CONFIGURED",
]);

function safeError(error: unknown, fallback: string) {
  return error instanceof Error && publicErrors.has(error.message) ? error.message : fallback;
}

function voterFor(email: string | null) {
  return email?.normalize("NFKC").trim().toLocaleLowerCase("en-US") || "site-admin";
}

export async function GET() {
  try {
    const session = await requireSiteAdminSession();
    return Response.json(await listVocabularyWordGameEvaluations(voterFor(session.email)), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return siteAdminAuthorizationError(error)
      ?? Response.json({ error: safeError(error, "VOCABULARY_EVALUATIONS_LOAD_FAILED") }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const telemetry = createRequestTelemetry(request, "/api/admin/vocabulary-evaluations", {
    operation: "vocabulary-evaluation-vote",
  });
  const limited = await rateLimitResponseFor(request, rateLimitPolicies.profileMutation);
  if (limited) return limited;
  try {
    const session = await requireRecentSiteAdminMfa();
    const body = await request.json() as { evaluationId?: unknown; decision?: unknown; comment?: unknown };
    if (typeof body.evaluationId !== "string" || (body.decision !== "accept" && body.decision !== "reject")
      || (body.comment !== undefined && typeof body.comment !== "string")) {
      return Response.json({ error: "VOCABULARY_EVALUATION_VOTE_INVALID" }, { status: 400 });
    }
    const comment = typeof body.comment === "string" ? body.comment : null;
    const result = await castVocabularyWordGameVote(body.evaluationId, body.decision, voterFor(session.email), comment);
    await appendSiteAdminAuditLog(
      request,
      session,
      "vocabulary-evaluation.vote",
      body.evaluationId,
      { decision: result.previousDecision, hasComment: Boolean(result.previousComment) },
      { decision: result.decision, hasComment: Boolean(result.comment) },
    );
    telemetry.success("vocabulary.vote", { action: body.decision, affectedCount: 1 });
    return Response.json({ result });
  } catch (error) {
    const auth = siteAdminAuthorizationError(error);
    if (auth) return auth;
    const code = safeError(error, "VOCABULARY_EVALUATION_VOTE_FAILED");
    const status = code === "VOCABULARY_HUMAN_VOTES_NOT_CONFIGURED" ? 503
      : code === "VOCABULARY_EVALUATION_NOT_FOUND" ? 404
      : code === "VOCABULARY_EVALUATION_VOTE_INVALID" ? 400 : 500;
    telemetry.failure("vocabulary.vote", error, status, { action: "vote" });
    return Response.json({ error: code }, { status });
  }
}

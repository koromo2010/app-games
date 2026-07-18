import { createRequestTelemetry } from "@/lib/observability";
import { rateLimitPolicies, rateLimitResponseFor } from "@/lib/rate-limit";
import { requireRecentSiteAdminMfa, requireSiteAdminSession, siteAdminAuthorizationError } from "@/lib/site-admin-auth";
import { appendSiteAdminAuditLog } from "@/lib/site-admin-passkey-store";
import {
  adoptVocabularyEvaluationWordForTahoiya,
  castVocabularyWordGameVote,
  finalizeVocabularyWordGameEvaluation,
  listVocabularyWordGameEvaluations,
} from "@/lib/vocabulary-admin-store";

export const dynamic = "force-dynamic";

const publicErrors = new Set([
  "VOCABULARY_ADMIN_STORE_NOT_CONFIGURED",
  "VOCABULARY_EVALUATION_ACTION_INVALID",
  "VOCABULARY_EVALUATION_NOT_FOUND",
  "VOCABULARY_EVALUATION_ALREADY_REVIEWED",
  "VOCABULARY_EVALUATION_FINAL_REVIEW_INVALID",
  "VOCABULARY_EVALUATION_TAHOIYA_INVALID",
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

export async function PATCH(request: Request) {
  const telemetry = createRequestTelemetry(request, "/api/admin/vocabulary-evaluations", {
    operation: "vocabulary-evaluation-review-action",
  });
  const limited = await rateLimitResponseFor(request, rateLimitPolicies.profileMutation);
  if (limited) return limited;
  try {
    const session = await requireRecentSiteAdminMfa();
    const body = await request.json() as { evaluationId?: unknown; action?: unknown; decision?: unknown };
    if (typeof body.evaluationId !== "string") {
      return Response.json({ error: "VOCABULARY_EVALUATION_ACTION_INVALID" }, { status: 400 });
    }
    if (body.action === "finalize") {
      if (body.decision !== "adopted" && body.decision !== "rejected") {
        return Response.json({ error: "VOCABULARY_EVALUATION_FINAL_REVIEW_INVALID" }, { status: 400 });
      }
      const result = await finalizeVocabularyWordGameEvaluation(
        body.evaluationId,
        body.decision,
        voterFor(session.email),
      );
      await appendSiteAdminAuditLog(
        request,
        session,
        "vocabulary-evaluation.finalize",
        body.evaluationId,
        { finalDecision: null, linkedDraftStatus: result.previousLinkedDraftStatus },
        { finalDecision: result.decision, linkedDraftStatus: result.linkedDraftStatus },
      );
      telemetry.success("vocabulary.final-review", { action: body.decision, affectedCount: 1 });
      return Response.json({ result });
    }
    if (body.action !== "adopt-tahoiya") {
      return Response.json({ error: "VOCABULARY_EVALUATION_TAHOIYA_INVALID" }, { status: 400 });
    }
    const result = await adoptVocabularyEvaluationWordForTahoiya(
      body.evaluationId,
      voterFor(session.email),
    );
    await appendSiteAdminAuditLog(
      request,
      session,
      "vocabulary-evaluation.adopt-tahoiya",
      result.wordId,
      {
        tahoiyaEligible: result.previouslyTahoiyaEligible,
        selectionZipfOverride: result.previousSelectionZipfOverride,
        effectiveZipf: result.previousEffectiveZipf,
        wordwolfFinalDecision: result.wordwolfReview.alreadyReviewed
          ? result.wordwolfReview.decision
          : null,
        linkedDraftStatus: result.wordwolfReview.previousLinkedDraftStatus,
      },
      {
        tahoiyaEligible: true,
        selectionZipfOverride: result.selectionZipfOverride,
        effectiveZipf: result.effectiveZipf,
        wordwolfFinalDecision: result.wordwolfReview.decision,
        linkedDraftStatus: result.wordwolfReview.linkedDraftStatus,
      },
    );
    telemetry.success("vocabulary.tahoiya-adopt", { action: "adopt-tahoiya", affectedCount: 1 });
    return Response.json({ result });
  } catch (error) {
    const auth = siteAdminAuthorizationError(error);
    if (auth) return auth;
    const code = safeError(error, "VOCABULARY_EVALUATION_ACTION_FAILED");
    const status = code === "VOCABULARY_EVALUATION_NOT_FOUND" ? 404
      : code === "VOCABULARY_EVALUATION_ALREADY_REVIEWED" ? 409
      : code === "VOCABULARY_EVALUATION_ACTION_INVALID"
        || code === "VOCABULARY_EVALUATION_TAHOIYA_INVALID"
        || code === "VOCABULARY_EVALUATION_FINAL_REVIEW_INVALID" ? 400 : 500;
    telemetry.failure("vocabulary.review-action", error, status, { action: "patch" });
    return Response.json({ error: code }, { status });
  }
}

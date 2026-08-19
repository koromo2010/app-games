import {
  appendUserReportMessage,
  listUserReportsForPlayer,
  loadUserReport,
  saveUserReport,
} from "@/lib/user-report-store";
import {
  deliverUserReportAdminNotification,
} from "@/lib/user-report-admin-notification";
import { requireSdkServiceRequest } from "@/lib/sdk-service-auth";
import {
  approveUserReportReplyDraft,
  approveUserReportDraft,
  loadApprovedUserReportForDraft,
  loadUserReportReplyDraft,
  loadUserReportDraft,
  saveUserReportReplyDraft,
  saveUserReportDraft,
} from "@/lib/user-report-draft-store";
import { rateLimitPolicies, rateLimitResponseFor } from "@/lib/rate-limit";
import {
  SupportTextValidationError,
  supportTextValidationPayload,
  validateSupportReportText,
  validateSupportText,
} from "@/config/support-text-contract";
import { createRequestTelemetry } from "@/lib/observability/logger";
import { redisStoreObservabilityFields } from "@/lib/redis-store";
import {
  normalizeSupportRequestId,
} from "@/lib/support-request-contract";
import { observabilityErrorCode } from "@/lib/observability";
import { sdkSupportEnvironment } from "@/lib/storage-environment-guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function reportText(value: unknown) {
  try {
    const input = value && typeof value === "object"
      ? value as Record<string, unknown>
      : {};
    return { value: validateSupportReportText({
      summary: input.summary,
      details: input.details,
      page: input.page,
    }) };
  } catch (error) {
    if (error instanceof SupportTextValidationError) {
      return {
        response: Response.json(
          supportTextValidationPayload(error),
          { status: 400 },
        ),
      };
    }
    throw error;
  }
}

function replyText(value: unknown) {
  try {
    return {
      value: validateSupportText(value, "reply", { required: true }),
    };
  } catch (error) {
    if (error instanceof SupportTextValidationError) {
      return {
        response: Response.json(
          supportTextValidationPayload(error),
          { status: 400 },
        ),
      };
    }
    throw error;
  }
}

function authorize(request: Request) {
  try {
    requireSdkServiceRequest(request, {
      expectedEnvironment: sdkSupportEnvironment(),
    });
    return null;
  } catch (error) {
    if (
      error instanceof Error
      && (
        error.message === "SDK_SERVICE_ENVIRONMENT_MISMATCH"
        || error.message === "APP_ENV_MISSING_OR_INVALID"
        || error.message === "APP_ENV_VERCEL_ENV_MISMATCH"
      )
    ) {
      return Response.json(
        { error: "support_environment_mismatch" },
        { status: 409 },
      );
    }
    return Response.json({ error: "forbidden" }, { status: 403 });
  }
}

function playerIdFromUrl(request: Request) {
  const playerId = new URL(request.url).searchParams.get("playerId")?.trim()
    ?? "";
  return playerId && playerId.length <= 120 ? playerId : null;
}

export async function GET(request: Request) {
  const denied = authorize(request);
  if (denied) return denied;
  const playerId = playerIdFromUrl(request);
  if (!playerId) {
    return Response.json({ error: "player_input_invalid" }, { status: 400 });
  }
  const reportId = new URL(request.url).searchParams.get("reportId")?.trim()
    ?? "";
  const draftId = new URL(request.url).searchParams.get("draftId")?.trim()
    ?? "";
  const replyDraftId = new URL(request.url).searchParams
    .get("replyDraftId")?.trim() ?? "";
  try {
    if (replyDraftId) {
      const draft = await loadUserReportReplyDraft(replyDraftId, playerId);
      if (!draft) {
        return Response.json(
          { error: "support_reply_draft_not_found" },
          { status: 404 },
        );
      }
      const report = await loadUserReport(draft.reportId);
      if (!report || report.playerId !== playerId) {
        return Response.json(
          { error: "support_thread_not_found" },
          { status: 404 },
        );
      }
      if (draft.approvedAt) {
        return Response.json(
          { state: "approved", draft, report },
          { headers: { "Cache-Control": "no-store" } },
        );
      }
      return Response.json(
        { state: "draft", draft, report },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    if (draftId) {
      const [draft, report] = await Promise.all([
        loadUserReportDraft(draftId, playerId),
        loadApprovedUserReportForDraft(draftId, playerId),
      ]);
      if (!draft && !report) {
        return Response.json(
          { error: "support_draft_not_found" },
          { status: 404 },
        );
      }
      return Response.json(
        report
          ? { state: "approved", report }
          : { state: "draft", draft },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    if (reportId) {
      const report = await loadUserReport(reportId);
      if (!report || report.playerId !== playerId) {
        return Response.json(
          { error: "support_thread_not_found" },
          { status: 404 },
        );
      }
      return Response.json(
        { report },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    return Response.json(
      { reports: await listUserReportsForPlayer(playerId, 200) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      { error: "support_threads_unavailable" },
      { status: 503 },
    );
  }
}

export async function POST(request: Request) {
  const denied = authorize(request);
  if (denied) return denied;
  const telemetry = createRequestTelemetry(
    request,
    "/api/internal/sdk-support",
    { operation: "sdk-support" },
  );
  const body = await request.json().catch(() => null) as {
    action?: unknown;
    playerId?: unknown;
    reportId?: unknown;
    draftId?: unknown;
    replyDraftId?: unknown;
    requestId?: unknown;
    message?: unknown;
    type?: unknown;
    summary?: unknown;
    details?: unknown;
    page?: unknown;
  } | null;
  const action = typeof body?.action === "string" ? body.action : "reply";
  const playerId = typeof body?.playerId === "string"
    ? body.playerId.trim()
    : "";
  if (!playerId || playerId.length > 120) {
    return Response.json({ error: "player_input_invalid" }, { status: 400 });
  }
  const limited = await rateLimitResponseFor(
    request,
    rateLimitPolicies.feedback,
    { playerId },
  );
  if (limited) return limited;
  if (action === "create-report") {
    const requestId = normalizeSupportRequestId(body?.requestId);
    const type = body?.type === "bug" || body?.type === "request"
      ? body.type
      : null;
    const validatedText = reportText(body);
    if (validatedText.response) return validatedText.response;
    const { summary, details, page } = validatedText.value!;
    if (!requestId || !type) {
      return Response.json(
        { error: "support_report_invalid" },
        { status: 400 },
      );
    }
    try {
      const saved = await saveUserReport({
        playerId,
        type,
        summary,
        details,
        page,
      }, {
        reportId: `report_${requestId}`,
      });
      let report = await loadUserReport(saved.id);
      if (!report || report.playerId !== playerId) {
        throw new Error("USER_REPORT_SAVE_FAILED");
      }
      if (saved.inserted || report.notificationStatus !== "sent") {
        report = (await deliverUserReportAdminNotification(report, {
          idempotencyKey: `user-report-admin-notification-${report.id}`,
        })).report;
      }
      return Response.json(
        { report },
        { status: saved.inserted ? 201 : 200 },
      );
    } catch (error) {
      if (
        error instanceof Error
        && error.message === "USER_REPORT_ID_CONFLICT"
      ) {
        return Response.json(
          { error: "support_report_conflict" },
          { status: 409 },
        );
      }
      return Response.json(
        { error: "support_report_unavailable" },
        { status: 503 },
      );
    }
  }
  if (action === "create-draft") {
    const requestId = normalizeSupportRequestId(body?.requestId);
    const type = body?.type === "bug" || body?.type === "request"
      ? body.type
      : null;
    const validatedText = reportText(body);
    if (validatedText.response) return validatedText.response;
    const { summary, details, page } = validatedText.value!;
    if (!requestId || !type) {
      return Response.json(
        {
          error: "support_draft_invalid",
          errorCode: requestId
            ? "SUPPORT_REPORT_TYPE_INVALID"
            : "SUPPORT_REQUEST_ID_INVALID",
        },
        { status: 400 },
      );
    }
    try {
      const draft = await saveUserReportDraft({
        playerId,
        requestId,
        type,
        summary,
        details,
        page,
      });
      return Response.json({ draft }, { status: 201 });
    } catch (error) {
      if (
        error instanceof Error
        && (
          error.message === "USER_REPORT_DRAFT_CONFLICT"
          || error.message === "USER_REPORT_DRAFT_REQUEST_ID_INVALID"
        )
      ) {
        return Response.json(
          {
            error: error.message === "USER_REPORT_DRAFT_CONFLICT"
              ? "support_draft_conflict"
              : "support_draft_invalid",
            errorCode: error.message,
          },
          { status: error.message === "USER_REPORT_DRAFT_CONFLICT" ? 409 : 400 },
        );
      }
      const errorCode = observabilityErrorCode(error);
      telemetry.failure("support.draft", error, 503, {
        action: "create-draft",
        ...redisStoreObservabilityFields(error),
      });
      return Response.json(
        { error: "support_draft_unavailable", errorCode },
        { status: 503 },
      );
    }
  }
  if (action === "create-reply-draft") {
    const reportId = typeof body?.reportId === "string"
      ? body.reportId.trim()
      : "";
    const requestId = normalizeSupportRequestId(body?.requestId);
    const validatedMessage = replyText(body?.message);
    if (validatedMessage.response) return validatedMessage.response;
    const message = validatedMessage.value!;
    if (!reportId || !requestId) {
      return Response.json(
        {
          error: "support_reply_draft_invalid",
          errorCode: requestId
            ? "SUPPORT_REPORT_ID_INVALID"
            : "SUPPORT_REQUEST_ID_INVALID",
        },
        { status: 400 },
      );
    }
    try {
      const draft = await saveUserReportReplyDraft({
        playerId,
        reportId,
        requestId,
        message,
      });
      return Response.json({ draft }, { status: 201 });
    } catch (error) {
      if (
        error instanceof Error
        && error.message === "USER_REPORT_NOT_FOUND"
      ) {
        return Response.json(
          { error: "support_thread_not_found" },
          { status: 404 },
        );
      }
      if (
        error instanceof Error
        && (
          error.message === "USER_REPORT_REPLY_DRAFT_CONFLICT"
          || error.message === "USER_REPORT_REPLY_DRAFT_REQUEST_ID_INVALID"
        )
      ) {
        return Response.json(
          {
            error: error.message === "USER_REPORT_REPLY_DRAFT_CONFLICT"
              ? "support_reply_draft_conflict"
              : "support_reply_draft_invalid",
            errorCode: error.message,
          },
          { status: error.message === "USER_REPORT_REPLY_DRAFT_CONFLICT" ? 409 : 400 },
        );
      }
      const errorCode = observabilityErrorCode(error);
      return Response.json(
        { error: "support_reply_draft_unavailable", errorCode },
        { status: 503 },
      );
    }
  }
  if (action === "approve-draft") {
    const draftId = typeof body?.draftId === "string"
      ? body.draftId.trim()
      : "";
    const type = body?.type === "bug" || body?.type === "request"
      ? body.type
      : null;
    const validatedText = reportText(body);
    if (validatedText.response) return validatedText.response;
    const { summary, details, page } = validatedText.value!;
    if (!draftId || !type) {
      return Response.json(
        { error: "support_draft_approval_invalid" },
        { status: 400 },
      );
    }
    try {
      let report = await approveUserReportDraft({
        draftId,
        playerId,
        type,
        summary,
        details,
        page,
      });
      if (report.notificationStatus !== "sent") {
        report = (await deliverUserReportAdminNotification(report, {
          idempotencyKey: `user-report-admin-notification-${report.id}`,
        })).report;
      }
      return Response.json({ report }, { status: 201 });
    } catch (error) {
      if (
        error instanceof Error
        && error.message === "USER_REPORT_DRAFT_NOT_FOUND"
      ) {
        return Response.json(
          { error: "support_draft_not_found" },
          { status: 404 },
        );
      }
      if (
        error instanceof Error
        && error.message === "USER_REPORT_DRAFT_APPROVAL_CONFLICT"
      ) {
        return Response.json(
          { error: "support_draft_approval_conflict" },
          { status: 409 },
        );
      }
      return Response.json(
        { error: "support_draft_approval_unavailable" },
        { status: 503 },
      );
    }
  }
  if (action === "approve-reply-draft") {
    const replyDraftId = typeof body?.replyDraftId === "string"
      ? body.replyDraftId.trim()
      : "";
    const validatedMessage = replyText(body?.message);
    if (validatedMessage.response) return validatedMessage.response;
    const message = validatedMessage.value!;
    if (!replyDraftId) {
      return Response.json(
        { error: "support_reply_draft_approval_invalid" },
        { status: 400 },
      );
    }
    try {
      const result = await approveUserReportReplyDraft({
        draftId: replyDraftId,
        playerId,
        message,
      });
      let report = result.report;
      if (result.inserted || report.notificationStatus !== "sent") {
        report = (await deliverUserReportAdminNotification(report, {
          idempotencyKey: `user-report-admin-followup-${result.message.id}`,
          body: result.message.body,
        })).report;
      }
      return Response.json({ report }, { status: 201 });
    } catch (error) {
      if (
        error instanceof Error
        && (
          error.message === "USER_REPORT_REPLY_DRAFT_NOT_FOUND"
          || error.message === "USER_REPORT_NOT_FOUND"
          || error.message === "USER_REPORT_FORBIDDEN"
        )
      ) {
        return Response.json(
          { error: "support_reply_draft_not_found" },
          { status: 404 },
        );
      }
      if (
        error instanceof Error
        && error.message === "USER_REPORT_MESSAGE_ID_CONFLICT"
      ) {
        return Response.json(
          { error: "support_reply_draft_approval_conflict" },
          { status: 409 },
        );
      }
      return Response.json(
        { error: "support_reply_draft_approval_unavailable" },
        { status: 503 },
      );
    }
  }
  const reportId = typeof body?.reportId === "string"
    ? body.reportId.trim()
    : "";
  const requestId = normalizeSupportRequestId(body?.requestId);
  const validatedMessage = replyText(body?.message);
  if (validatedMessage.response) return validatedMessage.response;
  const message = validatedMessage.value!;
  if (!reportId || !requestId) {
    return Response.json(
      {
        error: "support_reply_invalid",
        errorCode: requestId ? "SUPPORT_REPORT_ID_INVALID" : "SUPPORT_REQUEST_ID_INVALID",
      },
      { status: 400 },
    );
  }
  try {
    const result = await appendUserReportMessage({
      reportId,
      playerId,
      requestId,
      author: "requester",
      body: message,
      status: "open",
    });
    let report = result.report;
    if (result.inserted || report.notificationStatus !== "sent") {
      report = (await deliverUserReportAdminNotification(report, {
        idempotencyKey: `user-report-admin-followup-${result.message.id}`,
        body: result.message.body,
      })).report;
    }
    return Response.json(
      { report },
      { status: result.inserted ? 201 : 200 },
    );
  } catch (error) {
    if (
      error instanceof Error
      && (
        error.message === "USER_REPORT_NOT_FOUND"
        || error.message === "USER_REPORT_FORBIDDEN"
      )
    ) {
      return Response.json(
        { error: "support_thread_not_found" },
        { status: 404 },
      );
    }
    if (
      error instanceof Error
      && error.message === "USER_REPORT_MESSAGE_ID_CONFLICT"
    ) {
      return Response.json(
        { error: "support_reply_conflict" },
        { status: 409 },
      );
    }
    return Response.json(
      { error: "support_reply_unavailable" },
      { status: 503 },
    );
  }
}

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
    const requestId = typeof body?.requestId === "string"
      ? body.requestId.trim().toLowerCase()
      : "";
    const type = body?.type === "bug" || body?.type === "request"
      ? body.type
      : null;
    const summary = typeof body?.summary === "string"
      ? body.summary.trim().slice(0, 120)
      : "";
    const details = typeof body?.details === "string"
      ? body.details.trim().slice(0, 1_200)
      : "";
    const page = typeof body?.page === "string"
      ? body.page.trim().slice(0, 200)
      : "";
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
        .test(requestId)
      || !type
      || !summary
    ) {
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
    const requestId = typeof body?.requestId === "string"
      ? body.requestId.trim()
      : "";
    const type = body?.type === "bug" || body?.type === "request"
      ? body.type
      : null;
    const summary = typeof body?.summary === "string"
      ? body.summary.trim().slice(0, 120)
      : "";
    const details = typeof body?.details === "string"
      ? body.details.trim().slice(0, 1_200)
      : "";
    const page = typeof body?.page === "string"
      ? body.page.trim().slice(0, 200)
      : "";
    if (!requestId || !type || !summary) {
      return Response.json(
        { error: "support_draft_invalid" },
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
    } catch {
      return Response.json(
        { error: "support_draft_unavailable" },
        { status: 503 },
      );
    }
  }
  if (action === "create-reply-draft") {
    const reportId = typeof body?.reportId === "string"
      ? body.reportId.trim()
      : "";
    const requestId = typeof body?.requestId === "string"
      ? body.requestId.trim()
      : "";
    const message = typeof body?.message === "string"
      ? body.message.trim().slice(0, 3_000)
      : "";
    if (!reportId || !requestId || !message) {
      return Response.json(
        { error: "support_reply_draft_invalid" },
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
      return Response.json(
        { error: "support_reply_draft_unavailable" },
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
    const summary = typeof body?.summary === "string"
      ? body.summary.trim().slice(0, 120)
      : "";
    const details = typeof body?.details === "string"
      ? body.details.trim().slice(0, 1_200)
      : "";
    const page = typeof body?.page === "string"
      ? body.page.trim().slice(0, 200)
      : "";
    if (!draftId || !type || !summary) {
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
    const message = typeof body?.message === "string"
      ? body.message.trim().slice(0, 3_000)
      : "";
    if (!replyDraftId || !message) {
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
      return Response.json(
        { error: "support_reply_draft_approval_unavailable" },
        { status: 503 },
      );
    }
  }
  const reportId = typeof body?.reportId === "string"
    ? body.reportId.trim()
    : "";
  const requestId = typeof body?.requestId === "string"
    ? body.requestId.trim().slice(0, 120)
    : "";
  const message = typeof body?.message === "string"
    ? body.message.trim().slice(0, 3_000)
    : "";
  if (
    !reportId
    || !requestId
    || !message
  ) {
    return Response.json({ error: "support_reply_invalid" }, { status: 400 });
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
    return Response.json(
      { error: "support_reply_unavailable" },
      { status: 503 },
    );
  }
}

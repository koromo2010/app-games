import { createRequestTelemetry } from "@/lib/observability";
import { rateLimitPolicies, rateLimitResponseFor } from "@/lib/rate-limit";
import {
  appendUserReportMessage,
  listUserReportsWithDiagnostics,
  loadUserReport,
  updateUserReportMessageDelivery,
  updateUserReportStatus,
} from "@/lib/user-report-store";
import {
  inspectUserReportStorage,
  safeUserReportStorageAudit,
  safeUserReportStorageInspection,
} from "@/lib/user-report-storage-audit";
import {
  deliverUserReportAdminNotification,
} from "@/lib/user-report-admin-notification";
import { sendCreatorSupportReplyEmail } from "@/lib/email";
import { isUserReportStatus } from "@/lib/user-report-core";
import { loadVerifiedPlayerEmailByPlayerId } from "@/lib/player-account-store";
import { sdkSupportThreadUrl } from "@/lib/sdk-support-url";
import {
  requireFullSiteAdminSession,
  requireRecentSiteAdminMfa,
  siteAdminAuthorizationError,
} from "@/lib/site-admin-auth";
import { appendSiteAdminAuditLog } from "@/lib/site-admin-passkey-store";
import {
  SupportTextValidationError,
  supportTextValidationPayload,
  validateSupportText,
} from "@/config/support-text-contract";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const telemetry = createRequestTelemetry(
    request,
    "/api/admin/user-reports",
    { operation: "user-report-list" },
  );
  try {
    await requireFullSiteAdminSession();
    const reportId = new URL(request.url).searchParams.get("reportId");
    if (reportId !== null) {
      const normalizedReportId = reportId.trim();
      if (!/^report_[0-9a-f-]{36}$/i.test(normalizedReportId)) {
        return Response.json(
          { error: "USER_REPORT_ID_INVALID" },
          { status: 400 },
        );
      }
      const inspection = await inspectUserReportStorage(normalizedReportId);
      telemetry.success("user-report.lookup", {
        affectedCount: inspection.report ? 1 : 0,
      });
      return Response.json(
        {
          reports: inspection.report ? [inspection.report] : [],
          lookup: safeUserReportStorageInspection(inspection),
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    const result = await listUserReportsWithDiagnostics();
    telemetry.success("user-report.list", {
      affectedCount: result.reports.length,
    });
    return Response.json(
      {
        reports: result.reports,
        storageAudit: safeUserReportStorageAudit(result.audit),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const auth = siteAdminAuthorizationError(error);
    if (auth) return auth;
    telemetry.failure("user-report.list", error, 500);
    return Response.json(
      { error: "USER_REPORTS_LOAD_FAILED" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const telemetry = createRequestTelemetry(request, "/api/admin/user-reports", {
    operation: "user-report-reply",
  });
  const limited = await rateLimitResponseFor(
    request,
    rateLimitPolicies.profileMutation,
  );
  if (limited) return limited;
  try {
    const session = await requireFullSiteAdminSession();
    const body = await request.json().catch(() => null) as {
      action?: unknown;
      reportId?: unknown;
      messageId?: unknown;
      requestId?: unknown;
      message?: unknown;
      status?: unknown;
    } | null;
    if (body?.action === "retry-email") {
      const reportId = typeof body.reportId === "string"
        ? body.reportId
        : "";
      const messageId = typeof body.messageId === "string"
        ? body.messageId
        : "";
      const retryRequestId = typeof body.requestId === "string"
        ? body.requestId.trim()
        : "";
      if (!reportId || !messageId || !retryRequestId || retryRequestId.length > 120) {
        return Response.json(
          { error: "USER_REPORT_REPLY_EMAIL_RETRY_INVALID" },
          { status: 400 },
        );
      }
      const existing = await loadUserReport(reportId);
      const existingMessage = existing?.messages.find(
        (entry) => entry.id === messageId && entry.author === "admin",
      );
      if (!existing || !existingMessage) {
        return Response.json(
          { error: "USER_REPORT_REPLY_MESSAGE_NOT_FOUND" },
          { status: 404 },
        );
      }
      if (
        existingMessage.deliveryStatus !== "failed"
        && existingMessage.deliveryStatus !== "pending"
      ) {
        return Response.json(
          { error: "USER_REPORT_REPLY_EMAIL_NOT_RETRYABLE" },
          { status: 409 },
        );
      }
      await updateUserReportMessageDelivery(
        existing.id,
        existingMessage.id,
        "pending",
      );
      let deliveryStatus: "sent" | "failed" | "not-required";
      try {
        const recipient = await loadVerifiedPlayerEmailByPlayerId(
          existing.playerId,
        );
        deliveryStatus = recipient
          ? await sendCreatorSupportReplyEmail({
            to: recipient,
            reportId: existing.id,
            body: existingMessage.body,
            supportUrl: sdkSupportThreadUrl(request.url, existing.id),
            idempotencyKey: `user-report-reply-${existingMessage.id}`,
          }).then(() => "sent" as const).catch(() => "failed" as const)
          : "not-required";
      } catch {
        deliveryStatus = "failed";
      }
      const report = await updateUserReportMessageDelivery(
        existing.id,
        existingMessage.id,
        deliveryStatus,
      );
      await appendSiteAdminAuditLog(
        request,
        session,
        "user-report.reply-email-retry",
        report.id,
        null,
        {
          messageId: existingMessage.id,
          deliveryStatus,
          retryRequestId,
        },
      );
      telemetry.success("user-report.reply-email", {
        action: deliveryStatus,
        channel: "email",
      });
      return Response.json({ report, deliveryStatus });
    }
    const message = validateSupportText(
      body?.message,
      "reply",
      { required: true },
    );
    const requestId = typeof body?.requestId === "string"
      ? body.requestId.trim()
      : "";
    const status = isUserReportStatus(body?.status)
      ? body.status
      : "waiting-user";
    if (
      typeof body?.reportId !== "string"
      || !requestId
      || requestId.length > 120
    ) {
      return Response.json(
        { error: "USER_REPORT_REPLY_INVALID" },
        { status: 400 },
      );
    }
    const result = await appendUserReportMessage({
      reportId: body.reportId,
      requestId,
      author: "admin",
      body: message,
      status,
      deliveryStatus: "pending",
    });
    let deliveryStatus = result.message.deliveryStatus;
    if (
      result.inserted
      || deliveryStatus === "pending"
      || deliveryStatus === "failed"
    ) {
      let recipient: string | null = null;
      try {
        recipient = await loadVerifiedPlayerEmailByPlayerId(
          result.report.playerId,
        );
        deliveryStatus = recipient
          ? await sendCreatorSupportReplyEmail({
            to: recipient,
            reportId: result.report.id,
            body: message,
            supportUrl: sdkSupportThreadUrl(request.url, result.report.id),
            idempotencyKey: `user-report-reply-${result.message.id}`,
          }).then(() => "sent" as const).catch(() => "failed" as const)
          : "not-required";
      } catch {
        deliveryStatus = "failed";
      }
    }
    const report = await updateUserReportMessageDelivery(
      result.report.id,
      result.message.id,
      deliveryStatus,
    );
    await appendSiteAdminAuditLog(
      request,
      session,
      "user-report.reply",
      report.id,
      null,
      {
        messageId: result.message.id,
        status: report.status,
        deliveryStatus,
        inserted: result.inserted,
      },
    );
    telemetry.success("user-report.reply", {
      action: report.status,
    });
    return Response.json(
      { report, deliveryStatus },
      { status: result.inserted ? 201 : 200 },
    );
  } catch (error) {
    const auth = siteAdminAuthorizationError(error);
    if (auth) return auth;
    if (error instanceof SupportTextValidationError) {
      return Response.json(supportTextValidationPayload(error), { status: 400 });
    }
    if (error instanceof Error && error.message === "USER_REPORT_NOT_FOUND") {
      return Response.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof Error && error.message === "USER_REPORT_STATUS_TRANSITION_INVALID") {
      return Response.json({ error: error.message }, { status: 409 });
    }
    if (
      error instanceof Error
      && error.message === "USER_REPORT_MESSAGE_ID_CONFLICT"
    ) {
      return Response.json({ error: error.message }, { status: 409 });
    }
    telemetry.failure("user-report.reply", error, 500);
    return Response.json(
      { error: "USER_REPORT_REPLY_FAILED" },
      { status: 500 },
    );
  }
}

export async function PUT(request: Request) {
  const telemetry = createRequestTelemetry(request, "/api/admin/user-reports", {
    operation: "user-report-admin-notification-retry",
  });
  const limited = await rateLimitResponseFor(
    request,
    rateLimitPolicies.profileMutation,
  );
  if (limited) return limited;
  try {
    const session = await requireRecentSiteAdminMfa();
    const body = await request.json().catch(() => null) as {
      reportId?: unknown;
      requestId?: unknown;
    } | null;
    const reportId = typeof body?.reportId === "string"
      ? body.reportId
      : "";
    const requestId = typeof body?.requestId === "string"
      ? body.requestId.trim()
      : "";
    if (!reportId || !requestId || requestId.length > 120) {
      return Response.json(
        { error: "USER_REPORT_NOTIFICATION_RETRY_INVALID" },
        { status: 400 },
      );
    }
    const existing = await loadUserReport(reportId);
    if (!existing) {
      return Response.json(
        { error: "USER_REPORT_NOT_FOUND" },
        { status: 404 },
      );
    }
    const notification = await deliverUserReportAdminNotification(existing, {
      idempotencyKey: `user-report-admin-retry-${existing.id}-${requestId}`,
    });
    await appendSiteAdminAuditLog(
      request,
      session,
      "user-report.notification-retry",
      notification.report.id,
      null,
      {
        deliveryStatus: notification.deliveryStatus,
        errorCode: notification.errorCode,
      },
    );
    if (notification.deliveryStatus === "failed") {
      telemetry.failure(
        "user-report.admin-notification",
        new Error(notification.errorCode ?? "EMAIL_SEND_FAILED"),
        502,
        { action: "retry", channel: "email" },
      );
    } else {
      telemetry.success("user-report.admin-notification", {
        action: "retry",
        channel: "email",
      });
    }
    return Response.json(notification);
  } catch (error) {
    const auth = siteAdminAuthorizationError(error);
    if (auth) return auth;
    telemetry.failure("user-report.admin-notification", error, 500, {
      action: "retry",
      channel: "email",
    });
    return Response.json(
      { error: "USER_REPORT_NOTIFICATION_RETRY_FAILED" },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  const telemetry = createRequestTelemetry(request, "/api/admin/user-reports", {
    operation: "user-report-status-update",
  });
  const limited = await rateLimitResponseFor(request, rateLimitPolicies.profileMutation);
  if (limited) return limited;
  try {
    const session = await requireRecentSiteAdminMfa();
    const body = await request.json() as { reportId?: unknown; status?: unknown };
    if (typeof body.reportId !== "string" || !isUserReportStatus(body.status)) {
      return Response.json({ error: "USER_REPORT_STATUS_INVALID" }, { status: 400 });
    }
    const report = await updateUserReportStatus(body.reportId, body.status);
    await appendSiteAdminAuditLog(
      request,
      session,
      "user-report.status-update",
      report.id,
      null,
      { status: report.status },
    );
    telemetry.success("user-report.status", { action: report.status });
    return Response.json({ report });
  } catch (error) {
    const auth = siteAdminAuthorizationError(error);
    if (auth) return auth;
    if (error instanceof Error && error.message === "USER_REPORT_NOT_FOUND") {
      return Response.json({ error: error.message }, { status: 404 });
    }
    telemetry.failure("user-report.status", error, 500);
    return Response.json({ error: "USER_REPORT_STATUS_SAVE_FAILED" }, { status: 500 });
  }
}

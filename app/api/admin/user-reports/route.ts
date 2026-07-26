import { createRequestTelemetry } from "@/lib/observability";
import { rateLimitPolicies, rateLimitResponseFor } from "@/lib/rate-limit";
import {
  appendUserReportMessage,
  listUserReports,
  loadUserReport,
  updateUserReportMessageDelivery,
  updateUserReportStatus,
} from "@/lib/user-report-store";
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

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    await requireFullSiteAdminSession();
    return Response.json(
      { reports: await listUserReports() },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return siteAdminAuthorizationError(error)
      ?? Response.json({ error: "USER_REPORTS_LOAD_FAILED" }, { status: 500 });
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
    const session = await requireRecentSiteAdminMfa();
    const body = await request.json().catch(() => null) as {
      reportId?: unknown;
      requestId?: unknown;
      message?: unknown;
      status?: unknown;
    } | null;
    const message = typeof body?.message === "string"
      ? body.message.trim().slice(0, 3_000)
      : "";
    const requestId = typeof body?.requestId === "string"
      ? body.requestId.trim().slice(0, 120)
      : "";
    const status = isUserReportStatus(body?.status)
      ? body.status
      : "waiting-user";
    if (
      typeof body?.reportId !== "string"
      || !requestId
      || !message
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
    if (error instanceof Error && error.message === "USER_REPORT_NOT_FOUND") {
      return Response.json({ error: error.message }, { status: 404 });
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
      ? body.requestId.trim().slice(0, 120)
      : "";
    if (!reportId || !requestId) {
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

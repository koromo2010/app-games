import { createRequestTelemetry } from "@/lib/observability";
import { isPlayerAuthConfigurationError, requireAuthenticatedPlayer } from "@/lib/player-auth";
import {
  loadUserReport,
  saveUserReport,
  type UserReportType,
} from "@/lib/user-report-store";
import {
  deliverUserReportAdminNotification,
} from "@/lib/user-report-admin-notification";
import { rateLimitPolicies, rateLimitResponseFor } from "@/lib/rate-limit";

function clean(value: unknown, limit: number) {
  return typeof value === "string" ? value.trim().slice(0, limit) : "";
}

export async function POST(request: Request) {
  const telemetry = createRequestTelemetry(request, "/api/user-reports", { operation: "user-report-save" });
  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; }
  catch { return Response.json({ error: "Invalid request" }, { status: 400 }); }

  const type: UserReportType | null = body.type === "bug" || body.type === "request" ? body.type : null;
  const summary = clean(body.summary, 120);
  const requestId = clean(body.requestId, 36).toLowerCase();
  if (
    !type
    || !summary
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      .test(requestId)
  ) {
    return Response.json(
      { error: "Type, summary, and request ID are required" },
      { status: 400 },
    );
  }

  try {
    const player = await requireAuthenticatedPlayer();
    const limited = await rateLimitResponseFor(request, rateLimitPolicies.feedback, { playerId: player.id });
    if (limited) return limited;
    const saved = await saveUserReport({
      type,
      summary,
      details: clean(body.details, 1200),
      page: clean(body.page, 200),
      playerId: player.id,
    }, {
      reportId: `report_${requestId}`,
    });
    const stored = await loadUserReport(saved.id);
    if (!stored) throw new Error("USER_REPORT_SAVE_FAILED");
    const notification = saved.inserted || stored.notificationStatus !== "sent"
      ? await deliverUserReportAdminNotification(stored, {
        idempotencyKey: `user-report-admin-notification-${stored.id}`,
      })
      : {
        report: stored,
        deliveryStatus: "sent" as const,
        errorCode: null,
      };
    if (notification.deliveryStatus === "failed") {
      telemetry.failure(
        "user-report.admin-notification",
        new Error(notification.errorCode ?? "EMAIL_SEND_FAILED"),
        502,
        { action: "initial", channel: "email" },
      );
    }
    telemetry.success("user-report.save", { action: type, actorRef: telemetry.actorRef(player.id) });
    return Response.json(
      { report: notification.report },
      { status: saved.inserted ? 201 : 200 },
    );
  } catch (error) {
    if (error instanceof Error && error.message === "PLAYER_AUTH_REQUIRED") return Response.json({ error: "Login required" }, { status: 401 });
    if (isPlayerAuthConfigurationError(error)) return Response.json({ error: "Player auth is not configured" }, { status: 503 });
    if (error instanceof Error && error.message === "USER_REPORT_ID_CONFLICT") {
      return Response.json({ error: "Report request conflict" }, { status: 409 });
    }
    telemetry.failure("user-report.save", error, 503, { action: type });
    return Response.json({ error: "Report could not be saved" }, { status: 503 });
  }
}

import { createRequestTelemetry } from "@/lib/observability";
import { rateLimitPolicies, rateLimitResponseFor } from "@/lib/rate-limit";
import {
  listUserReports,
  updateUserReportStatus,
} from "@/lib/user-report-store";
import { isUserReportStatus } from "@/lib/user-report-core";
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

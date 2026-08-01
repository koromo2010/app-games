import { getSdkAccountSession } from "@/lib/account-session";
import {
  createCreatorSupportReport,
  listCreatorSupportReports,
  replyToCreatorSupportReport,
} from "@/lib/support-api";
import {
  SupportTextValidationError,
  supportTextValidationPayload,
  validateSupportReportText,
  validateSupportText,
} from "@/lib/support-text-contract";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const account = await getSdkAccountSession().catch(() => null);
  if (!account) {
    return Response.json({ error: "account_required" }, { status: 401 });
  }
  try {
    return Response.json(
      { reports: await listCreatorSupportReports(account.playerId) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      { error: "support_unavailable" },
      { status: 503 },
    );
  }
}

export async function POST(request: Request) {
  const account = await getSdkAccountSession().catch(() => null);
  if (!account) {
    return Response.json({ error: "account_required" }, { status: 401 });
  }
  const body = await request.json().catch(() => null) as {
    action?: unknown;
    reportId?: unknown;
    requestId?: unknown;
    message?: unknown;
    type?: unknown;
    summary?: unknown;
    details?: unknown;
    page?: unknown;
  } | null;
  if (body?.action === "create-report") {
    const requestId = typeof body.requestId === "string"
      ? body.requestId.trim()
      : "";
    const type = body.type === "bug" || body.type === "request"
      ? body.type
      : null;
    let text;
    try {
      text = validateSupportReportText(body);
    } catch (error) {
      if (error instanceof SupportTextValidationError) {
        return Response.json(supportTextValidationPayload(error), { status: 400 });
      }
      throw error;
    }
    if (!requestId || !type) {
      return Response.json(
        { error: "support_report_invalid" },
        { status: 400 },
      );
    }
    try {
      const report = await createCreatorSupportReport({
        playerId: account.playerId,
        requestId,
        type,
        ...text,
      });
      return Response.json({ report }, { status: 201 });
    } catch {
      return Response.json(
        { error: "support_report_unavailable" },
        { status: 503 },
      );
    }
  }
  const reportId = typeof body?.reportId === "string"
    ? body.reportId.trim()
    : "";
  const requestId = typeof body?.requestId === "string"
    ? body.requestId.trim()
    : "";
  let message;
  try {
    message = validateSupportText(body?.message, "reply", { required: true });
  } catch (error) {
    if (error instanceof SupportTextValidationError) {
      return Response.json(supportTextValidationPayload(error), { status: 400 });
    }
    throw error;
  }
  if (!reportId || !requestId) {
    return Response.json({ error: "support_reply_invalid" }, { status: 400 });
  }
  try {
    const report = await replyToCreatorSupportReport({
      playerId: account.playerId,
      reportId,
      requestId,
      message,
    });
    return Response.json({ report }, { status: 201 });
  } catch (error) {
    if (
      error instanceof Error
      && error.message === "support_thread_not_found"
    ) {
      return Response.json({ error: error.message }, { status: 404 });
    }
    return Response.json(
      { error: "support_reply_unavailable" },
      { status: 503 },
    );
  }
}

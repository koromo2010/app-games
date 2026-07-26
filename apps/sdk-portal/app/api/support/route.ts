import { getSdkAccountSession } from "@/lib/account-session";
import {
  listCreatorSupportReports,
  replyToCreatorSupportReport,
} from "@/lib/support-api";

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
    reportId?: unknown;
    requestId?: unknown;
    message?: unknown;
  } | null;
  const reportId = typeof body?.reportId === "string"
    ? body.reportId.trim()
    : "";
  const requestId = typeof body?.requestId === "string"
    ? body.requestId.trim().slice(0, 120)
    : "";
  const message = typeof body?.message === "string"
    ? body.message.trim().slice(0, 3_000)
    : "";
  if (!reportId || !requestId || !message) {
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

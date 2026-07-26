import { getSdkAccountSession } from "@/lib/account-session";
import {
  approveCreatorSupportDraft,
  loadCreatorSupportDraft,
} from "@/lib/support-api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ draftId: string }> },
) {
  const account = await getSdkAccountSession().catch(() => null);
  if (!account) {
    return Response.json({ error: "account_required" }, { status: 401 });
  }
  const { draftId } = await context.params;
  try {
    return Response.json(
      await loadCreatorSupportDraft(account.playerId, draftId),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (
      error instanceof Error
      && error.message === "support_draft_not_found"
    ) {
      return Response.json({ error: error.message }, { status: 404 });
    }
    return Response.json(
      { error: "support_draft_unavailable" },
      { status: 503 },
    );
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ draftId: string }> },
) {
  const account = await getSdkAccountSession().catch(() => null);
  if (!account) {
    return Response.json({ error: "account_required" }, { status: 401 });
  }
  const { draftId } = await context.params;
  const body = await request.json().catch(() => null) as {
    type?: unknown;
    summary?: unknown;
    details?: unknown;
    page?: unknown;
  } | null;
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
  if (!type || !summary) {
    return Response.json(
      { error: "support_draft_approval_invalid" },
      { status: 400 },
    );
  }
  try {
    const report = await approveCreatorSupportDraft({
      playerId: account.playerId,
      draftId,
      type,
      summary,
      details,
      page,
    });
    return Response.json({ report }, { status: 201 });
  } catch (error) {
    if (
      error instanceof Error
      && error.message === "support_draft_not_found"
    ) {
      return Response.json({ error: error.message }, { status: 404 });
    }
    return Response.json(
      { error: "support_draft_approval_unavailable" },
      { status: 503 },
    );
  }
}

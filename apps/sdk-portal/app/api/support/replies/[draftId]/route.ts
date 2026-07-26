import { getSdkAccountSession } from "@/lib/account-session";
import {
  approveCreatorSupportReplyDraft,
  loadCreatorSupportReplyDraft,
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
      await loadCreatorSupportReplyDraft(account.playerId, draftId),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (
      error instanceof Error
      && error.message === "support_reply_draft_not_found"
    ) {
      return Response.json({ error: error.message }, { status: 404 });
    }
    return Response.json(
      { error: "support_reply_draft_unavailable" },
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
    message?: unknown;
  } | null;
  const message = typeof body?.message === "string"
    ? body.message.trim().slice(0, 3_000)
    : "";
  if (!message) {
    return Response.json(
      { error: "support_reply_draft_approval_invalid" },
      { status: 400 },
    );
  }
  try {
    const report = await approveCreatorSupportReplyDraft({
      playerId: account.playerId,
      replyDraftId: draftId,
      message,
    });
    return Response.json({ report }, { status: 201 });
  } catch (error) {
    if (
      error instanceof Error
      && error.message === "support_reply_draft_not_found"
    ) {
      return Response.json({ error: error.message }, { status: 404 });
    }
    return Response.json(
      { error: "support_reply_draft_approval_unavailable" },
      { status: 503 },
    );
  }
}

import { getSdkAccountSession } from "@/lib/account-session";
import {
  approveCreatorSupportReplyDraft,
  CreatorSupportServiceError,
  loadCreatorSupportReplyDraft,
} from "@/lib/support-api";
import {
  SupportTextValidationError,
  supportTextValidationPayload,
  validateSupportText,
} from "@/lib/support-text-contract";

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
    if (error instanceof CreatorSupportServiceError) {
      return Response.json(
        {
          error: error.code,
          ...(error.errorCode ? { errorCode: error.errorCode } : {}),
        },
        { status: error.status },
      );
    }
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
  let message;
  try {
    message = validateSupportText(body?.message, "reply", { required: true });
  } catch (error) {
    if (error instanceof SupportTextValidationError) {
      return Response.json(supportTextValidationPayload(error), { status: 400 });
    }
    throw error;
  }
  try {
    const report = await approveCreatorSupportReplyDraft({
      playerId: account.playerId,
      replyDraftId: draftId,
      message,
    });
    return Response.json({ report }, { status: 201 });
  } catch (error) {
    if (error instanceof CreatorSupportServiceError) {
      return Response.json(
        {
          error: error.code,
          ...(error.errorCode ? { errorCode: error.errorCode } : {}),
        },
        { status: error.status },
      );
    }
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

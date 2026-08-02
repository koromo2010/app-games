import { getSdkAccountSession } from "@/lib/account-session";
import {
  approveCreatorSupportDraft,
  CreatorSupportServiceError,
  loadCreatorSupportDraft,
} from "@/lib/support-api";
import {
  SupportTextValidationError,
  supportTextValidationPayload,
  validateSupportReportText,
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
      await loadCreatorSupportDraft(account.playerId, draftId),
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
  let text;
  try {
    text = validateSupportReportText(body ?? {});
  } catch (error) {
    if (error instanceof SupportTextValidationError) {
      return Response.json(supportTextValidationPayload(error), { status: 400 });
    }
    throw error;
  }
  if (!type) {
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
      ...text,
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

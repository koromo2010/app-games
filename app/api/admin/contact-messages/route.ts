import { isContactStatus } from "@/lib/contact-core";
import { listContactMessages, updateContactMessageStatus } from "@/lib/contact-store";
import { createRequestTelemetry } from "@/lib/observability";
import { rateLimitPolicies, rateLimitResponseFor } from "@/lib/rate-limit";
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
      { contacts: await listContactMessages() },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return siteAdminAuthorizationError(error)
      ?? Response.json({ error: "CONTACT_MESSAGES_LOAD_FAILED" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const telemetry = createRequestTelemetry(request, "/api/admin/contact-messages", {
    operation: "contact-message-status-update",
  });
  const limited = await rateLimitResponseFor(request, rateLimitPolicies.profileMutation);
  if (limited) return limited;
  try {
    const session = await requireRecentSiteAdminMfa();
    const body = await request.json() as { contactId?: unknown; status?: unknown };
    if (typeof body.contactId !== "string" || !isContactStatus(body.status)) {
      return Response.json({ error: "CONTACT_MESSAGE_STATUS_INVALID" }, { status: 400 });
    }
    const contact = await updateContactMessageStatus(body.contactId, body.status);
    await appendSiteAdminAuditLog(
      request,
      session,
      "contact-message.status-update",
      contact.id,
      null,
      { status: contact.status },
    );
    telemetry.success("contact-message.status", { action: contact.status });
    return Response.json({ contact });
  } catch (error) {
    const auth = siteAdminAuthorizationError(error);
    if (auth) return auth;
    if (error instanceof Error && error.message === "CONTACT_MESSAGE_NOT_FOUND") {
      return Response.json({ error: error.message }, { status: 404 });
    }
    telemetry.failure("contact-message.status", error, 500);
    return Response.json({ error: "CONTACT_MESSAGE_STATUS_SAVE_FAILED" }, { status: 500 });
  }
}

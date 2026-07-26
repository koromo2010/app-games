import { isContactStatus } from "@/lib/contact-core";
import {
  appendContactThreadMessage,
  listContactMessages,
  loadContactMessage,
  updateContactNotificationStatus,
  updateContactMessageStatus,
  updateContactThreadMessageDelivery,
} from "@/lib/contact-store";
import { createContactThreadToken } from "@/lib/contact-thread-access";
import {
  sendOperationsAlertEmail,
  sendSupportReplyEmail,
} from "@/lib/email";
import {
  createRequestTelemetry,
  observabilityErrorCode,
} from "@/lib/observability";
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

export async function POST(request: Request) {
  const telemetry = createRequestTelemetry(
    request,
    "/api/admin/contact-messages",
    { operation: "contact-message-reply" },
  );
  const limited = await rateLimitResponseFor(
    request,
    rateLimitPolicies.profileMutation,
  );
  if (limited) return limited;
  try {
    const session = await requireFullSiteAdminSession();
    const body = await request.json().catch(() => null) as {
      contactId?: unknown;
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
    const status = isContactStatus(body?.status)
      ? body.status
      : "waiting-user";
    if (
      typeof body?.contactId !== "string"
      || !requestId
      || !message
    ) {
      return Response.json(
        { error: "CONTACT_MESSAGE_REPLY_INVALID" },
        { status: 400 },
      );
    }
    const result = await appendContactThreadMessage({
      contactId: body.contactId,
      requestId,
      author: "admin",
      body: message,
      status,
      deliveryStatus: "pending",
    });
    const threadUrl = new URL("/contact/thread", request.url);
    threadUrl.hash = new URLSearchParams({
      id: result.contact.id,
      access: createContactThreadToken(result.contact.id),
    }).toString();
    const deliveryStatus = await sendSupportReplyEmail({
      to: result.contact.email,
      subject: `【Game Fields】お問い合わせへの返信 ${result.contact.id}`,
      body: message,
      threadUrl: threadUrl.toString(),
      idempotencyKey: `contact-reply-${result.message.id}`,
    }).then(() => "sent" as const).catch(() => "failed" as const);
    const contact = await updateContactThreadMessageDelivery(
      result.contact.id,
      result.message.id,
      deliveryStatus,
    );
    await appendSiteAdminAuditLog(
      request,
      session,
      "contact-message.reply",
      contact.id,
      null,
      {
        messageId: result.message.id,
        status: contact.status,
        deliveryStatus,
        inserted: result.inserted,
      },
    );
    telemetry.success("contact-message.reply", {
      action: contact.status,
    });
    return Response.json(
      { contact, deliveryStatus },
      { status: result.inserted ? 201 : 200 },
    );
  } catch (error) {
    const auth = siteAdminAuthorizationError(error);
    if (auth) return auth;
    if (error instanceof Error && error.message === "CONTACT_MESSAGE_NOT_FOUND") {
      return Response.json({ error: error.message }, { status: 404 });
    }
    telemetry.failure("contact-message.reply", error, 500);
    return Response.json(
      { error: "CONTACT_MESSAGE_REPLY_FAILED" },
      { status: 500 },
    );
  }
}

export async function PUT(request: Request) {
  const telemetry = createRequestTelemetry(
    request,
    "/api/admin/contact-messages",
    { operation: "contact-admin-notification-retry" },
  );
  const limited = await rateLimitResponseFor(
    request,
    rateLimitPolicies.profileMutation,
  );
  if (limited) return limited;
  try {
    const session = await requireRecentSiteAdminMfa();
    const body = await request.json().catch(() => null) as {
      contactId?: unknown;
      requestId?: unknown;
    } | null;
    const contactId = typeof body?.contactId === "string"
      ? body.contactId
      : "";
    const requestId = typeof body?.requestId === "string"
      ? body.requestId.trim().slice(0, 120)
      : "";
    if (!contactId || !requestId) {
      return Response.json(
        { error: "CONTACT_NOTIFICATION_RETRY_INVALID" },
        { status: 400 },
      );
    }
    const existing = await loadContactMessage(contactId);
    if (!existing) {
      return Response.json(
        { error: "CONTACT_MESSAGE_NOT_FOUND" },
        { status: 404 },
      );
    }
    const latestRequesterMessage = existing.messages
      .findLast((message) => message.author === "requester");
    const notificationBody = latestRequesterMessage?.body ?? existing.message;
    let deliveryStatus: "sent" | "failed" = "sent";
    let errorCode: string | null = null;
    try {
      await sendOperationsAlertEmail({
        audience: "contacts",
        replyTo: existing.email,
        subject: `【GAME FIELDS】お問い合わせ ${existing.category}`,
        lines: [
          `ID: ${existing.id}`,
          `Name: ${existing.name || "未入力"}`,
          `Email: ${existing.email}`,
          "",
          notificationBody,
        ],
        idempotencyKey: `contact-admin-retry-${existing.id}-${requestId}`,
      });
    } catch (error) {
      deliveryStatus = "failed";
      errorCode = observabilityErrorCode(error);
      telemetry.failure("contact.admin-notification", error, 502, {
        action: "retry",
        channel: "email",
      });
    }
    const contact = await updateContactNotificationStatus(
      existing.id,
      deliveryStatus,
      errorCode,
    );
    await appendSiteAdminAuditLog(
      request,
      session,
      "contact-message.notification-retry",
      contact.id,
      null,
      {
        deliveryStatus,
        errorCode,
      },
    );
    if (deliveryStatus === "sent") {
      telemetry.success("contact.admin-notification", {
        action: "retry",
        channel: "email",
      });
    }
    return Response.json({ contact, deliveryStatus, errorCode });
  } catch (error) {
    const auth = siteAdminAuthorizationError(error);
    if (auth) return auth;
    telemetry.failure("contact.admin-notification", error, 500, {
      action: "retry",
      channel: "email",
    });
    return Response.json(
      { error: "CONTACT_NOTIFICATION_RETRY_FAILED" },
      { status: 500 },
    );
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

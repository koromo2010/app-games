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
  sendSupportAdminNotificationEmail,
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
import {
  SupportTextValidationError,
  supportTextValidationPayload,
  validateSupportText,
} from "@/config/support-text-contract";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const telemetry = createRequestTelemetry(
    request,
    "/api/admin/contact-messages",
    { operation: "contact-message-list" },
  );
  try {
    await requireFullSiteAdminSession();
    const contacts = await listContactMessages();
    telemetry.success("contact-message.list", {
      affectedCount: contacts.length,
    });
    return Response.json(
      { contacts },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const auth = siteAdminAuthorizationError(error);
    if (auth) return auth;
    telemetry.failure("contact-message.list", error, 500);
    return Response.json(
      { error: "CONTACT_MESSAGES_LOAD_FAILED" },
      { status: 500 },
    );
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
      action?: unknown;
      contactId?: unknown;
      messageId?: unknown;
      requestId?: unknown;
      message?: unknown;
      status?: unknown;
    } | null;
    if (body?.action === "retry-email") {
      const contactId = typeof body.contactId === "string"
        ? body.contactId
        : "";
      const messageId = typeof body.messageId === "string"
        ? body.messageId
        : "";
      const retryRequestId = typeof body.requestId === "string"
        ? body.requestId.trim()
        : "";
      if (!contactId || !messageId || !retryRequestId || retryRequestId.length > 120) {
        return Response.json(
          { error: "CONTACT_REPLY_EMAIL_RETRY_INVALID" },
          { status: 400 },
        );
      }
      const existing = await loadContactMessage(contactId);
      const existingMessage = existing?.messages.find(
        (entry) => entry.id === messageId && entry.author === "admin",
      );
      if (!existing || !existingMessage) {
        return Response.json(
          { error: "CONTACT_REPLY_MESSAGE_NOT_FOUND" },
          { status: 404 },
        );
      }
      if (
        existingMessage.deliveryStatus !== "failed"
        && existingMessage.deliveryStatus !== "pending"
      ) {
        return Response.json(
          { error: "CONTACT_REPLY_EMAIL_NOT_RETRYABLE" },
          { status: 409 },
        );
      }
      await updateContactThreadMessageDelivery(
        existing.id,
        existingMessage.id,
        "pending",
      );
      const threadUrl = new URL("/contact/thread", request.url);
      threadUrl.hash = new URLSearchParams({
        id: existing.id,
        access: createContactThreadToken(existing.id),
      }).toString();
      const deliveryStatus = await sendSupportReplyEmail({
        to: existing.email,
        contactId: existing.id,
        body: existingMessage.body,
        threadUrl: threadUrl.toString(),
        idempotencyKey: `contact-reply-${existingMessage.id}`,
      }).then(() => "sent" as const).catch(() => "failed" as const);
      const contact = await updateContactThreadMessageDelivery(
        existing.id,
        existingMessage.id,
        deliveryStatus,
      );
      await appendSiteAdminAuditLog(
        request,
        session,
        "contact-message.reply-email-retry",
        contact.id,
        null,
        {
          messageId: existingMessage.id,
          deliveryStatus,
          retryRequestId,
        },
      );
      telemetry.success("contact-message.reply-email", {
        action: deliveryStatus,
        channel: "email",
      });
      return Response.json({ contact, deliveryStatus });
    }
    const message = validateSupportText(
      body?.message,
      "reply",
      { required: true },
    );
    const requestId = typeof body?.requestId === "string"
      ? body.requestId.trim()
      : "";
    const status = isContactStatus(body?.status)
      ? body.status
      : "waiting-user";
    if (
      typeof body?.contactId !== "string"
      || !requestId
      || requestId.length > 120
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
    let deliveryStatus = result.message.deliveryStatus;
    if (
      result.inserted
      || deliveryStatus === "pending"
      || deliveryStatus === "failed"
    ) {
      deliveryStatus = await sendSupportReplyEmail({
        to: result.contact.email,
        contactId: result.contact.id,
        body: result.message.body,
        threadUrl: threadUrl.toString(),
        idempotencyKey: `contact-reply-${result.message.id}`,
      }).then(() => "sent" as const).catch(() => "failed" as const);
    }
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
    if (error instanceof SupportTextValidationError) {
      return Response.json(supportTextValidationPayload(error), { status: 400 });
    }
    if (error instanceof Error && error.message === "CONTACT_MESSAGE_NOT_FOUND") {
      return Response.json({ error: error.message }, { status: 404 });
    }
    if (
      error instanceof Error
      && error.message === "CONTACT_MESSAGE_REQUEST_ID_CONFLICT"
    ) {
      return Response.json({ error: error.message }, { status: 409 });
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
      ? body.requestId.trim()
      : "";
    if (!contactId || !requestId || requestId.length > 120) {
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
      await sendSupportAdminNotificationEmail({
        reference: {
          kind: "contact",
          id: existing.id,
        },
        title: latestRequesterMessage
          ? "問い合わせへの追記"
          : "新しい問い合わせ",
        replyTo: existing.email,
        lines: [
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

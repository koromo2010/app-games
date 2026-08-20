import { isContactCategory } from "@/lib/contact-core";
import {
  loadContactMessage,
  saveContactMessage,
  updateContactNotificationStatus,
} from "@/lib/contact-store";
import {
  sendContactReceiptEmail,
  sendSupportAdminNotificationEmail,
} from "@/lib/email";
import { createContactThreadToken } from "@/lib/contact-thread-access";
import {
  createRequestTelemetry,
  observabilityErrorCode,
} from "@/lib/observability";
import { getAuthenticatedPlayerId } from "@/lib/player-auth";
import { touchPlayerAccountActivity } from "@/lib/player-account-store";
import { rateLimitPolicies, rateLimitResponseFor } from "@/lib/rate-limit";
import {
  SupportTextValidationError,
  supportTextValidationPayload,
  validateSupportText,
} from "@/config/support-text-contract";

export async function POST(request: Request) {
  const telemetry = createRequestTelemetry(request, "/api/contact", {
    operation: "contact-submit",
  });
  const limited = await rateLimitResponseFor(request, rateLimitPolicies.feedback);
  if (limited) return limited;
  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; } catch { return Response.json({ error: "Invalid request" }, { status: 400 }); }
  const category = isContactCategory(body.category) ? body.category : null;
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim() : "";
  let message;
  try {
    message = validateSupportText(body.message, "reply", { required: true });
  } catch (error) {
    if (error instanceof SupportTextValidationError) {
      return Response.json(supportTextValidationPayload(error), { status: 400 });
    }
    throw error;
  }
  const requestId = typeof body.requestId === "string"
    ? body.requestId.trim().toLowerCase()
    : "";
  if (
    !category
    || !email
    || name.length > 80
    || email.length > 254
    || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      .test(requestId)
  ) return Response.json({ error: "Required fields are missing" }, { status: 400 });
  try {
    const playerId = await getAuthenticatedPlayerId().catch(() => null);
    const saved = await saveContactMessage({
      category,
      name,
      email: email.toLocaleLowerCase("en-US"),
      message,
      playerId,
    }, {
      contactId: `contact_${requestId}`,
    });
    if (playerId) await touchPlayerAccountActivity(playerId).catch(() => undefined);
    const contact = await loadContactMessage(saved.id);
    if (!contact) throw new Error("CONTACT_MESSAGE_SAVE_FAILED");
    const threadUrl = new URL("/contact/thread", request.url);
    threadUrl.hash = new URLSearchParams({
      id: contact.id,
      access: createContactThreadToken(contact.id),
    }).toString();
    const shouldNotify = saved.inserted
      || contact.notificationStatus !== "sent";
    const [notification] = await Promise.all([
      shouldNotify
        ? sendSupportAdminNotificationEmail({
          reference: {
            kind: "contact",
            id: contact.id,
          },
          title: "新しい問い合わせ",
          replyTo: contact.email,
          lines: [
            `Name: ${contact.name || "未入力"}`,
            `Email: ${contact.email}`,
            "",
            contact.message,
          ],
          idempotencyKey: `contact-admin-notification-${contact.id}`,
        }).then(() => ({
          status: "sent" as const,
          errorCode: null,
        })).catch((error) => {
          telemetry.failure("contact.admin-notification", error, 502, {
            action: "initial",
            channel: "email",
          });
          return {
            status: "failed" as const,
            errorCode: observabilityErrorCode(error),
          };
        })
        : Promise.resolve({
          status: "sent" as const,
          errorCode: null,
        }),
      sendContactReceiptEmail({
        to: contact.email,
        contactId: contact.id,
        threadUrl: threadUrl.toString(),
      }).catch((error) => {
        telemetry.failure("contact.requester-receipt", error, 502, {
          action: "initial",
          channel: "email",
        });
      }),
    ]);
    let responseContact = contact;
    if (shouldNotify) {
      responseContact = await updateContactNotificationStatus(
        contact.id,
        notification.status,
        notification.errorCode,
      ).catch((error) => {
        telemetry.failure("contact.notification-status", error, 503, {
          action: notification.status,
        });
        return contact;
      });
    }
    telemetry.success("contact.submit", {
      action: notification.status,
      channel: "email",
    });
    return Response.json(
      { contact: responseContact, thread: { url: threadUrl.toString() } },
      { status: saved.inserted ? 201 : 200 },
    );
  } catch (error) {
    if (
      error instanceof Error
      && error.message === "CONTACT_MESSAGE_ID_CONFLICT"
    ) {
      telemetry.reject("contact.submit", 409, {
        errorCode: "CONTACT_MESSAGE_ID_CONFLICT",
      });
      return Response.json(
        { error: "Contact request conflict" },
        { status: 409 },
      );
    }
    telemetry.failure("contact.submit", error, 503);
    return Response.json(
      { error: "Contact could not be saved" },
      { status: 503 },
    );
  }
}

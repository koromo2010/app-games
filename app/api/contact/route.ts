import { isContactCategory } from "@/lib/contact-core";
import { saveContactMessage, updateContactNotificationStatus } from "@/lib/contact-store";
import {
  sendContactReceiptEmail,
  sendOperationsAlertEmail,
} from "@/lib/email";
import { createContactThreadToken } from "@/lib/contact-thread-access";
import {
  createRequestTelemetry,
  observabilityErrorCode,
} from "@/lib/observability";
import { getAuthenticatedPlayerId } from "@/lib/player-auth";
import { rateLimitPolicies, rateLimitResponseFor } from "@/lib/rate-limit";

const clean = (value: unknown, length: number) => typeof value === "string" ? value.trim().slice(0, length) : "";
export async function POST(request: Request) {
  const telemetry = createRequestTelemetry(request, "/api/contact", {
    operation: "contact-submit",
  });
  const limited = await rateLimitResponseFor(request, rateLimitPolicies.feedback);
  if (limited) return limited;
  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; } catch { return Response.json({ error: "Invalid request" }, { status: 400 }); }
  const category = isContactCategory(body.category) ? body.category : null;
  const name = clean(body.name, 80); const email = clean(body.email, 254); const message = clean(body.message, 3000);
  if (!category || !email || !message || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return Response.json({ error: "Required fields are missing" }, { status: 400 });
  try {
    const playerId = await getAuthenticatedPlayerId().catch(() => null);
    const contact = await saveContactMessage({
      category,
      name,
      email: email.toLocaleLowerCase("en-US"),
      message,
      playerId,
    });
    const threadUrl = new URL("/contact/thread", request.url);
    threadUrl.hash = new URLSearchParams({
      id: contact.id,
      access: createContactThreadToken(contact.id),
    }).toString();
    const [notification] = await Promise.all([
      sendOperationsAlertEmail({
        audience: "contacts",
        replyTo: email,
        subject: `【GAME FIELDS】お問い合わせ ${category}`,
        lines: [`ID: ${contact.id}`, `Name: ${name || "未入力"}`, `Email: ${email}`, "", message],
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
      }),
      sendContactReceiptEmail({
        to: email,
        contactId: contact.id,
        threadUrl: threadUrl.toString(),
      }).catch((error) => {
        telemetry.failure("contact.requester-receipt", error, 502, {
          action: "initial",
          channel: "email",
        });
      }),
    ]);
    await updateContactNotificationStatus(
      contact.id,
      notification.status,
      notification.errorCode,
    ).catch((error) => {
      telemetry.failure("contact.notification-status", error, 503, {
        action: notification.status,
      });
    });
    telemetry.success("contact.submit", {
      action: notification.status,
      channel: "email",
    });
    return Response.json(
      { contact, thread: { url: threadUrl.toString() } },
      { status: 201 },
    );
  } catch (error) {
    telemetry.failure("contact.submit", error, 503);
    return Response.json(
      { error: "Contact could not be saved" },
      { status: 503 },
    );
  }
}

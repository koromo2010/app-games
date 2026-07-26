import {
  appendContactThreadMessage,
  loadContactMessage,
  updateContactNotificationStatus,
} from "@/lib/contact-store";
import { verifyContactThreadToken } from "@/lib/contact-thread-access";
import { sendOperationsAlertEmail } from "@/lib/email";
import {
  createRequestTelemetry,
  observabilityErrorCode,
} from "@/lib/observability";
import { rateLimitPolicies, rateLimitResponseFor } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function publicContact(
  contact: NonNullable<Awaited<ReturnType<typeof loadContactMessage>>>,
) {
  return {
    id: contact.id,
    category: contact.category,
    name: contact.name,
    email: contact.email,
    message: contact.message,
    status: contact.status,
    messages: contact.messages,
    createdAt: contact.createdAt,
    updatedAt: contact.updatedAt,
  };
}

async function authorizedContact(request: Request, body?: {
  contactId?: unknown;
  accessToken?: unknown;
}) {
  const url = new URL(request.url);
  const contactId = typeof body?.contactId === "string"
    ? body.contactId
    : url.searchParams.get("id") ?? "";
  const accessToken = typeof body?.accessToken === "string"
    ? body.accessToken
    : request.headers.get("x-game-fields-contact-access")
      ?? url.searchParams.get("access")
      ?? "";
  if (!verifyContactThreadToken(contactId, accessToken)) return null;
  return loadContactMessage(contactId);
}

export async function GET(request: Request) {
  try {
    const contact = await authorizedContact(request);
    if (!contact) {
      return Response.json(
        { error: "CONTACT_THREAD_NOT_FOUND" },
        { status: 404 },
      );
    }
    return Response.json(
      { contact: publicContact(contact) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      { error: "CONTACT_THREAD_LOAD_FAILED" },
      { status: 503 },
    );
  }
}

export async function POST(request: Request) {
  const telemetry = createRequestTelemetry(request, "/api/contact-thread", {
    operation: "contact-thread-reply",
  });
  const limited = await rateLimitResponseFor(
    request,
    rateLimitPolicies.feedback,
  );
  if (limited) return limited;
  const body = await request.json().catch(() => null) as {
    contactId?: unknown;
    accessToken?: unknown;
    requestId?: unknown;
    message?: unknown;
  } | null;
  const message = typeof body?.message === "string"
    ? body.message.trim().slice(0, 3_000)
    : "";
  const requestId = typeof body?.requestId === "string"
    ? body.requestId.trim().slice(0, 120)
    : "";
  if (!message || !requestId) {
    return Response.json(
      { error: "CONTACT_THREAD_REPLY_INVALID" },
      { status: 400 },
    );
  }
  try {
    const contact = await authorizedContact(request, body ?? undefined);
    if (!contact) {
      return Response.json(
        { error: "CONTACT_THREAD_NOT_FOUND" },
        { status: 404 },
      );
    }
    const result = await appendContactThreadMessage({
      contactId: contact.id,
      requestId,
      author: "requester",
      body: message,
      status: "open",
    });
    if (result.inserted) {
      let notificationStatus: "sent" | "failed" = "sent";
      let notificationErrorCode: string | null = null;
      try {
        await sendOperationsAlertEmail({
          audience: "contacts",
          replyTo: contact.email,
          subject: `【GAME FIELDS】お問い合わせ追記 ${contact.id}`,
          lines: [
            `ID: ${contact.id}`,
            `Email: ${contact.email}`,
            "",
            message,
          ],
          idempotencyKey: `contact-admin-followup-${result.message.id}`,
        });
      } catch (error) {
        notificationStatus = "failed";
        notificationErrorCode = observabilityErrorCode(error);
        telemetry.failure("contact.admin-notification", error, 502, {
          action: "requester-followup",
          channel: "email",
        });
      }
      await updateContactNotificationStatus(
        contact.id,
        notificationStatus,
        notificationErrorCode,
      ).catch((error) => {
        telemetry.failure("contact.notification-status", error, 503, {
          action: notificationStatus,
        });
      });
    }
    telemetry.success("contact.thread-reply", {
      action: result.inserted ? "inserted" : "duplicate",
    });
    return Response.json(
      { contact: publicContact(result.contact) },
      { status: result.inserted ? 201 : 200 },
    );
  } catch (error) {
    telemetry.failure("contact.thread-reply", error, 503);
    return Response.json(
      { error: "CONTACT_THREAD_REPLY_FAILED" },
      { status: 503 },
    );
  }
}

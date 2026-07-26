import {
  appendContactThreadMessage,
  loadContactMessage,
} from "@/lib/contact-store";
import { verifyContactThreadToken } from "@/lib/contact-thread-access";
import { sendOperationsAlertEmail } from "@/lib/email";
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
      }).catch(() => undefined);
    }
    return Response.json(
      { contact: publicContact(result.contact) },
      { status: result.inserted ? 201 : 200 },
    );
  } catch {
    return Response.json(
      { error: "CONTACT_THREAD_REPLY_FAILED" },
      { status: 503 },
    );
  }
}

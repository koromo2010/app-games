import { isContactCategory } from "@/lib/contact-core";
import { saveContactMessage, updateContactNotificationStatus } from "@/lib/contact-store";
import {
  sendContactReceiptEmail,
  sendOperationsAlertEmail,
} from "@/lib/email";
import { createContactThreadToken } from "@/lib/contact-thread-access";
import { getAuthenticatedPlayerId } from "@/lib/player-auth";
import { rateLimitPolicies, rateLimitResponseFor } from "@/lib/rate-limit";

const clean = (value: unknown, length: number) => typeof value === "string" ? value.trim().slice(0, length) : "";
export async function POST(request: Request) {
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
    const [notificationStatus] = await Promise.all([
      sendOperationsAlertEmail({
        audience: "contacts",
        replyTo: email,
        subject: `【GAME FIELDS】お問い合わせ ${category}`,
        lines: [`ID: ${contact.id}`, `Name: ${name || "未入力"}`, `Email: ${email}`, "", message],
      }).then(() => "sent" as const).catch(() => "failed" as const),
      sendContactReceiptEmail({
        to: email,
        contactId: contact.id,
        threadUrl: threadUrl.toString(),
      }).catch(() => undefined),
    ]);
    await updateContactNotificationStatus(contact.id, notificationStatus).catch(() => undefined);
    return Response.json(
      { contact, thread: { url: threadUrl.toString() } },
      { status: 201 },
    );
  } catch { return Response.json({ error: "Contact could not be saved" }, { status: 503 }); }
}

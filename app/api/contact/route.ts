import { saveContactMessage, type ContactCategory } from "@/lib/contact-store";
import { sendOperationsAlertEmail } from "@/lib/email";
import { createRequestTelemetry } from "@/lib/observability";
import { rateLimitPolicies, rateLimitResponseFor } from "@/lib/rate-limit";

const clean = (value: unknown, length: number) => typeof value === "string" ? value.trim().slice(0, length) : "";
export async function POST(request: Request) {
  const telemetry = createRequestTelemetry(request, "/api/contact", {
    operation: "create",
  });
  const limited = await rateLimitResponseFor(request, rateLimitPolicies.feedback);
  if (limited) return limited;
  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; } catch { return Response.json({ error: "Invalid request" }, { status: 400 }); }
  const category: ContactCategory | null = ["general", "privacy", "account", "bug"].includes(String(body.category)) ? body.category as ContactCategory : null;
  const name = clean(body.name, 80); const email = clean(body.email, 254); const message = clean(body.message, 3000);
  if (!category || !email || !message || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return Response.json({ error: "Required fields are missing" }, { status: 400 });
  try {
    const contact = await saveContactMessage({ category, name, email: email.toLocaleLowerCase("en-US"), message });
    try {
      await sendOperationsAlertEmail({
        audience: "contacts",
        replyTo: email,
        subject: `【GAME FIELDS】お問い合わせ ${category}`,
        lines: [`ID: ${contact.id}`, `Name: ${name || "未入力"}`, `Email: ${email}`, "", message],
      });
      telemetry.success("contact.notification", { action: "send" });
    } catch (error) {
      telemetry.failure(
        "contact.notification",
        error,
        503,
        { action: "send" },
      );
    }
    telemetry.success("contact.create", { action: "save" });
    return Response.json({ contact }, { status: 201 });
  } catch (error) {
    telemetry.failure("contact.create", error, 503, { action: "save" });
    return Response.json({ error: "Contact could not be saved" }, { status: 503 });
  }
}

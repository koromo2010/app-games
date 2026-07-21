import { finalizeInstanceSlug, normalizeInstanceSlug, validateInstanceSlug } from "@/lib/instance-registry";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { slug?: unknown; reservationToken?: unknown } | null;
  const slug = normalizeInstanceSlug(typeof body?.slug === "string" ? body.slug : "");
  const error = validateInstanceSlug(slug);
  if (error || typeof body?.reservationToken !== "string") return Response.json({ finalized: false, error: error ?? "予約トークンが必要です。" }, { status: 400 });
  try {
    const result = await finalizeInstanceSlug(slug, body.reservationToken);
    if (!result) return Response.json({ finalized: false, error: "予約が期限切れか、すでに確定されています。" }, { status: 409 });
    return Response.json({ finalized: true, ...result }, { status: 201 });
  } catch {
    return Response.json({ finalized: false, error: "制作者URLを現在確定できません。" }, { status: 503 });
  }
}

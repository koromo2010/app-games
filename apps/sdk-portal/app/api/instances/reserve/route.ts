import { normalizeInstanceSlug, reserveInstanceSlug, validateInstanceSlug } from "@/lib/instance-registry";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { slug?: unknown; displayName?: unknown } | null;
  const slug = normalizeInstanceSlug(typeof body?.slug === "string" ? body.slug : "");
  const error = validateInstanceSlug(slug);
  if (error) return Response.json({ slug, reserved: false, error }, { status: 400 });
  const displayName = typeof body?.displayName === "string" && body.displayName.trim() ? body.displayName.trim() : slug;
  try {
    const reservation = await reserveInstanceSlug(slug, displayName);
    if (!reservation) return Response.json({ slug, reserved: false, error: "このURL名はすでに使われています。" }, { status: 409 });
    return Response.json({ reserved: true, ...reservation }, { status: 201 });
  } catch { return Response.json({ slug, reserved: false, error: "URL名の予約サービスを現在利用できません。" }, { status: 503 }); }
}

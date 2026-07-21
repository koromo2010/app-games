import { instanceSlugAvailable, normalizeInstanceSlug, validateInstanceSlug } from "@/lib/instance-registry";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const requested = new URL(request.url).searchParams.get("slug") ?? "";
  const slug = normalizeInstanceSlug(requested);
  const error = validateInstanceSlug(slug);
  if (error) return Response.json({ slug, available: false, error }, { status: 400 });
  try { return Response.json({ slug, available: await instanceSlugAvailable(slug) }); }
  catch { return Response.json({ slug, available: false, error: "URL名の確認サービスを現在利用できません。" }, { status: 503 }); }
}

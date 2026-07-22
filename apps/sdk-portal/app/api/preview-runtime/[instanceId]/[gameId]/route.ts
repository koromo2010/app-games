import { getCreatorGamePreview, normalizeInstanceSlug, validateInstanceSlug } from "@/lib/instance-registry";
import { createPreviewRuntimeUrl } from "@/lib/preview-links";

export const dynamic = "force-dynamic";
const GAME_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,62}[a-z0-9])?$/;

export async function GET(_: Request, { params }: { params: Promise<{ instanceId: string; gameId: string }> }) {
  const raw = await params;
  const instanceId = normalizeInstanceSlug(raw.instanceId);
  const gameId = raw.gameId.trim().toLowerCase();
  if (validateInstanceSlug(instanceId) || !GAME_PATTERN.test(gameId)) return Response.json({ error: "not_found" }, { status: 404 });
  const game = await getCreatorGamePreview(instanceId, gameId).catch(() => null);
  if (!game) return Response.json({ error: "not_found" }, { status: 404 });
  try {
    return Response.json({ title: game.title, runtimeUrl: createPreviewRuntimeUrl({ instanceId, gameId, revision: game.mockRevision }) }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "preview_unavailable" }, { status: 503 });
  }
}

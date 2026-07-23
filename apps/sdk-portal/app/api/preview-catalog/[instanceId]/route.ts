import { listCreatorGames, normalizeInstanceSlug, validateInstanceSlug } from "@/lib/instance-registry";

export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: { params: Promise<{ instanceId: string }> }) {
  const raw = await params;
  const instanceId = normalizeInstanceSlug(raw.instanceId);
  if (validateInstanceSlug(instanceId)) return Response.json({ error: "not_found" }, { status: 404 });
  try {
    const games = await listCreatorGames(instanceId);
    return Response.json({ creatorSlug: instanceId, games: games.map((game) => ({
      id: game.gameId,
      title: game.title,
      description: game.description,
      moduleProfile: game.modulePolicy,
    })) }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "not_found" }, { status: 404 });
  }
}

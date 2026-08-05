import { getSdkAccountSession } from "@/lib/account-session";
import { prepareOwnedGamePackageExport } from "@/lib/owned-game-package-export";
import { listOwnedGamePackageRevisions, normalizeInstanceSlug, validateInstanceSlug } from "@/lib/instance-registry";
import { createGamePackageRuntimeReader } from "@/lib/mock-git-store";

const GAME = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;
const REVISION = /^[a-f0-9]{40}$/;

export async function GET(_request: Request, context: { params: Promise<{ instanceId: string; gameId: string; revision: string }> }) {
  const raw = await context.params;
  const creatorSlug = normalizeInstanceSlug(raw.instanceId);
  const gameId = raw.gameId.trim().toLowerCase();
  const revision = raw.revision.trim().toLowerCase();
  if (validateInstanceSlug(creatorSlug) || !GAME.test(gameId) || !REVISION.test(revision)) return new Response("Not found", { status: 404 });
  const session = await getSdkAccountSession();
  const result = await prepareOwnedGamePackageExport(
    { ownerPlayerId: session?.playerId ?? null, creatorSlug, gameId, revision },
    { listRevisions: listOwnedGamePackageRevisions, reader: createGamePackageRuntimeReader() },
  );
  if (result.status === "unauthenticated") return new Response("Authentication required", { status: 401, headers: { "Cache-Control": "private, no-store" } });
  if (result.status === "not_found") return new Response("Not found", { status: 404, headers: { "Cache-Control": "private, no-store" } });
  if (result.status === "unavailable") return new Response("Runtime package is unavailable or failed integrity checks", { status: 422, headers: { "Cache-Control": "private, no-store" } });
  return new Response(new Uint8Array(result.archive), { headers: {
      "Cache-Control": "private, no-store", "Content-Type": "application/zip", "X-Content-Type-Options": "nosniff",
      "Content-Disposition": `attachment; filename="${result.filename}"`,
    } });
}

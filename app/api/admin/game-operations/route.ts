import { revalidatePath } from "next/cache";
import { validateGameOperationsInput } from "@/lib/game-operations";
import { loadGameOperations } from "@/lib/game-operations-store";
import { saveGameOperations } from "@/lib/game-operations-write-store";
import { createRequestTelemetry } from "@/lib/observability";
import { rateLimitPolicies, rateLimitResponseFor } from "@/lib/rate-limit";
import { requireFullSiteAdminSession, requireRecentSiteAdminMfa, siteAdminAuthorizationError } from "@/lib/site-admin-auth";
import { appendSiteAdminAuditLog } from "@/lib/site-admin-passkey-store";
import { loadApprovedGameSdkCatalog } from "@/lib/game-sdk-runtime-catalog";
import registry from "@/config/game-registry.json";

export const dynamic = "force-dynamic";

async function sdkGames() {
  return loadApprovedGameSdkCatalog();
}

function authError(error: unknown) {
  return siteAdminAuthorizationError(error);
}

export async function GET() {
  try {
    await requireFullSiteAdminSession();
    const games = await sdkGames();
    const operations = await loadGameOperations({ fresh: true }, games);
    const activeIds = new Set([
      ...registry.map((game) => game.id),
      ...games.map((game) => game.id),
    ]);
    return Response.json({
      operations: operations.filter((operation) => activeIds.has(operation.gameId)),
      games: games.map((game) => ({ id: game.id, title: game.title, private: false })),
    });
  } catch (error) {
    return authError(error) ?? Response.json({ error: "GAME_OPERATIONS_LOAD_FAILED" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const telemetry = createRequestTelemetry(request, "/api/admin/game-operations", { operation: "game-operations-update" });
  const limited = await rateLimitResponseFor(request, rateLimitPolicies.profileMutation);
  if (limited) return limited;
  try {
    const session = await requireRecentSiteAdminMfa();
    const body = await request.json() as { operations?: unknown };
    const games = await sdkGames();
    const validationError = validateGameOperationsInput(body.operations, games);
    if (validationError) return Response.json({ error: validationError }, { status: 400 });
    const before = await loadGameOperations({ fresh: true }, games);
    const operations = await saveGameOperations(
      body.operations as Parameters<typeof saveGameOperations>[0],
      games,
    );
    revalidatePath("/");
    revalidatePath("/games");
    await appendSiteAdminAuditLog(request, session, "game-operations.update", "game-operations", before, operations);
    telemetry.success("site.game-operations", { action: "update", affectedCount: operations.length });
    return Response.json({ operations });
  } catch (error) {
    const response = authError(error);
    if (response) return response;
    telemetry.failure("site.game-operations", error, 500, { action: "update" });
    return Response.json({ error: "GAME_OPERATIONS_SAVE_FAILED" }, { status: 500 });
  }
}

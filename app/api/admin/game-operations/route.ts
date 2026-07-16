import { revalidatePath } from "next/cache";
import { validateGameOperationsInput } from "@/lib/game-operations";
import { loadGameOperations, saveGameOperations } from "@/lib/game-operations-store";
import { createRequestTelemetry } from "@/lib/observability";
import { rateLimitPolicies, rateLimitResponseFor } from "@/lib/rate-limit";
import { isSiteAdminConfigurationError, requireSiteAdminSession } from "@/lib/site-admin-auth";

export const dynamic = "force-dynamic";

function authError(error: unknown) {
  if (error instanceof Error && error.message === "SITE_ADMIN_AUTH_REQUIRED") return Response.json({ error: "ADMIN_AUTH_REQUIRED" }, { status: 401 });
  if (isSiteAdminConfigurationError(error)) return Response.json({ error: "SITE_ADMIN_PASSWORD_NOT_CONFIGURED" }, { status: 503 });
  return null;
}

export async function GET() {
  try {
    await requireSiteAdminSession();
    return Response.json({ operations: await loadGameOperations({ fresh: true }) });
  } catch (error) {
    return authError(error) ?? Response.json({ error: "GAME_OPERATIONS_LOAD_FAILED" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const telemetry = createRequestTelemetry(request, "/api/admin/game-operations", { operation: "game-operations-update" });
  const limited = await rateLimitResponseFor(request, rateLimitPolicies.profileMutation);
  if (limited) return limited;
  try {
    await requireSiteAdminSession();
    const body = await request.json() as { operations?: unknown };
    const validationError = validateGameOperationsInput(body.operations);
    if (validationError) return Response.json({ error: validationError }, { status: 400 });
    const operations = await saveGameOperations(body.operations as Parameters<typeof saveGameOperations>[0]);
    revalidatePath("/");
    revalidatePath("/games");
    telemetry.success("site.game-operations", { action: "update", affectedCount: operations.length });
    return Response.json({ operations });
  } catch (error) {
    const response = authError(error);
    if (response) return response;
    telemetry.failure("site.game-operations", error, 500, { action: "update" });
    return Response.json({ error: "GAME_OPERATIONS_SAVE_FAILED" }, { status: 500 });
  }
}

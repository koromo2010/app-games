import { createRequestTelemetry } from "@/lib/observability";
import {
  grantPlayerDebugAccess,
  listPlayerDebugAccessCandidates,
  revokePlayerDebugAccess,
} from "@/lib/player-debug-access-admin-store";
import { rateLimitPolicies, rateLimitResponseFor } from "@/lib/rate-limit";
import { requireRecentSiteAdminMfa, requireSiteAdminSession, siteAdminAuthorizationError } from "@/lib/site-admin-auth";
import { appendSiteAdminAuditLog } from "@/lib/site-admin-passkey-store";

export const runtime = "nodejs";

function errorResponse(error: unknown) {
  const auth = siteAdminAuthorizationError(error);
  if (auth) return auth;
  if (!(error instanceof Error)) return null;
  if (error.message === "PLAYER_DEBUG_ACCESS_STORE_NOT_CONFIGURED") return Response.json({ error: error.message }, { status: 503 });
  if (error.message === "PLAYER_DEBUG_ACCESS_INVALID_PLAYER_ID") return Response.json({ error: error.message }, { status: 400 });
  if (error.message === "PLAYER_DEBUG_ACCESS_PLAYER_NOT_FOUND") return Response.json({ error: error.message }, { status: 404 });
  return null;
}

export async function GET(request: Request) {
  try {
    await requireSiteAdminSession();
    const search = new URL(request.url).searchParams.get("q") ?? "";
    return Response.json({ players: await listPlayerDebugAccessCandidates(search) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error) ?? Response.json({ error: "PLAYER_DEBUG_ACCESS_LOAD_FAILED" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const telemetry = createRequestTelemetry(request, "/api/admin/debug-access", { operation: "player-debug-access-grant" });
  const limited = await rateLimitResponseFor(request, rateLimitPolicies.profileMutation);
  if (limited) return limited;
  try {
    const session = await requireRecentSiteAdminMfa();
    const body = await request.json() as { playerId?: unknown; search?: unknown };
    const playerId = typeof body.playerId === "string" ? body.playerId : "";
    await grantPlayerDebugAccess(playerId, session.email);
    await appendSiteAdminAuditLog(request, session, "player-debug-access.grant", playerId, null, { granted: true });
    telemetry.success("auth.access", { action: "player-debug-access-grant" });
    const search = typeof body.search === "string" ? body.search : "";
    return Response.json({ players: await listPlayerDebugAccessCandidates(search) });
  } catch (error) {
    const response = errorResponse(error);
    if (response) return response;
    telemetry.failure("auth.access", error, 500, { action: "player-debug-access-grant" });
    return Response.json({ error: "PLAYER_DEBUG_ACCESS_GRANT_FAILED" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const telemetry = createRequestTelemetry(request, "/api/admin/debug-access", { operation: "player-debug-access-revoke" });
  const limited = await rateLimitResponseFor(request, rateLimitPolicies.profileMutation);
  if (limited) return limited;
  try {
    const session = await requireRecentSiteAdminMfa();
    const body = await request.json() as { playerId?: unknown; search?: unknown };
    const playerId = typeof body.playerId === "string" ? body.playerId : "";
    const revoked = await revokePlayerDebugAccess(playerId);
    await appendSiteAdminAuditLog(request, session, "player-debug-access.revoke", playerId, { granted: revoked }, { granted: false });
    telemetry.success("auth.access", { action: "player-debug-access-revoke" });
    const search = typeof body.search === "string" ? body.search : "";
    return Response.json({ players: await listPlayerDebugAccessCandidates(search) });
  } catch (error) {
    const response = errorResponse(error);
    if (response) return response;
    telemetry.failure("auth.access", error, 500, { action: "player-debug-access-revoke" });
    return Response.json({ error: "PLAYER_DEBUG_ACCESS_REVOKE_FAILED" }, { status: 500 });
  }
}

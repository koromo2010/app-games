import { requireSdkServiceRequest } from "@/lib/sdk-service-auth";
import { loadPostgresPlayerAccountByPlayerId } from "@/lib/player-account-postgres-store";
import { sdkSupportEnvironment } from "@/lib/storage-environment-guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const headers = { "Cache-Control": "private, no-store" };

export async function POST(request: Request) {
  const environment = sdkSupportEnvironment();
  try {
    requireSdkServiceRequest(request, { expectedEnvironment: environment });
  } catch {
    return Response.json({ error: "forbidden" }, { status: 403, headers });
  }
  const body = await request.json().catch(() => null) as {
    playerId?: unknown;
  } | null;
  const playerId = typeof body?.playerId === "string"
    ? body.playerId.trim()
    : "";
  if (!playerId || playerId.length > 120) {
    return Response.json(
      { error: "PRINCIPAL_DIAGNOSTIC_INPUT_INVALID" },
      { status: 400, headers },
    );
  }
  try {
    const account = await loadPostgresPlayerAccountByPlayerId(playerId);
    return Response.json({
      principalValidity: account?.playerId === playerId ? "active" : "missing",
    }, { headers });
  } catch {
    return Response.json(
      { error: "PRINCIPAL_DIAGNOSTIC_UNAVAILABLE" },
      { status: 503, headers },
    );
  }
}

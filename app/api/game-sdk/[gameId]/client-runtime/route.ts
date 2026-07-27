import { approvedGameSdkRegistration } from "@/lib/game-sdk-server-registry";
import {
  loadApprovedGameSdkRuntimeRegistration,
} from "@/lib/game-sdk-runtime-catalog";
import { requireAuthenticatedPlayer } from "@/lib/player-auth";
import { rateLimitPolicies, rateLimitResponseFor } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ gameId: string }>;
};

function unavailable(status = 404) {
  return Response.json(
    { error: "GAME_SDK_NOT_AVAILABLE" },
    {
      status,
      headers: { "Cache-Control": "private, no-store" },
    },
  );
}

export async function GET(request: Request, context: RouteContext) {
  const { gameId: rawGameId } = await context.params;
  const gameId = rawGameId.trim().toLowerCase();
  const revision = new URL(request.url).searchParams.get("revision") ?? "";
  if (
    !/^[a-z][a-z0-9-]{1,63}$/.test(gameId)
    || !/^[a-f0-9]{40}$/.test(revision)
  ) {
    return unavailable(400);
  }

  let player;
  try {
    player = await requireAuthenticatedPlayer();
  } catch {
    return unavailable(401);
  }
  const limited = await rateLimitResponseFor(
    request,
    rateLimitPolicies.sdkRuntimeRead,
    { playerId: player.id },
  );
  if (limited) return limited;

  const registration = approvedGameSdkRegistration(gameId)
    ?? await loadApprovedGameSdkRuntimeRegistration(
      gameId,
      process.env,
      revision,
    ).catch(() => null);
  if (
    !registration
    || registration.clientKind !== "iframe-package"
    || !registration.clientRuntimeUrl
    || registration.revision !== revision
  ) {
    return unavailable();
  }

  return new Response(null, {
    status: 307,
    headers: {
      "Cache-Control": "private, no-store",
      Location: registration.clientRuntimeUrl,
      "Referrer-Policy": "no-referrer",
    },
  });
}

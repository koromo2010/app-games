import { rateLimitPolicies, rateLimitResponseFor } from "@/lib/rate-limit";
import {
  requireSdkPreviewAuthenticatedPlayer,
} from "@/lib/sdk-preview-account-session";
import {
  loadSdkPreviewRuntimeDefinition,
} from "@/lib/sdk-preview-runtime-source";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ creatorSlug: string; gameId: string }>;
};

function unavailable(status = 404) {
  return Response.json(
    { error: "SDK_PREVIEW_PACKAGE_NOT_AVAILABLE" },
    {
      status,
      headers: { "Cache-Control": "private, no-store" },
    },
  );
}

export async function GET(request: Request, context: RouteContext) {
  const { creatorSlug, gameId } = await context.params;
  const revision = new URL(request.url).searchParams.get("revision") ?? "";
  if (!/^[a-f0-9]{40}$/.test(revision)) return unavailable(400);

  let player;
  try {
    player = await requireSdkPreviewAuthenticatedPlayer(creatorSlug);
  } catch {
    return unavailable(401);
  }
  const limited = await rateLimitResponseFor(
    request,
    rateLimitPolicies.sdkRuntimeRead,
    {
      playerId: player.id,
      creatorId: creatorSlug,
      packageId: `${creatorSlug}/${gameId}`,
      environment: "candidate-preview",
    },
  );
  if (limited) return limited;

  const definition = await loadSdkPreviewRuntimeDefinition(
    creatorSlug,
    gameId,
    fetch,
    process.env,
    revision,
  ).catch(() => null);
  if (
    !definition
    || definition.runtimeKind !== "package"
    || definition.revision !== revision
  ) {
    return unavailable();
  }

  return new Response(null, {
    status: 307,
    headers: {
      "Cache-Control": "private, no-store",
      Location: definition.runtimeUrl,
      "Referrer-Policy": "no-referrer",
    },
  });
}

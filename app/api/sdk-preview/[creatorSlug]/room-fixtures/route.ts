import { cookies } from "next/headers";
import {
  createDevelopmentRoomFixtureOperator,
} from "@/lib/development-room-fixture-runtime";
import {
  defaultDevelopmentRoomFixtureRouteGate,
  handleDevelopmentRoomFixtureRoute,
} from "@/lib/development-room-fixture-route";
import {
  authenticatedPlayerIdFromCookieStore,
} from "@/lib/player-auth-token";
import { checkSdkCreatorOwnership } from "@/lib/sdk-dashboard-ownership";
import {
  getSdkPreviewAccountPlayerId,
} from "@/lib/sdk-preview-account-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const dependencies = {
  environmentAvailable: defaultDevelopmentRoomFixtureRouteGate,
  authenticate: async (creatorSlug: string) => (
    await getSdkPreviewAccountPlayerId(creatorSlug)
    ?? authenticatedPlayerIdFromCookieStore(await cookies())
  ),
  ownsCreator: async (creatorSlug: string, playerId: string) => (
    checkSdkCreatorOwnership({ creatorSlug, playerId })
  ),
  createOperator: (playerId: string) => createDevelopmentRoomFixtureOperator({ playerId }),
};

type Context = { params: Promise<{ creatorSlug: string }> };

async function route(request: Request, context: Context, method: "GET" | "POST" | "DELETE") {
  const { creatorSlug } = await context.params;
  return handleDevelopmentRoomFixtureRoute({
    request,
    creatorSlug,
    method,
    dependencies,
  });
}

export async function GET(request: Request, context: Context) {
  return route(request, context, "GET");
}

export async function POST(request: Request, context: Context) {
  return route(request, context, "POST");
}

export async function DELETE(request: Request, context: Context) {
  return route(request, context, "DELETE");
}

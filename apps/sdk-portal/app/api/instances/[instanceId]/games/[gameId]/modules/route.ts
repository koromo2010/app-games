import { getSdkAccountPlayerId } from "@/lib/account-session";
import {
  authenticateCreatorOwner,
  getCreatorGameModuleProfile,
  normalizeInstanceSlug,
  updateCreatorGameModuleProfile,
  validateInstanceSlug,
} from "@/lib/instance-registry";
import { getCreatorModuleCustomizationAccess } from "@/lib/module-customization-access";
import { classifyCreatorGameModules } from "@/lib/module-profile-classification";
import {
  GAME_SDK_MODULE_CATALOG,
  requiredGameSdkModuleIds,
} from "@game-fields/game-sdk/modules";

export const dynamic = "force-dynamic";

const GAME_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,62}[a-z0-9])?$/;

async function requestIdentity(
  context: {
    params: Promise<{ instanceId: string; gameId: string }>;
  },
) {
  const raw = await context.params;
  const slug = normalizeInstanceSlug(raw.instanceId);
  const gameId = raw.gameId.trim().toLowerCase();
  if (validateInstanceSlug(slug) || !GAME_PATTERN.test(gameId)) return null;
  const playerId = await getSdkAccountPlayerId();
  if (!playerId) return { slug, gameId, playerId: null, owner: false };
  const creator = await authenticateCreatorOwner(slug, playerId);
  return {
    slug,
    gameId,
    playerId,
    owner: Boolean(creator),
  };
}

export async function GET(
  _: Request,
  context: {
    params: Promise<{ instanceId: string; gameId: string }>;
  },
) {
  const identity = await requestIdentity(context);
  if (!identity) {
    return Response.json(
      { error: "not_found" },
      { status: 404 },
    );
  }
  if (!identity.playerId) {
    return Response.json(
      { error: "login_required" },
      { status: 401 },
    );
  }
  if (!identity.owner) {
    return Response.json(
      { error: "owner_required" },
      { status: 403 },
    );
  }
  const moduleProfile = await getCreatorGameModuleProfile(
    identity.slug,
    identity.gameId,
  );
  if (!moduleProfile) {
    return Response.json(
      { error: "not_found" },
      { status: 404 },
    );
  }
  return Response.json({
    moduleProfile,
    catalog: GAME_SDK_MODULE_CATALOG,
    requiredModuleIds: requiredGameSdkModuleIds(moduleProfile),
    classification: classifyCreatorGameModules(moduleProfile),
    canCustomize: (
      await getCreatorModuleCustomizationAccess({
        creatorSlug: identity.slug,
        ownerPlayerId: identity.playerId,
      })
    ).allowed,
    editableByAi: false,
  });
}

export async function PATCH(
  request: Request,
  context: {
    params: Promise<{ instanceId: string; gameId: string }>;
  },
) {
  const identity = await requestIdentity(context);
  if (!identity) {
    return Response.json(
      { saved: false, error: "not_found" },
      { status: 404 },
    );
  }
  if (!identity.playerId) {
    return Response.json(
      { saved: false, error: "login_required" },
      { status: 401 },
    );
  }
  if (!identity.owner) {
    return Response.json(
      { saved: false, error: "owner_required" },
      { status: 403 },
    );
  }
  const customizationAccess = await getCreatorModuleCustomizationAccess({
    creatorSlug: identity.slug,
    ownerPlayerId: identity.playerId,
  });
  if (!customizationAccess.allowed) {
    return Response.json(
      { saved: false, error: "customization_not_available" },
      { status: 402 },
    );
  }
  const body = await request.json().catch(() => null) as {
    updates?: unknown;
  } | null;
  try {
    const moduleProfile = await updateCreatorGameModuleProfile({
      slug: identity.slug,
      gameId: identity.gameId,
      ownerPlayerId: identity.playerId,
      updates: body?.updates,
    });
    if (!moduleProfile) {
      return Response.json(
        { saved: false, error: "not_found" },
        { status: 404 },
      );
    }
    return Response.json({
      saved: true,
      moduleProfile,
      requiredModuleIds: requiredGameSdkModuleIds(moduleProfile),
      classification: classifyCreatorGameModules(moduleProfile),
      editableByAi: false,
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (code === "GAME_SDK_MODULE_PLATFORM_LOCKED") {
      return Response.json(
        { saved: false, error: "platform_locked" },
        { status: 409 },
      );
    }
    if (
      code === "GAME_SDK_MODULE_REASON_REQUIRED"
      || code === "GAME_SDK_INVALID_MODULE_DECISION"
      || code === "GAME_SDK_UNKNOWN_MODULE"
      || code === "GAME_SDK_MODULE_UPDATES_REQUIRED"
    ) {
      return Response.json(
        { saved: false, error: "invalid_module_update" },
        { status: 400 },
      );
    }
    return Response.json(
      { saved: false, error: "temporarily_unavailable" },
      { status: 503 },
    );
  }
}

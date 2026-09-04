import { getSdkAccountPlayerId } from "@/lib/account-session";
import {
  authenticateCreatorOwner,
  getCreatorGameModuleProfile,
  normalizeInstanceSlug,
  validateInstanceSlug,
} from "@/lib/instance-registry";
import { getCreatorModuleCustomizationAccess } from "@/lib/module-customization-access";
import { classifyCreatorGameModules } from "@/lib/module-profile-classification";
import {
  GAME_SDK_CREATOR_VISIBLE_MODULE_CATALOG,
  creatorRequiredGameSdkModuleIds,
} from "@game-fields/game-sdk/modules";
import {
  confirmCreatorGameModuleProfile,
  creatorGameModuleAuthoringSummary,
  getCreatorGameModuleAuthoringState,
} from "@/lib/module-authoring-store";
import {
  creatorModuleProfileProposalView,
  prepareCreatorGameModuleProfileUpdate,
} from "@/lib/module-profile-proposal-store";
import { sdkPortalReleaseProfile } from "@/lib/sdk-release-profile";

export const dynamic = "force-dynamic";

const GAME_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,62}[a-z0-9])?$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
  if (!playerId) return { slug, gameId, playerId: null, owner: false, creatorId: null };
  const creator = await authenticateCreatorOwner(slug, playerId);
  return {
    slug,
    gameId,
    playerId,
    owner: Boolean(creator),
    creatorId: creator?.id ?? null,
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
  if (!identity.creatorId) {
    return Response.json(
      { saved: false, error: "owner_required" },
      { status: 403 },
    );
  }
  const creatorId = identity.creatorId;
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
    catalog: GAME_SDK_CREATOR_VISIBLE_MODULE_CATALOG,
    requiredModuleIds: creatorRequiredGameSdkModuleIds(moduleProfile),
    classification: classifyCreatorGameModules(moduleProfile),
    canCustomize: (
      await getCreatorModuleCustomizationAccess({
        creatorSlug: identity.slug,
        ownerPlayerId: identity.playerId,
      })
    ).allowed,
    editableByAi: false,
    moduleContract: creatorGameModuleAuthoringSummary(await getCreatorGameModuleAuthoringState({
      creatorId,
      gameId: identity.gameId,
    })),
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
  if (!identity.creatorId) {
    return Response.json(
      { saved: false, error: "owner_required" },
      { status: 403 },
    );
  }
  const creatorId = identity.creatorId;
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
    requestId?: unknown;
  } | null;
  const requestId = typeof body?.requestId === "string"
    ? body.requestId.trim()
    : "";
  if (!UUID_PATTERN.test(requestId)) {
    return Response.json(
      { saved: false, error: "invalid_request_id" },
      { status: 400 },
    );
  }
  try {
    const preparation = await prepareCreatorGameModuleProfileUpdate({
      creatorId,
      gameId: identity.gameId,
      proposerClient: "Portal Owner",
      proposerPlayerId: identity.playerId,
      environment: sdkPortalReleaseProfile(new URL(request.url).origin).environment,
      origin: new URL(request.url).origin,
      requestId,
      specification: null,
      moduleDecisions: body?.updates,
    });
    if (preparation.kind === "unchanged") {
      return Response.json({
        saved: true,
        noChange: true,
        activeProfileChanged: false,
        humanConfirmationRequired: false,
        moduleContract: creatorGameModuleAuthoringSummary(
          await getCreatorGameModuleAuthoringState({
            creatorId,
            gameId: identity.gameId,
          }),
        ),
      });
    }
    const proposal = creatorModuleProfileProposalView(preparation.proposal);
    const reviewUrl = `/${encodeURIComponent(identity.slug)}/games/${encodeURIComponent(identity.gameId)}/module-proposals/${encodeURIComponent(proposal.id)}`;
    const moduleContract = creatorGameModuleAuthoringSummary(
      await getCreatorGameModuleAuthoringState({
        creatorId,
        gameId: identity.gameId,
      }),
    );
    return Response.json({
      saved: true,
      noChange: false,
      activeProfileChanged: false,
      proposal,
      reviewUrl,
      moduleContract,
      humanConfirmationRequired: true,
      editableByAi: false,
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (
      code === "GAME_SDK_MODULE_CHANGE_NOT_ALLOWED"
      || code === "GAME_SDK_PROPOSAL_ALREADY_PENDING"
    ) {
      return Response.json(
        { saved: false, error: "module_change_not_allowed" },
        { status: 409 },
      );
    }
    if (
      code === "GAME_SDK_INVALID_MODULE_DECISION"
      || code === "GAME_SDK_UNKNOWN_MODULE"
      || code === "GAME_SDK_MODULE_UPDATES_REQUIRED"
      || code === "GAME_SDK_PROPOSAL_DECISIONS_REQUIRED"
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

export async function POST(
  request: Request,
  context: {
    params: Promise<{ instanceId: string; gameId: string }>;
  },
) {
  const identity = await requestIdentity(context);
  if (!identity) return Response.json({ confirmed: false, error: "not_found" }, { status: 404 });
  if (!identity.playerId) return Response.json({ confirmed: false, error: "login_required" }, { status: 401 });
  if (!identity.owner || !identity.creatorId) {
    return Response.json({ confirmed: false, error: "owner_required" }, { status: 403 });
  }
  const body = await request.json().catch(() => null) as { humanConfirmed?: unknown } | null;
  if (body?.humanConfirmed !== true) {
    return Response.json({ confirmed: false, error: "explicit_confirmation_required" }, { status: 400 });
  }
  try {
    const moduleContract = await confirmCreatorGameModuleProfile({
      creatorId: identity.creatorId,
      gameId: identity.gameId,
      playerId: identity.playerId,
      origin: new URL(request.url).origin,
    });
    return Response.json({
      confirmed: moduleContract.moduleContractState?.establishmentKind === "human-confirmation",
      contractEstablished: true,
      confirmationRecorded: moduleContract.confirmationRecorded,
      moduleContract,
      editableByAi: false,
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "temporarily_unavailable";
    return Response.json({ confirmed: false, error: code }, { status: code === "MODULE_PROFILE_STALE" ? 409 : 503 });
  }
}

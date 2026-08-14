import { getSdkAccountPlayerId } from "@/lib/account-session";
import {
  authenticateCreatorOwner,
  normalizeInstanceSlug,
  validateInstanceSlug,
} from "@/lib/instance-registry";
import {
  approveCreatorGameModuleProfileProposal,
  getCreatorGameModuleProfileProposal,
  listCreatorGameModuleProfileProposalAudit,
  updateCreatorGameModuleProfileProposal,
} from "@/lib/module-profile-proposal-store";

export const dynamic = "force-dynamic";

const GAME_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,62}[a-z0-9])?$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function identity(context: { params: Promise<{ instanceId: string; gameId: string; proposalId: string }> }) {
  const raw = await context.params;
  const slug = normalizeInstanceSlug(raw.instanceId);
  const gameId = raw.gameId.trim().toLowerCase();
  const proposalId = raw.proposalId.trim();
  if (validateInstanceSlug(slug) || !GAME_PATTERN.test(gameId) || !UUID_PATTERN.test(proposalId)) return null;
  const playerId = await getSdkAccountPlayerId();
  if (!playerId) return { slug, gameId, proposalId, playerId: null, creatorId: null };
  const creator = await authenticateCreatorOwner(slug, playerId);
  return { slug, gameId, proposalId, playerId, creatorId: creator?.id ?? null };
}

function errorResponse(error: unknown) {
  const code = error instanceof Error ? error.message : "temporarily_unavailable";
  const status = code === "GAME_SDK_PROPOSAL_NOT_FOUND" ? 404
    : code.includes("STALE") || code.includes("NOT_APPROVABLE") || code.includes("NOT_EDITABLE") ? 409
      : code.includes("REQUIRED") || code.includes("INVALID") || code.includes("NOOP") || code.includes("CONFLICT") ? 400
        : 503;
  return Response.json({ saved: false, error: code }, { status });
}

export async function GET(_: Request, context: { params: Promise<{ instanceId: string; gameId: string; proposalId: string }> }) {
  const current = await identity(context);
  if (!current) return Response.json({ error: "not_found" }, { status: 404 });
  if (!current.playerId) return Response.json({ error: "login_required" }, { status: 401 });
  if (!current.creatorId) return Response.json({ error: "owner_required" }, { status: 403 });
  const proposal = await getCreatorGameModuleProfileProposal({ creatorId: current.creatorId, gameId: current.gameId, proposalId: current.proposalId });
  if (!proposal) return Response.json({ error: "not_found" }, { status: 404 });
  return Response.json({ proposal, audit: await listCreatorGameModuleProfileProposalAudit({ creatorId: current.creatorId, gameId: current.gameId, proposalId: current.proposalId }) });
}

export async function PATCH(request: Request, context: { params: Promise<{ instanceId: string; gameId: string; proposalId: string }> }) {
  const current = await identity(context);
  if (!current) return Response.json({ saved: false, error: "not_found" }, { status: 404 });
  if (!current.playerId) return Response.json({ saved: false, error: "login_required" }, { status: 401 });
  if (!current.creatorId) return Response.json({ saved: false, error: "owner_required" }, { status: 403 });
  const body = await request.json().catch(() => null) as { moduleDecisions?: unknown } | null;
  try {
    const proposal = await updateCreatorGameModuleProfileProposal({
      creatorId: current.creatorId,
      gameId: current.gameId,
      proposalId: current.proposalId,
      ownerPlayerId: current.playerId,
      moduleDecisions: body?.moduleDecisions,
    });
    return Response.json({ saved: true, proposal });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request, context: { params: Promise<{ instanceId: string; gameId: string; proposalId: string }> }) {
  const current = await identity(context);
  if (!current) return Response.json({ approved: false, error: "not_found" }, { status: 404 });
  if (!current.playerId) return Response.json({ approved: false, error: "login_required" }, { status: 401 });
  if (!current.creatorId) return Response.json({ approved: false, error: "owner_required" }, { status: 403 });
  const body = await request.json().catch(() => null) as { confirm?: unknown } | null;
  if (body?.confirm !== true) return Response.json({ approved: false, error: "explicit_confirmation_required" }, { status: 400 });
  try {
    const approval = await approveCreatorGameModuleProfileProposal({
      creatorId: current.creatorId,
      gameId: current.gameId,
      proposalId: current.proposalId,
      ownerPlayerId: current.playerId,
      origin: new URL(request.url).origin,
    });
    return Response.json({ approved: true, ...approval });
  } catch (error) {
    const result = errorResponse(error);
    return Response.json({ approved: false, error: (await result.json() as { error?: string }).error }, { status: result.status });
  }
}

import {
  moduleProfileProposalCompatibility,
  type ModuleProfileProposal,
} from "./module-profile-proposal-store.ts";

const GAME_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,62}[a-z0-9])?$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type ModuleProfileStatusHandlerInput = {
  gameId: unknown;
  requestId: unknown;
  scope: string;
  slug: string;
};

export type ModuleProfileStatusHandlerDependencies = {
  authenticateOwner: (slug: string) => Promise<{ id: string } | null>;
  verifyBinding: () => void;
  lookupStatus: (input: { creatorId: string; gameId: string; requestId: string }) => Promise<ModuleProfileProposal | null>;
};

export function normalizeModuleProfileStatusInput(input: Pick<ModuleProfileStatusHandlerInput, "gameId" | "requestId">) {
  const gameId = typeof input.gameId === "string" ? input.gameId.trim().toLowerCase() : "";
  const requestId = typeof input.requestId === "string" ? input.requestId.trim() : "";
  if (!GAME_PATTERN.test(gameId) || !UUID_PATTERN.test(requestId)) {
    throw new Error("GAME_SDK_PROPOSAL_INPUT_INVALID");
  }
  return { gameId, requestId };
}

export async function handleModuleProfileStatus(
  input: ModuleProfileStatusHandlerInput,
  dependencies: ModuleProfileStatusHandlerDependencies,
) {
  dependencies.verifyBinding();
  const creator = await dependencies.authenticateOwner(input.slug);
  if (!creator) throw new Error("SDK_OWNER_REQUIRED");
  const { gameId, requestId } = normalizeModuleProfileStatusInput(input);
  const proposal = await dependencies.lookupStatus({ creatorId: creator.id, gameId, requestId });
  return {
    proposalExists: Boolean(proposal),
    proposalWriteAuthorized: input.scope.split(" ").includes("sdk:mock"),
    ...(proposal ? {
      proposalId: proposal.id,
      status: proposal.status,
      proposalCompatible:
        moduleProfileProposalCompatibility(proposal) === "compatible",
      reviewUrl: `/games/${encodeURIComponent(gameId)}/module-proposals/${encodeURIComponent(proposal.id)}`,
    } : {}),
    activeProfileChanged: false,
  };
}

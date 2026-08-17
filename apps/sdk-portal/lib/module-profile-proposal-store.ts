import { createHash, randomUUID } from "node:crypto";
import {
  GAME_SDK_MODULE_CATALOG,
  GAME_SDK_MODULE_IDS,
  normalizeGameSdkModuleProfile,
  requiredGameSdkModuleIds,
  updateGameSdkModuleProfile,
  type GameSdkModuleId,
  type GameSdkModuleProfile,
} from "@game-fields/game-sdk/modules";
import { ensureSdkSchema, sdkSql } from "./sdk-postgres.ts";
import { createGameSdkModuleContract } from "./module-authoring-contract.ts";
import { getCreatorGameModuleAuthoringState } from "./module-authoring-store.ts";

export type ModuleProfileProposalDiff = {
  id: GameSdkModuleId;
  before: GameSdkModuleProfile[GameSdkModuleId];
  after: GameSdkModuleProfile[GameSdkModuleId];
  reason: string | null;
};

export type ModuleProfileProposal = {
  id: string;
  creatorId: string;
  gameId: string;
  proposerClient: string;
  environment: "development" | "production";
  requestId: string;
  baseModuleProfileRevision: string;
  baseModuleContractDigest: string;
  catalogDigest: string;
  specification: Record<string, unknown>;
  proposedProfile: GameSdkModuleProfile;
  diff: ModuleProfileProposalDiff[];
  dependencies: string[];
  impact: string[];
  warnings: string[];
  status: "pending" | "approved" | "rejected" | "replaced" | "expired";
  approvedByPlayerId: string | null;
  approvedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export const MODULE_PROFILE_STATUS_STORE_ERROR = {
  code: "SDK_MODULE_UPDATE_STATUS_UNAVAILABLE",
  message: "module update status is temporarily unavailable.",
  layer: "store" as const,
};

export const MODULE_PROFILE_PROPOSAL_STORE_ERROR = {
  code: "SDK_MODULE_PROPOSAL_STORE_UNAVAILABLE",
  message: "module profile proposal is temporarily unavailable.",
  layer: "store" as const,
};

export const MODULE_PROFILE_PROPOSAL_OPERATIONS = [
  "schema",
  "proposal-lookup",
  "authoring-state",
  "proposal-insert",
  "audit-insert",
  "proposal-readback",
] as const;

export type ModuleProfileProposalStoreOperation = typeof MODULE_PROFILE_PROPOSAL_OPERATIONS[number];

export class ModuleProfileStatusStoreError extends Error {
  constructor() {
    super(MODULE_PROFILE_STATUS_STORE_ERROR.code);
    this.name = "ModuleProfileStatusStoreError";
  }
}

export class ModuleProfileProposalStoreError extends Error {
  readonly correlationId: string;
  readonly operation?: ModuleProfileProposalStoreOperation;

  constructor(correlationId: string, operation?: ModuleProfileProposalStoreOperation) {
    super(MODULE_PROFILE_PROPOSAL_STORE_ERROR.code);
    this.name = "ModuleProfileProposalStoreError";
    this.correlationId = correlationId;
    this.operation = operation;
  }
}

function safeProposalCorrelationId(value: string) {
  return `mpp-${createHash("sha256").update(value).digest("hex").slice(0, 16)}`;
}

async function proposalStoreBoundary<T>(
  correlationSource: string,
  operationName: ModuleProfileProposalStoreOperation,
  operation: () => Promise<T>,
) {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof ModuleProfileProposalStoreError) throw error;
    throw new ModuleProfileProposalStoreError(safeProposalCorrelationId(correlationSource), operationName);
  }
}

type ProposalRow = Omit<ModuleProfileProposal, "proposedProfile" | "diff" | "specification"> & {
  proposedProfile: unknown;
  diff: unknown;
  specification: unknown;
};

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`;
}

export function moduleCatalogDigest() {
  return createHash("sha256").update(canonicalJson(GAME_SDK_MODULE_CATALOG)).digest("hex");
}

function asProfile(value: unknown) {
  return normalizeGameSdkModuleProfile(value);
}

function asDiff(value: unknown): ModuleProfileProposalDiff[] {
  return Array.isArray(value) ? value as ModuleProfileProposalDiff[] : [];
}

function mapProposal(row: ProposalRow): ModuleProfileProposal {
  return {
    ...row,
    specification: (row.specification && typeof row.specification === "object" && !Array.isArray(row.specification))
      ? row.specification as Record<string, unknown>
      : {},
    proposedProfile: asProfile(row.proposedProfile),
    diff: asDiff(row.diff),
  };
}

function validateSpecification(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("GAME_SDK_PROPOSAL_SPECIFICATION_REQUIRED");
  }
  const input = value as Record<string, unknown>;
  const title = typeof input.title === "string" ? input.title.trim().slice(0, 120) : "";
  const coreLoop = typeof input.coreLoop === "string" ? input.coreLoop.trim().slice(0, 2000) : "";
  if (!title || !coreLoop) throw new Error("GAME_SDK_PROPOSAL_CORE_LOOP_REQUIRED");
  return { ...input, title, coreLoop };
}

export function profileDiff(before: GameSdkModuleProfile, after: GameSdkModuleProfile) {
  return GAME_SDK_MODULE_IDS.flatMap((id) => {
    const previous = before[id];
    const next = after[id];
    if (JSON.stringify(previous) === JSON.stringify(next)) return [];
    return [{
      id,
      before: previous,
      after: next,
      reason: next.mode === "disabled" ? next.reason : null,
    } satisfies ModuleProfileProposalDiff];
  });
}

export function dependencyReport(profile: GameSdkModuleProfile, diff: ModuleProfileProposalDiff[]) {
  const disabled = new Set(
    GAME_SDK_MODULE_IDS.filter((id) => profile[id].mode === "disabled"),
  );
  const dependencies: string[] = [];
  const warnings: string[] = [];
  const dependencyRules: Partial<Record<GameSdkModuleId, GameSdkModuleId[]>> = {
    "room-sync": ["online-room"],
    "room-settings": ["online-room"],
    timer: ["common-shell"],
    result: ["common-shell"],
    rematch: ["result"],
    dissolution: ["online-room"],
    stats: ["standard-outcome"],
    rating: ["standard-outcome"],
    replay: ["standard-outcome"],
    "result-share": ["result"],
    feedback: ["result"],
    "ai-activity": ["llm"],
  };
  for (const change of diff) {
    if (change.after.mode !== "disabled") continue;
    for (const dependency of dependencyRules[change.id] ?? []) {
      if (disabled.has(dependency)) {
        dependencies.push(`${change.id} requires ${dependency}`);
      } else {
        warnings.push(`${change.id} is disabled while ${dependency} remains required; no automatic cascade was applied.`);
      }
    }
  }
  return {
    dependencies: [...new Set(dependencies)].sort(),
    warnings: [...new Set(warnings)].sort(),
  };
}

export function impactReport(diff: ModuleProfileProposalDiff[], profile: GameSdkModuleProfile) {
  const required = requiredGameSdkModuleIds(profile);
  return [
    `${diff.length} module decision(s) change`,
    `active required module count becomes ${required.length}`,
    ...diff.map((change) => `${change.id}: ${change.before.mode} → ${change.after.mode}`),
  ];
}

export type ModuleProfileProposalLookupInput = {
  creatorId: string;
  gameId: string;
  requestId: string;
};

export type ModuleProfileProposalLookupSql = (
  strings: TemplateStringsArray,
  ...values: unknown[]
) => Promise<unknown>;

export async function findCreatorGameModuleProfileProposalId(
  input: ModuleProfileProposalLookupInput,
  sql: ModuleProfileProposalLookupSql = sdkSql() as unknown as ModuleProfileProposalLookupSql,
) {
  const rows = await sql`
    SELECT p.id
    FROM sdk_game_module_profile_proposals p
    JOIN sdk_games g ON g.id = p.game_row_id
    WHERE p.creator_id = ${input.creatorId}::uuid
      AND g.game_id = ${input.gameId}
      AND p.request_id = ${input.requestId}::uuid
    LIMIT 1
  `;
  const row = Array.isArray(rows) ? rows[0] as { id?: unknown } | undefined : undefined;
  return row && typeof row.id === "string" ? row.id : null;
}

export async function resolveExistingModuleProfileProposal(input: {
  creatorId: string;
  gameId: string;
  requestId: string;
}, dependencies: {
  findProposalId: () => Promise<string | null>;
  loadProposal: (proposalId: string) => Promise<ModuleProfileProposal | null>;
}) {
  const proposalId = await dependencies.findProposalId();
  return proposalId ? dependencies.loadProposal(proposalId) : null;
}

export async function prepareCreatorGameModuleProfileUpdate(input: {
  creatorId: string;
  gameId: string;
  proposerClient: "ChatGPT Work" | "Claude Code";
  environment: "development" | "production";
  requestId: string;
  specification: unknown;
  moduleDecisions: unknown;
}) {
  await proposalStoreBoundary(input.requestId, "schema", ensureSdkSchema);
  const existing = await resolveExistingModuleProfileProposal(input, {
    findProposalId: () => proposalStoreBoundary(
      input.requestId,
      "proposal-lookup",
      () => findCreatorGameModuleProfileProposalId(input),
    ),
    loadProposal: (proposalId) => getCreatorGameModuleProfileProposal({
      creatorId: input.creatorId,
      gameId: input.gameId,
      proposalId,
    }),
  });
  if (existing) return existing;
  const current = await proposalStoreBoundary(input.requestId, "authoring-state", () => getCreatorGameModuleAuthoringState({
    creatorId: input.creatorId,
    gameId: input.gameId,
  }));
  if (!current) throw new Error("GAME_SDK_DRAFT_NOT_FOUND");
  if (!current.moduleProfileConfirmedAt || !current.moduleContractDigest) {
    throw new Error("MODULE_PROFILE_NOT_CONFIRMED");
  }
  const specification = validateSpecification(input.specification);
  if (!input.moduleDecisions || typeof input.moduleDecisions !== "object" || Array.isArray(input.moduleDecisions)) {
    throw new Error("GAME_SDK_PROPOSAL_DECISIONS_REQUIRED");
  }
  const proposedProfile = updateGameSdkModuleProfile(current.moduleProfile, input.moduleDecisions);
  const diff = profileDiff(current.moduleProfile, proposedProfile);
  if (diff.length === 0) throw new Error("GAME_SDK_PROPOSAL_NOOP");
  const dependencyReportResult = dependencyReport(proposedProfile, diff);
  if (dependencyReportResult.dependencies.length) throw new Error("GAME_SDK_PROPOSAL_DEPENDENCY_CONFLICT");
  const catalogDigest = moduleCatalogDigest();
  const id = randomUUID();
  const impact = impactReport(diff, proposedProfile);
  const rows = await proposalStoreBoundary(input.requestId, "proposal-insert", async () => sdkSql()`
      INSERT INTO sdk_game_module_profile_proposals (
        id, creator_id, game_row_id, game_id, proposer_client, environment,
        request_id, base_module_profile_revision, base_module_contract_digest,
        catalog_digest, specification, proposed_profile, diff, dependencies,
        impact, warnings
      )
      SELECT ${id}::uuid, c.id, g.id, g.game_id, ${input.proposerClient}, ${input.environment},
             ${input.requestId}::uuid, g.module_profile_revision, g.module_contract_digest,
             ${catalogDigest}, ${JSON.stringify(specification)}::jsonb,
             ${JSON.stringify(proposedProfile)}::jsonb, ${JSON.stringify(diff)}::jsonb,
             ${JSON.stringify(dependencyReportResult.dependencies)}::jsonb,
             ${JSON.stringify(impact)}::jsonb, ${JSON.stringify(dependencyReportResult.warnings)}::jsonb
      FROM sdk_games g
      JOIN sdk_creators c ON c.id = g.creator_id
      WHERE c.id = ${input.creatorId}::uuid
        AND g.game_id = ${input.gameId}
        AND g.deleted_at IS NULL
        AND g.module_profile_confirmed_at IS NOT NULL
        AND g.module_contract_digest = ${current.moduleContractDigest}
      RETURNING id
    `);
  if (!Array.isArray(rows) || rows.length === 0) throw new Error("MODULE_PROFILE_STALE");
  await proposalStoreBoundary(input.requestId, "audit-insert", async () => sdkSql()`
      INSERT INTO sdk_game_module_profile_audit (
        proposal_id, creator_id, game_row_id, action, actor_kind, actor_client,
        base_module_profile_revision, base_module_contract_digest, diff
      )
      SELECT p.id, p.creator_id, p.game_row_id, 'prepared', 'ai', p.proposer_client,
             p.base_module_profile_revision, p.base_module_contract_digest, p.diff
      FROM sdk_game_module_profile_proposals p
      WHERE p.id = ${id}::uuid
    `);
  return getCreatorGameModuleProfileProposal({
    creatorId: input.creatorId,
    gameId: input.gameId,
    proposalId: id,
  });
}

export async function getCreatorGameModuleProfileProposal(input: {
  creatorId: string;
  gameId: string;
  proposalId: string;
}) {
  return proposalStoreBoundary(input.proposalId, "proposal-readback", async () => {
    await ensureSdkSchema();
    const rows = await sdkSql()`
      SELECT p.id, p.creator_id AS "creatorId", p.game_id AS "gameId",
             p.proposer_client AS "proposerClient", p.environment,
             p.request_id AS "requestId",
             p.base_module_profile_revision AS "baseModuleProfileRevision",
             p.base_module_contract_digest AS "baseModuleContractDigest",
             p.catalog_digest AS "catalogDigest", p.specification,
             p.proposed_profile AS "proposedProfile", p.diff, p.dependencies,
             p.impact, p.warnings, p.status,
             p.approved_by_player_id AS "approvedByPlayerId",
             p.approved_at AS "approvedAt", p.created_at AS "createdAt",
             p.updated_at AS "updatedAt"
      FROM sdk_game_module_profile_proposals p
      JOIN sdk_games g ON g.id = p.game_row_id
      WHERE p.id = ${input.proposalId}::uuid
        AND p.creator_id = ${input.creatorId}::uuid
        AND g.game_id = ${input.gameId}
      LIMIT 1
    `;
    const row = Array.isArray(rows) ? rows[0] as ProposalRow | undefined : undefined;
    return row ? mapProposal(row) : null;
  });
}

export type ModuleProfileStatusLookupDependencies = {
  ensureSchema: () => Promise<void>;
  findProposalId: (input: { creatorId: string; gameId: string; requestId: string }) => Promise<string | null>;
  loadProposal: (input: { creatorId: string; gameId: string; proposalId: string }) => Promise<ModuleProfileProposal | null>;
};

export async function resolveCreatorGameModuleProfileUpdateStatus(
  input: { creatorId: string; gameId: string; requestId: string },
  dependencies: ModuleProfileStatusLookupDependencies,
) {
  try {
    await dependencies.ensureSchema();
    const proposalId = await dependencies.findProposalId(input);
    if (!proposalId) return null;
    return dependencies.loadProposal({
      creatorId: input.creatorId,
      gameId: input.gameId,
      proposalId,
    });
  } catch {
    throw new ModuleProfileStatusStoreError();
  }
}

export async function getCreatorGameModuleProfileUpdateStatus(input: {
  creatorId: string;
  gameId: string;
  requestId: string;
}) {
  return resolveCreatorGameModuleProfileUpdateStatus(input, {
    ensureSchema: ensureSdkSchema,
    findProposalId: findCreatorGameModuleProfileProposalId,
    loadProposal: getCreatorGameModuleProfileProposal,
  });
}

export async function listCreatorGameModuleProfileProposalAudit(input: {
  creatorId: string;
  gameId: string;
  proposalId: string;
}) {
  await ensureSdkSchema();
  const rows = await sdkSql()`
    SELECT a.id, a.action, a.actor_kind AS "actorKind",
           a.actor_player_id AS "actorPlayerId", a.actor_client AS "actorClient",
           a.base_module_profile_revision AS "baseModuleProfileRevision",
           a.base_module_contract_digest AS "baseModuleContractDigest",
           a.new_module_profile_revision AS "newModuleProfileRevision",
           a.new_module_contract_digest AS "newModuleContractDigest",
           a.diff, a.created_at AS "createdAt"
    FROM sdk_game_module_profile_audit a
    JOIN sdk_game_module_profile_proposals p ON p.id = a.proposal_id
    JOIN sdk_games g ON g.id = a.game_row_id
    WHERE a.proposal_id = ${input.proposalId}::uuid
      AND a.creator_id = ${input.creatorId}::uuid
      AND g.game_id = ${input.gameId}
    ORDER BY a.created_at ASC
  `;
  return rows;
}

export async function updateCreatorGameModuleProfileProposal(input: {
  creatorId: string;
  gameId: string;
  proposalId: string;
  ownerPlayerId?: string;
  moduleDecisions: unknown;
}) {
  const proposal = await getCreatorGameModuleProfileProposal(input);
  if (!proposal) throw new Error("GAME_SDK_PROPOSAL_NOT_FOUND");
  if (proposal.status !== "pending") throw new Error("GAME_SDK_PROPOSAL_NOT_EDITABLE");
  const current = await getCreatorGameModuleAuthoringState(input);
  if (!current || current.moduleProfileRevision !== proposal.baseModuleProfileRevision || current.moduleContractDigest !== proposal.baseModuleContractDigest) {
    throw new Error("MODULE_PROFILE_STALE");
  }
  const proposedProfile = updateGameSdkModuleProfile(current.moduleProfile, input.moduleDecisions);
  const diff = profileDiff(current.moduleProfile, proposedProfile);
  if (!diff.length) throw new Error("GAME_SDK_PROPOSAL_NOOP");
  const dependencyReportResult = dependencyReport(proposedProfile, diff);
  if (dependencyReportResult.dependencies.length) throw new Error("GAME_SDK_PROPOSAL_DEPENDENCY_CONFLICT");
  const impact = impactReport(diff, proposedProfile);
  await ensureSdkSchema();
  const rows = await sdkSql()`
    UPDATE sdk_game_module_profile_proposals
    SET proposed_profile = ${JSON.stringify(proposedProfile)}::jsonb,
        diff = ${JSON.stringify(diff)}::jsonb,
        dependencies = ${JSON.stringify(dependencyReportResult.dependencies)}::jsonb,
        impact = ${JSON.stringify(impact)}::jsonb,
        warnings = ${JSON.stringify(dependencyReportResult.warnings)}::jsonb,
        updated_at = NOW()
    WHERE id = ${input.proposalId}::uuid
      AND creator_id = ${input.creatorId}::uuid
      AND status = 'pending'
    RETURNING id
  `;
  if (!Array.isArray(rows) || rows.length === 0) throw new Error("GAME_SDK_PROPOSAL_NOT_EDITABLE");
  await sdkSql()`
    INSERT INTO sdk_game_module_profile_audit (
      proposal_id, creator_id, game_row_id, action, actor_kind, actor_player_id, diff
    )
    SELECT p.id, p.creator_id, p.game_row_id, 'edited', 'owner', ${input.ownerPlayerId ?? null}, p.diff
    FROM sdk_game_module_profile_proposals p
    WHERE p.id = ${input.proposalId}::uuid
  `;
  return getCreatorGameModuleProfileProposal(input);
}

export async function approveCreatorGameModuleProfileProposal(input: {
  creatorId: string;
  gameId: string;
  proposalId: string;
  ownerPlayerId: string;
  origin?: string;
}) {
  const proposal = await getCreatorGameModuleProfileProposal(input);
  if (!proposal) throw new Error("GAME_SDK_PROPOSAL_NOT_FOUND");
  if (proposal.status !== "pending") throw new Error("GAME_SDK_PROPOSAL_NOT_APPROVABLE");
  const current = await getCreatorGameModuleAuthoringState(input);
  if (!current || current.moduleProfileRevision !== proposal.baseModuleProfileRevision || current.moduleContractDigest !== proposal.baseModuleContractDigest) {
    throw new Error("MODULE_PROFILE_STALE");
  }
  if (proposal.catalogDigest !== moduleCatalogDigest()) throw new Error("GAME_SDK_PROPOSAL_CATALOG_STALE");
  const nextRevision = randomUUID();
  const nextContract = createGameSdkModuleContract({
    moduleProfile: proposal.proposedProfile,
    moduleProfileRevision: nextRevision,
    origin: input.origin,
  });
  await ensureSdkSchema();
  const rows = await sdkSql()`
    WITH updated_game AS (
      UPDATE sdk_games g
      SET module_policy = ${JSON.stringify(proposal.proposedProfile)}::jsonb,
          module_profile_revision = ${nextRevision}::uuid,
          module_contract_digest = ${nextContract.moduleContractDigest},
          module_profile_confirmed_at = NOW(),
          module_profile_confirmed_by_player_id = ${input.ownerPlayerId},
          mock_approved_revision = NULL,
          mock_approved_at = NULL,
          mock_approved_by_player_id = NULL,
          prototype_module_profile_revision = NULL,
          prototype_module_contract_digest = NULL,
          prototype_sdk_package_version = NULL,
          prototype_source_sha256 = NULL,
          updated_at = NOW()
      WHERE g.creator_id = ${input.creatorId}::uuid
        AND g.game_id = ${input.gameId}
        AND g.module_profile_revision = ${proposal.baseModuleProfileRevision}::uuid
        AND g.module_contract_digest = ${proposal.baseModuleContractDigest}
        AND g.deleted_at IS NULL
      RETURNING g.id, g.creator_id, g.module_profile_revision, g.module_contract_digest
    ), updated_proposal AS (
      UPDATE sdk_game_module_profile_proposals p
      SET status = 'approved', approved_by_player_id = ${input.ownerPlayerId},
          approved_at = NOW(), updated_at = NOW()
      FROM updated_game g
      WHERE p.id = ${input.proposalId}::uuid
        AND p.creator_id = g.creator_id
        AND p.status = 'pending'
      RETURNING p.id, p.creator_id, p.game_row_id
    ), audit AS (
      INSERT INTO sdk_game_module_profile_audit (
        proposal_id, creator_id, game_row_id, action, actor_kind,
        actor_player_id, actor_client, base_module_profile_revision,
        base_module_contract_digest, new_module_profile_revision,
        new_module_contract_digest, diff
      )
      SELECT p.id, p.creator_id, p.game_row_id, 'approved', 'owner',
             ${input.ownerPlayerId}, p.proposer_client,
             p.base_module_profile_revision, p.base_module_contract_digest,
             ${nextRevision}::uuid, ${nextContract.moduleContractDigest}, p.diff
      FROM updated_proposal u
      JOIN sdk_game_module_profile_proposals p ON p.id = u.id
      RETURNING id
    )
    SELECT id FROM updated_proposal
  `;
  if (!Array.isArray(rows) || rows.length === 0) throw new Error("MODULE_PROFILE_STALE");
  return {
    proposalId: input.proposalId,
    status: "approved" as const,
    moduleProfileRevision: nextRevision,
    moduleContractDigest: nextContract.moduleContractDigest,
    prototypeApprovalInvalidated: true,
  };
}

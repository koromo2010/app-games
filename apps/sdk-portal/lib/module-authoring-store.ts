import { randomUUID } from "node:crypto";
import { createInitialGameSdkModuleProfile, normalizeGameSdkModuleProfile } from "@game-fields/game-sdk/modules";
import platformRelease from "../../../config/platform-release.json" with { type: "json" };
import { ensureSdkSchema, sdkSql } from "./sdk-postgres.ts";
import {
  createGameSdkModuleContract,
  legacyGameSdkModuleContractDigest,
} from "./module-authoring-contract.ts";

export type CreatorGameModuleAuthoringState = {
  creatorId: string;
  gameId: string;
  moduleProfile: ReturnType<typeof normalizeGameSdkModuleProfile>;
  moduleProfileRevision: string;
  moduleContractDigest: string | null;
  moduleProfileConfirmedAt: string | null;
  moduleProfileCreatedAt: string;
  moduleProfileUpdatedAt: string;
  pendingModuleProfileProposalId: string | null;
  pendingModuleProfileProposalCreatedAt: string | null;
  persistedModuleProfile?: unknown;
};

export function creatorGameModuleAuthoringSummary(
  state: CreatorGameModuleAuthoringState | null,
) {
  if (!state) return null;
  const establishmentKind = !state.moduleContractDigest
    ? "pending-human-confirmation"
    : state.moduleProfileConfirmedAt
      ? "human-confirmation"
      : "initial-default";
  const pendingChange = Boolean(state.pendingModuleProfileProposalId);
  return {
    moduleProfileRevision: state.moduleProfileRevision,
    moduleContractDigest: state.moduleContractDigest,
    moduleProfileConfirmedAt: state.moduleProfileConfirmedAt,
    establishmentKind,
    origin: establishmentKind === "initial-default"
      ? "system-default"
      : establishmentKind === "human-confirmation"
        ? "owner-confirmation"
        : "unestablished-change",
    changeConfirmationState: pendingChange
      ? "pending-human-confirmation"
      : "none",
    humanConfirmationRequired: establishmentKind === "pending-human-confirmation"
      || pendingChange,
    prototypeAuthoringAllowed: establishmentKind !== "pending-human-confirmation"
      && !pendingChange,
    pendingProposal: state.pendingModuleProfileProposalId
      ? {
          id: state.pendingModuleProfileProposalId,
          createdAt: state.pendingModuleProfileProposalCreatedAt,
        }
      : null,
    auditRecord: {
      event: establishmentKind === "initial-default"
        ? "initial-default-established"
        : establishmentKind === "human-confirmation"
          ? "human-confirmed"
          : "module-contract-unestablished",
      actorKind: establishmentKind === "initial-default"
        ? "system"
        : establishmentKind === "human-confirmation"
          ? "owner"
          : null,
      occurredAt: establishmentKind === "initial-default"
        ? state.moduleProfileCreatedAt
        : establishmentKind === "human-confirmation"
          ? state.moduleProfileConfirmedAt
          : state.moduleProfileUpdatedAt,
    },
  } as const;
}

export type ModuleAuthoringSql = (
  strings: TemplateStringsArray,
  ...values: unknown[]
) => Promise<unknown>;

export type CreateCreatorGameDraftDependencies = {
  ensureSchema?: () => Promise<void>;
  sql?: ModuleAuthoringSql;
  createRevision?: () => string;
};

export async function createCreatorGameDraft(input: {
  creatorId: string;
  gameId: string;
  title: string;
  description: string;
  playMode: "online-room";
  minimumPlayers: number;
  maximumPlayers: number;
  origin?: string;
}, dependencies: CreateCreatorGameDraftDependencies = {}) {
  await (dependencies.ensureSchema ?? ensureSdkSchema)();
  const database = dependencies.sql
    ?? (sdkSql() as unknown as ModuleAuthoringSql);
  const moduleProfile = createInitialGameSdkModuleProfile();
  const moduleProfileRevision = (dependencies.createRevision ?? randomUUID)();
  const moduleContract = createGameSdkModuleContract({
    moduleProfile,
    moduleProfileRevision,
    origin: input.origin,
  });
  const manifest = JSON.stringify({
    stage: "draft",
    playMode: input.playMode,
    minimumPlayers: input.minimumPlayers,
    maximumPlayers: input.maximumPlayers,
  });
  const rows = await database`
    INSERT INTO sdk_games (
      creator_id, game_id, title, description, manifest, module_policy,
      module_profile_revision, module_contract_digest,
      sdk_package_version, sdk_contract_version, status
    ) VALUES (
      ${input.creatorId}, ${input.gameId}, ${input.title}, ${input.description},
      ${manifest}::jsonb, ${JSON.stringify(moduleProfile)}::jsonb,
      ${moduleProfileRevision}, ${moduleContract.moduleContractDigest},
      ${platformRelease.sdkPackageVersion},
      ${platformRelease.sdkContractVersion}, 'draft'
    )
    ON CONFLICT (creator_id, game_id) DO NOTHING
    RETURNING id, game_id AS "gameId", title, description,
              module_policy AS "moduleProfile",
              module_profile_revision AS "moduleProfileRevision",
              module_contract_digest AS "moduleContractDigest",
              module_profile_confirmed_at AS "moduleProfileConfirmedAt",
              created_at AS "moduleProfileCreatedAt",
              updated_at AS "moduleProfileUpdatedAt"
  `;
  const row = (Array.isArray(rows) ? rows[0] : null) as
    | {
        id: string;
        gameId: string;
        title: string;
        description: string;
        moduleProfile: unknown;
        moduleProfileRevision: string;
        moduleContractDigest: string;
        moduleProfileConfirmedAt: null;
        moduleProfileCreatedAt: string;
        moduleProfileUpdatedAt: string;
      }
    | null;
  if (!row) throw new Error("GAME_SDK_DRAFT_ALREADY_EXISTS");
  const normalized = normalizeGameSdkModuleProfile(row.moduleProfile);
  const persistedContract = createGameSdkModuleContract({
    moduleProfile: normalized,
    moduleProfileRevision: row.moduleProfileRevision,
    origin: input.origin,
  });
  if (
    row.moduleProfileRevision !== moduleProfileRevision
    || row.moduleContractDigest !== moduleContract.moduleContractDigest
    || row.moduleContractDigest !== persistedContract.moduleContractDigest
    || row.moduleProfileConfirmedAt !== null
  ) {
    throw new Error("MODULE_PROFILE_STALE");
  }
  return {
    ...row,
    moduleProfile: normalized,
    moduleContract: persistedContract,
    moduleContractState: creatorGameModuleAuthoringSummary({
      creatorId: input.creatorId,
      gameId: row.gameId,
      moduleProfile: normalized,
      moduleProfileRevision: row.moduleProfileRevision,
      moduleContractDigest: row.moduleContractDigest,
      moduleProfileConfirmedAt: row.moduleProfileConfirmedAt,
      moduleProfileCreatedAt: row.moduleProfileCreatedAt,
      moduleProfileUpdatedAt: row.moduleProfileUpdatedAt,
      pendingModuleProfileProposalId: null,
      pendingModuleProfileProposalCreatedAt: null,
    }),
  };
}

export async function getCreatorGameModuleAuthoringState(input: {
  creatorId: string;
  gameId: string;
}) {
  await ensureSdkSchema();
  const rows = await sdkSql()`
    SELECT g.creator_id AS "creatorId", g.game_id AS "gameId",
           g.module_policy AS "moduleProfile",
           g.module_profile_revision AS "moduleProfileRevision",
           g.module_contract_digest AS "moduleContractDigest",
           g.module_profile_confirmed_at AS "moduleProfileConfirmedAt",
           g.created_at AS "moduleProfileCreatedAt",
           g.updated_at AS "moduleProfileUpdatedAt",
           pending.id::text AS "pendingModuleProfileProposalId",
           pending.created_at AS "pendingModuleProfileProposalCreatedAt"
    FROM sdk_games g
    LEFT JOIN LATERAL (
      SELECT p.id, p.created_at
      FROM sdk_game_module_profile_proposals p
      WHERE p.game_row_id = g.id
        AND p.status = 'pending'
      ORDER BY p.created_at ASC, p.id ASC
      LIMIT 1
    ) pending ON TRUE
    WHERE g.creator_id = ${input.creatorId}
      AND g.game_id = ${input.gameId}
      AND g.deleted_at IS NULL
    LIMIT 1
  `;
  const row = (Array.isArray(rows) ? rows[0] : null) as
    | Omit<CreatorGameModuleAuthoringState, "moduleProfile"> & { moduleProfile: unknown }
    | null;
  if (!row) return null;
  const state: CreatorGameModuleAuthoringState = {
    ...row,
    moduleProfile: normalizeGameSdkModuleProfile(row.moduleProfile),
  };
  Object.defineProperty(state, "persistedModuleProfile", {
    value: row.moduleProfile,
    enumerable: false,
  });
  return state;
}

export async function confirmCreatorGameModuleProfile(input: {
  creatorId: string;
  gameId: string;
  playerId: string;
  origin?: string;
}) {
  const current = await getCreatorGameModuleAuthoringState(input);
  if (!current) throw new Error("GAME_SDK_DRAFT_NOT_FOUND");
  if (current.moduleContractDigest) {
    const established = await requireEstablishedCreatorGameModuleContract(input);
    return {
      ...established,
      confirmedAt: current.moduleProfileConfirmedAt,
      confirmationRecorded: false as const,
    };
  }
  const contract = createGameSdkModuleContract({
    moduleProfile: current.moduleProfile,
    moduleProfileRevision: current.moduleProfileRevision,
    origin: input.origin,
  });
  const rows = await sdkSql()`
    UPDATE sdk_games
    SET module_contract_digest = ${contract.moduleContractDigest},
        module_profile_confirmed_at = NOW(),
        module_profile_confirmed_by_player_id = ${input.playerId},
        updated_at = NOW()
    WHERE creator_id = ${input.creatorId}
      AND game_id = ${input.gameId}
      AND module_profile_revision = ${current.moduleProfileRevision}
      AND deleted_at IS NULL
    RETURNING module_profile_confirmed_at AS "confirmedAt"
  `;
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error("MODULE_PROFILE_STALE");
  }
  const confirmedAt = (rows[0] as { confirmedAt: string }).confirmedAt;
  return {
    ...contract,
    moduleContractState: {
      moduleProfileRevision: contract.moduleProfileRevision,
      moduleContractDigest: contract.moduleContractDigest,
      moduleProfileConfirmedAt: confirmedAt,
      establishmentKind: "human-confirmation" as const,
      origin: "owner-confirmation" as const,
      changeConfirmationState: "none" as const,
      humanConfirmationRequired: false,
      prototypeAuthoringAllowed: true,
      pendingProposal: null,
      auditRecord: {
        event: "human-confirmed" as const,
        actorKind: "owner" as const,
        occurredAt: confirmedAt,
      },
    },
    confirmedAt,
    confirmationRecorded: true as const,
  };
}

export function establishedCreatorGameModuleContract(
  state: CreatorGameModuleAuthoringState,
  input: { origin?: string },
) {
  if (!state.moduleContractDigest || state.pendingModuleProfileProposalId) {
    throw new Error("MODULE_PROFILE_NOT_CONFIRMED");
  }
  const contract = createGameSdkModuleContract({
    moduleProfile: state.moduleProfile,
    moduleProfileRevision: state.moduleProfileRevision,
    origin: input.origin,
  });
  if (contract.moduleContractDigest !== state.moduleContractDigest) {
    const legacyDigest = legacyGameSdkModuleContractDigest({
      moduleProfile: state.persistedModuleProfile,
      environment: contract.environment,
    });
    if (legacyDigest !== state.moduleContractDigest) {
      throw new Error("MODULE_PROFILE_STALE");
    }
    return {
      ...contract,
      moduleContractDigest: state.moduleContractDigest,
      moduleContractState: creatorGameModuleAuthoringSummary(state),
    };
  }
  return {
    ...contract,
    moduleContractState: creatorGameModuleAuthoringSummary(state),
  };
}

export async function requireEstablishedCreatorGameModuleContract(input: {
  creatorId: string;
  gameId: string;
  origin?: string;
}) {
  const state = await getCreatorGameModuleAuthoringState(input);
  if (!state) throw new Error("GAME_SDK_DRAFT_NOT_FOUND");
  return establishedCreatorGameModuleContract(state, input);
}

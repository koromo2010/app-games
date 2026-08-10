import { randomUUID } from "node:crypto";
import { createInitialGameSdkModuleProfile, normalizeGameSdkModuleProfile } from "@game-fields/game-sdk/modules";
import platformRelease from "../../../config/platform-release.json" with { type: "json" };
import { ensureSdkSchema, sdkSql } from "./sdk-postgres.ts";
import { createGameSdkModuleContract } from "./module-authoring-contract.ts";

export type CreatorGameModuleAuthoringState = {
  creatorId: string;
  gameId: string;
  moduleProfile: ReturnType<typeof normalizeGameSdkModuleProfile>;
  moduleProfileRevision: string;
  moduleContractDigest: string | null;
  moduleProfileConfirmedAt: string | null;
};

export async function createCreatorGameDraft(input: {
  creatorId: string;
  gameId: string;
  title: string;
  description: string;
  playMode: "online-room";
  minimumPlayers: number;
  maximumPlayers: number;
}) {
  await ensureSdkSchema();
  const moduleProfile = createInitialGameSdkModuleProfile();
  const moduleProfileRevision = randomUUID();
  const manifest = JSON.stringify({
    stage: "draft",
    playMode: input.playMode,
    minimumPlayers: input.minimumPlayers,
    maximumPlayers: input.maximumPlayers,
  });
  const rows = await sdkSql()`
    INSERT INTO sdk_games (
      creator_id, game_id, title, description, manifest, module_policy,
      module_profile_revision, sdk_package_version, sdk_contract_version, status
    ) VALUES (
      ${input.creatorId}, ${input.gameId}, ${input.title}, ${input.description},
      ${manifest}::jsonb, ${JSON.stringify(moduleProfile)}::jsonb,
      ${moduleProfileRevision}, ${platformRelease.sdkPackageVersion},
      ${platformRelease.sdkContractVersion}, 'draft'
    )
    ON CONFLICT (creator_id, game_id) DO NOTHING
    RETURNING id, game_id AS "gameId", title, description,
              module_policy AS "moduleProfile",
              module_profile_revision AS "moduleProfileRevision"
  `;
  const row = (Array.isArray(rows) ? rows[0] : null) as
    | { id: string; gameId: string; title: string; description: string; moduleProfile: unknown; moduleProfileRevision: string }
    | null;
  if (!row) throw new Error("GAME_SDK_DRAFT_ALREADY_EXISTS");
  return { ...row, moduleProfile: normalizeGameSdkModuleProfile(row.moduleProfile) };
}

export async function getCreatorGameModuleAuthoringState(input: {
  creatorId: string;
  gameId: string;
}) {
  await ensureSdkSchema();
  const rows = await sdkSql()`
    SELECT creator_id AS "creatorId", game_id AS "gameId",
           module_policy AS "moduleProfile",
           module_profile_revision AS "moduleProfileRevision",
           module_contract_digest AS "moduleContractDigest",
           module_profile_confirmed_at AS "moduleProfileConfirmedAt"
    FROM sdk_games
    WHERE creator_id = ${input.creatorId}
      AND game_id = ${input.gameId}
      AND deleted_at IS NULL
    LIMIT 1
  `;
  const row = (Array.isArray(rows) ? rows[0] : null) as
    | Omit<CreatorGameModuleAuthoringState, "moduleProfile"> & { moduleProfile: unknown }
    | null;
  return row ? { ...row, moduleProfile: normalizeGameSdkModuleProfile(row.moduleProfile) } : null;
}

export async function confirmCreatorGameModuleProfile(input: {
  creatorId: string;
  gameId: string;
  playerId: string;
  origin?: string;
}) {
  const current = await getCreatorGameModuleAuthoringState(input);
  if (!current) throw new Error("GAME_SDK_DRAFT_NOT_FOUND");
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
  return { ...contract, confirmedAt: (rows[0] as { confirmedAt: string }).confirmedAt };
}

export async function requireConfirmedCreatorGameModuleContract(input: {
  creatorId: string;
  gameId: string;
  origin?: string;
}) {
  const state = await getCreatorGameModuleAuthoringState(input);
  if (!state) throw new Error("GAME_SDK_DRAFT_NOT_FOUND");
  if (!state.moduleProfileConfirmedAt || !state.moduleContractDigest) {
    throw new Error("MODULE_PROFILE_NOT_CONFIRMED");
  }
  const contract = createGameSdkModuleContract({
    moduleProfile: state.moduleProfile,
    moduleProfileRevision: state.moduleProfileRevision,
    origin: input.origin,
  });
  if (contract.moduleContractDigest !== state.moduleContractDigest) {
    throw new Error("MODULE_PROFILE_STALE");
  }
  return contract;
}

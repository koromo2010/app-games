import { ensureSdkSchema, sdkSql } from "./sdk-postgres.ts";

export type CreatorMockApproval = {
  gameId: string;
  mockRevision: string;
  approvedRevision: string | null;
  approvedAt: string | null;
  approved: boolean;
  moduleProfileRevision: string;
  moduleContractDigest: string;
  sdkPackageVersion: string;
  sharedSourceSha256: string;
};

export async function getCreatorMockApproval(input: {
  creatorId: string;
  gameId: string;
}) {
  await ensureSdkSchema();
  const rows = await sdkSql()`
    SELECT game_id AS "gameId",
           mock_revision AS "mockRevision",
           mock_approved_revision AS "approvedRevision",
           mock_approved_at AS "approvedAt",
           prototype_module_profile_revision AS "moduleProfileRevision",
           prototype_module_contract_digest AS "moduleContractDigest",
           prototype_sdk_package_version AS "sdkPackageVersion",
           prototype_source_sha256 AS "sharedSourceSha256"
    FROM sdk_games
    WHERE creator_id = ${input.creatorId}
      AND game_id = ${input.gameId}
      AND deleted_at IS NULL
    LIMIT 1
  `;
  const row = (Array.isArray(rows) ? rows[0] : null) as
    | Omit<CreatorMockApproval, "approved">
    | null;
  if (
    !row?.mockRevision
    || !row.moduleProfileRevision
    || !row.moduleContractDigest
    || !row.sdkPackageVersion
    || !row.sharedSourceSha256
  ) return null;
  return {
    ...row,
    approved: row.approvedRevision === row.mockRevision,
  } satisfies CreatorMockApproval;
}

export async function approveCreatorMock(input: {
  creatorId: string;
  gameId: string;
  mockRevision: string;
  playerId: string;
}) {
  await ensureSdkSchema();
  const rows = await sdkSql()`
    UPDATE sdk_games
    SET mock_approved_revision = mock_revision,
        mock_approved_at = NOW(),
        mock_approved_by_player_id = ${input.playerId},
        updated_at = NOW()
    WHERE creator_id = ${input.creatorId}
      AND game_id = ${input.gameId}
      AND mock_revision = ${input.mockRevision}
      AND prototype_module_profile_revision = module_profile_revision
      AND prototype_module_contract_digest = module_contract_digest
      AND prototype_sdk_package_version = sdk_package_version
      AND prototype_source_sha256 IS NOT NULL
      AND module_profile_confirmed_at IS NOT NULL
      AND deleted_at IS NULL
    RETURNING game_id AS "gameId",
              mock_revision AS "mockRevision",
              mock_approved_revision AS "approvedRevision",
              mock_approved_at AS "approvedAt",
              prototype_module_profile_revision AS "moduleProfileRevision",
              prototype_module_contract_digest AS "moduleContractDigest",
              prototype_sdk_package_version AS "sdkPackageVersion",
              prototype_source_sha256 AS "sharedSourceSha256"
  `;
  const row = (Array.isArray(rows) ? rows[0] : null) as
    | Omit<CreatorMockApproval, "approved">
    | null;
  if (!row) throw new Error("GAME_SDK_MOCK_REVISION_MISMATCH");
  return { ...row, approved: true } satisfies CreatorMockApproval;
}

export async function requireApprovedCreatorMock(input: {
  creatorId: string;
  gameId: string;
}) {
  const approval = await getCreatorMockApproval(input);
  if (!approval) throw new Error("GAME_SDK_MOCK_NOT_FOUND");
  if (!approval.approved) throw new Error("GAME_SDK_MOCK_HUMAN_APPROVAL_REQUIRED");
  return approval;
}

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
    FROM sdk_games g
    WHERE g.creator_id = ${input.creatorId}
      AND g.game_id = ${input.gameId}
      AND g.deleted_at IS NULL
      AND NOT EXISTS (
        SELECT 1
        FROM sdk_game_module_profile_proposals p
        WHERE p.game_row_id = g.id
          AND p.status = 'pending'
      )
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
    UPDATE sdk_games g
    SET mock_approved_revision = mock_revision,
        mock_approved_at = NOW(),
        mock_approved_by_player_id = ${input.playerId},
        updated_at = NOW()
    WHERE g.creator_id = ${input.creatorId}
      AND g.game_id = ${input.gameId}
      AND g.mock_revision = ${input.mockRevision}
      AND g.prototype_module_profile_revision = g.module_profile_revision
      AND g.prototype_module_contract_digest = g.module_contract_digest
      AND g.prototype_sdk_package_version = g.sdk_package_version
      AND g.prototype_source_sha256 IS NOT NULL
      AND g.module_contract_digest IS NOT NULL
      AND g.deleted_at IS NULL
      AND NOT EXISTS (
        SELECT 1
        FROM sdk_game_module_profile_proposals p
        WHERE p.game_row_id = g.id
          AND p.status = 'pending'
      )
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

import { ensureSdkSchema, sdkSql } from "./sdk-postgres";

export async function getGamePackageContractVersion(input: {
  creatorSlug: string;
  gameId: string;
  revision: string;
}): Promise<number | null> {
  await ensureSdkSchema();
  const rows = await sdkSql()`
    SELECT r.sdk_contract_version AS "sdkContractVersion"
    FROM sdk_game_package_revisions r
    JOIN sdk_games g ON g.id = r.game_id
    JOIN sdk_creators c ON c.id = g.creator_id
    WHERE c.slug = ${input.creatorSlug}
      AND g.game_id = ${input.gameId}
      AND r.revision = ${input.revision}
    LIMIT 1
  `;
  const row = (Array.isArray(rows) ? rows[0] : undefined) as
    | { sdkContractVersion?: unknown }
    | undefined;
  const value = Number(row?.sdkContractVersion);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

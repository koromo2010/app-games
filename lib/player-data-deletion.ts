import { deletePlayerGameReplayData } from "./game-replay-store.ts";
import { deleteGameSdkPlayerDefaults } from "./game-sdk-player-defaults-store.ts";
import { deletePlayerStatsData } from "./player-stats-store.ts";
import { sdkServiceHeaders } from "./sdk-service-auth.ts";
import { sdkPortalInternalBaseUrl } from "./sdk-preview-runtime-source.ts";

async function revokeSdkAccount(playerId: string) {
  if (!process.env.SDK_ACCOUNT_LINK_SECRET) return;
  const url = `${sdkPortalInternalBaseUrl()}/api/internal/accounts`;
  const response = await fetch(url, {
    method: "DELETE",
    headers: {
      ...sdkServiceHeaders("DELETE", url),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ playerId }),
    cache: "no-store",
  });
  if (!response.ok) throw new Error("SDK_ACCOUNT_DELETION_UNAVAILABLE");
}

export async function deletePlayerDependentData(playerId: string) {
  await revokeSdkAccount(playerId);
  await Promise.all([
    deletePlayerStatsData(playerId),
    deletePlayerGameReplayData(playerId),
    deleteGameSdkPlayerDefaults(playerId),
  ]);
}

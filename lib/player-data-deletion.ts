import { deletePlayerGameReplayData } from "./game-replay-store.ts";
import { deleteGameSdkPlayerDefaults } from "./game-sdk-player-defaults-store.ts";
import { deletePlayerGameFeedbackData } from "./game-feedback-store.ts";
import { deleteGeneralGameWordHistory } from "./general-game-word-history-store.ts";
import { deletePlayerStatsData } from "./player-stats-store.ts";
import { deleteStoredRoomDefaults } from "./room-defaults-store.ts";
import { sdkServiceHeaders } from "./sdk-service-auth.ts";
import { sdkPortalInternalBaseUrl } from "./sdk-preview-runtime-source.ts";
import { deleteTahoiyaTopicHistory } from "./tahoiya-topic-history-store.ts";
import { deleteUserReportsForPlayer } from "./user-report-store.ts";
import { deleteUserReportDraftsForPlayer } from "./user-report-draft-store.ts";
import { deleteWordWolfTopicHistory } from "./wordwolf-topic-history-store.ts";

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
    deleteStoredRoomDefaults(playerId),
    deleteWordWolfTopicHistory(playerId),
    deleteTahoiyaTopicHistory(playerId),
    deleteGeneralGameWordHistory(playerId),
    deletePlayerGameFeedbackData(playerId),
    deleteUserReportsForPlayer(playerId),
    deleteUserReportDraftsForPlayer(playerId),
  ]);
}

import { loadGameDurationEstimates } from "@/lib/game-duration-store";
import { loadGameOperations } from "@/lib/game-operations-store";
import { loadApprovedGameSdkCatalog } from "@/lib/game-sdk-runtime-catalog";
import { loadSiteSettings } from "@/lib/site-settings-store";
import { assembleGameLobbyPageData } from "./game-lobby-page-data";

/** Server-only read model for the public built-in + approved SDK catalog. */
export function loadGameLobbyPageData() {
  return assembleGameLobbyPageData({
    loadApprovedGameSdkCatalog,
    loadSiteSettings,
    loadGameOperations,
    loadGameDurationEstimates,
  });
}

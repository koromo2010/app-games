import { loadGameDurationEstimates } from "@/lib/game-duration-store";
import { loadGameOperations } from "@/lib/game-operations-store";
import { loadSiteSettings } from "@/lib/site-settings-store";
import { assembleGameLobbyCriticalPageData } from "./game-lobby-page-data";

/** Server-only critical read model for the public built-in catalog. */
export function loadGameLobbyPageData() {
  return assembleGameLobbyCriticalPageData({
    loadSiteSettings,
    loadGameOperations,
    loadGameDurationEstimates,
  });
}

import { GameLobby } from "./GameLobby";
import { loadGameLobbyPageData } from "./load-game-lobby-page-data";

/** Shared Server Component used by /games and locale-rewritten top routes. */
export async function GameLobbyRoute() {
  const props = await loadGameLobbyPageData();
  return <GameLobby {...props} />;
}

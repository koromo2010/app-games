import { cookies } from "next/headers";
import registry from "@/config/game-registry.json";
import { loadGameOperation } from "@/lib/game-operations-store";
import { privateGameCookieMatches, privateGameCookieName } from "@/lib/private-game-access";

function registeredGame(gameId: string) {
  return registry.find((game) => game.id === gameId);
}

export function gameRequiresPrivateAccess(gameId: string) {
  return registeredGame(gameId)?.private === true;
}

export async function gamePageAccessAllowed(gameId: string) {
  if (!registeredGame(gameId)) return false;
  const store = await cookies();
  if ((await loadGameOperation(gameId)).mode !== "open") return false;
  if (!gameRequiresPrivateAccess(gameId)) return true;
  return privateGameCookieMatches(store.get(privateGameCookieName)?.value);
}

export async function gameApiAccessDeniedResponse(gameId: string) {
  return (await gamePageAccessAllowed(gameId))
    ? null
    : Response.json({ error: "Private access required" }, { status: 403 });
}

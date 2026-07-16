import { cookies } from "next/headers";
import registry from "@/config/game-registry.json";
import { loadGameOperation } from "@/lib/game-operations-store";
import { privateGameCookieMatches, privateGameCookieName } from "@/lib/private-game-access";

function registeredGame(gameId: string) {
  return registry.find((game) => game.id === gameId);
}

async function gameAccessState(gameId: string) {
  if (!registeredGame(gameId)) return "missing" as const;
  const store = await cookies();
  const operation = await loadGameOperation(gameId);
  if (operation.publication === "hidden") return "hidden" as const;
  if (operation.maintenance) return "maintenance" as const;
  if (operation.publication === "private" && !privateGameCookieMatches(store.get(privateGameCookieName)?.value)) return "private-locked" as const;
  return "allowed" as const;
}

export async function gamePageAccessAllowed(gameId: string) {
  return (await gameAccessState(gameId)) === "allowed";
}

export async function gameApiAccessDeniedResponse(gameId: string) {
  const state = await gameAccessState(gameId);
  if (state === "allowed") return null;
  if (state === "maintenance") return Response.json({ error: "Game is under maintenance" }, { status: 503, headers: { "Retry-After": "60" } });
  if (state === "private-locked") return Response.json({ error: "Private access required" }, { status: 403 });
  return Response.json({ error: "Game is not available" }, { status: 404 });
}

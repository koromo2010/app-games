"use client";

import { useEffect, useState } from "react";
import type { GameOperation } from "@/lib/game-operations";
import type { GameCatalogEntry } from "./game-catalog";
import { parseDeferredGameLobbyCatalog } from "./deferred-game-lobby-catalog";

type CatalogStatus = "not-requested" | "loading" | "ready" | "unavailable";

export function useDeferredGameLobbyCatalog(input: {
  endpoint?: string;
  initialGames: GameCatalogEntry[];
  initialOperations: GameOperation[];
}) {
  const [catalog, setCatalog] = useState({
    additionalGames: input.initialGames,
    gameOperations: input.initialOperations,
    status: (input.endpoint ? "loading" : "not-requested") as CatalogStatus,
  });

  useEffect(() => {
    if (!input.endpoint) return;
    const controller = new AbortController();
    let active = true;
    void fetch(input.endpoint, {
      cache: "no-cache",
      credentials: "omit",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("DEFERRED_GAME_CATALOG_UNAVAILABLE");
        const parsed = parseDeferredGameLobbyCatalog(await response.json());
        if (!parsed) throw new Error("DEFERRED_GAME_CATALOG_INVALID");
        return parsed;
      })
      .then((next) => {
        if (!active) return;
        setCatalog({
          additionalGames: next.additionalGames,
          gameOperations: next.gameOperations,
          status: "ready",
        });
      })
      .catch((error: unknown) => {
        if (!active || (error instanceof DOMException && error.name === "AbortError")) return;
        setCatalog((current) => ({ ...current, status: "unavailable" }));
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [input.endpoint]);

  return catalog;
}

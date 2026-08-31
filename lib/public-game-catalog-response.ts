import {
  publicGameCatalogCacheControl,
  publicGameCatalogEtag,
  publicGameCatalogVersion,
  requestAcceptsPublicGameCatalogVersion,
} from "./public-game-catalog-cache.ts";

export type PublicGameCatalogPayload<TGame, TOperation> = {
  sourceVersion: string;
  additionalGames: TGame[];
  gameOperations: TOperation[];
};

function responseHeaders(version: string) {
  return {
    "Cache-Control": publicGameCatalogCacheControl,
    ETag: publicGameCatalogEtag(version),
    Vary: "Accept-Encoding",
  };
}

/**
 * Every conditional request reloads the anonymous source data first. An
 * unchanged digest becomes a 304; a catalog or operation mutation changes the
 * digest and returns the new public payload immediately.
 */
export async function publicGameCatalogResponse<TGame, TOperation>(
  request: Request,
  loadCatalog: () => Promise<PublicGameCatalogPayload<TGame, TOperation>>,
) {
  try {
    const catalog = await loadCatalog();
    const version = publicGameCatalogVersion({
      sourceVersion: catalog.sourceVersion,
      additionalGames: catalog.additionalGames,
      gameOperations: catalog.gameOperations,
    });
    const headers = responseHeaders(version);
    if (requestAcceptsPublicGameCatalogVersion(
      request.headers.get("if-none-match"),
      headers.ETag,
    )) {
      return new Response(null, { status: 304, headers });
    }
    return Response.json({
      version,
      additionalGames: catalog.additionalGames,
      gameOperations: catalog.gameOperations,
    }, { headers });
  } catch {
    return Response.json(
      { error: "PUBLIC_GAME_CATALOG_UNAVAILABLE" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}

import { assembleDeferredGameLobbyCatalog } from "@/app/games/game-lobby-page-data";
import { loadGameOperations } from "@/lib/game-operations-store";
import { loadApprovedGameSdkCatalogSnapshot } from "@/lib/game-sdk-runtime-catalog";
import { publicGameCatalogResponse } from "@/lib/public-game-catalog-response";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  return publicGameCatalogResponse(request, () => (
    assembleDeferredGameLobbyCatalog({
      loadApprovedGameSdkCatalogSnapshot,
      loadGameOperations,
    })
  ));
}

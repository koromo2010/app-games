import { renderAuthorizedPreviewAsset } from "@/lib/preview-asset-response";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: {
    params: Promise<{
      instanceId: string;
      gameId: string;
      revision: string;
      assetPath?: string[];
    }>;
  },
) {
  const params = await context.params;
  const requestedParts = params.assetPath ?? [];
  if (requestedParts[0] !== "a") {
    return new Response("Preview asset token is required.", { status: 403 });
  }
  return renderAuthorizedPreviewAsset({
    request,
    scope: {
      instanceId: params.instanceId,
      gameId: params.gameId,
      revision: params.revision,
    },
    sourceKind: "mock",
    assetToken: requestedParts[1] ?? "",
    assetParts: requestedParts.slice(2),
  });
}

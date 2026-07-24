import { verifySdkPreviewToken } from "@game-fields/sdk-preview-auth";
import { cookies } from "next/headers";
import { fetchPreviewAsset, normalizePreviewAssetPath, previewContentType } from "@/lib/preview-source";
import {
  createPreviewAssetToken,
  previewAssetBasePath,
  previewContentSecurityPolicy,
  previewCookieName,
  previewSigningSecret,
  verifyPreviewAssetToken,
} from "@/lib/preview-security";
import { GAME_FIELDS_PRESET_ASSET, gameFieldsPresetRuntimeSource, injectGameFieldsPreset } from "@/lib/preset-runtime";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ instanceId: string; gameId: string; revision: string; assetPath?: string[] }> },
) {
  const params = await context.params;
  const scope = { instanceId: params.instanceId, gameId: params.gameId, revision: params.revision };
  const requestedParts = params.assetPath ?? [];
  const usesAssetToken = requestedParts[0] === "a";
  let assetToken = usesAssetToken ? requestedParts[1] ?? "" : "";
  const assetParts = usesAssetToken ? requestedParts.slice(2) : requestedParts;
  let grant: ReturnType<typeof verifySdkPreviewToken> = null;

  if (usesAssetToken) {
    try {
      if (!verifyPreviewAssetToken(assetToken, scope)) {
        return new Response("Preview asset session is invalid or expired.", { status: 403 });
      }
    } catch {
      return new Response("Preview runtime is not configured.", { status: 503 });
    }
  } else {
    const token = (await cookies()).get(previewCookieName(scope))?.value ?? "";
    try {
      grant = verifySdkPreviewToken(token, previewSigningSecret());
    } catch {
      return new Response("Preview runtime is not configured.", { status: 503 });
    }
    if (!grant
      || grant.audience !== "mock-client"
      || grant.instanceId !== params.instanceId
      || grant.gameId !== params.gameId
      || grant.revision !== params.revision) {
      return new Response("Preview session is invalid or expired.", { status: 403 });
    }
    assetToken = createPreviewAssetToken(grant);
  }

  const assetPath = normalizePreviewAssetPath(assetParts);
  if (!assetPath) return new Response("Invalid preview asset path.", { status: 400 });

  try {
    const isPresetAsset = assetPath === GAME_FIELDS_PRESET_ASSET;
    const content = isPresetAsset
      ? new TextEncoder().encode(gameFieldsPresetRuntimeSource()).buffer
      : await fetchPreviewAsset({ ...scope, assetPath });
    if (!content) return new Response("Preview asset was not found.", { status: 404 });
    const responseContent = assetPath.toLowerCase().endsWith(".html")
      ? injectGameFieldsPreset(
          new TextDecoder().decode(content),
          previewAssetBasePath(scope, assetToken),
        )
      : content;
    return new Response(responseContent, {
      headers: {
        "Content-Type": previewContentType(assetPath),
        "Cache-Control": "private, no-store",
        "Content-Security-Policy": previewContentSecurityPolicy(new URL(request.url).origin),
        "Cross-Origin-Resource-Policy": "cross-origin",
        "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
        "Referrer-Policy": "no-referrer",
        "X-Content-Type-Options": "nosniff",
        "X-Robots-Tag": "noindex, nofollow, noarchive",
      },
    });
  } catch {
    return new Response("Preview asset is temporarily unavailable.", { status: 502 });
  }
}

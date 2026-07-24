import { verifySdkPreviewToken } from "@game-fields/sdk-preview-auth";
import { cookies } from "next/headers";
import {
  fetchPreviewAsset,
  normalizePreviewAssetPath,
  previewContentType,
} from "@/lib/preview-source";
import { injectGameFieldsPackageClient } from "@/lib/package-client-runtime";
import {
  createPreviewAssetToken,
  packageAssetBasePath,
  packageCookieName,
  previewContentSecurityPolicy,
  previewSigningSecret,
  verifyPreviewAssetToken,
} from "@/lib/preview-security";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ instanceId: string; gameId: string; revision: string; assetPath?: string[] }> },
) {
  const params = await context.params;
  const scope = {
    instanceId: params.instanceId,
    gameId: params.gameId,
    revision: params.revision,
  };
  const requestedParts = params.assetPath ?? [];
  const usesAssetToken = requestedParts[0] === "a";
  let assetToken = usesAssetToken ? requestedParts[1] ?? "" : "";
  const assetParts = usesAssetToken ? requestedParts.slice(2) : requestedParts;
  let grant: ReturnType<typeof verifySdkPreviewToken> = null;

  if (usesAssetToken) {
    try {
      if (!verifyPreviewAssetToken(assetToken, scope)) {
        return new Response("Package asset session is invalid or expired.", { status: 403 });
      }
    } catch {
      return new Response("Package runtime is not configured.", { status: 503 });
    }
  } else {
    const token = (await cookies()).get(packageCookieName(scope))?.value ?? "";
    try {
      grant = verifySdkPreviewToken(token, previewSigningSecret());
    } catch {
      return new Response("Package runtime is not configured.", { status: 503 });
    }
    if (
      !grant
      || grant.audience !== "package-client"
      || grant.instanceId !== params.instanceId
      || grant.gameId !== params.gameId
      || grant.revision !== params.revision
    ) {
      return new Response("Package session is invalid or expired.", { status: 403 });
    }
    assetToken = createPreviewAssetToken(grant);
  }

  const assetPath = normalizePreviewAssetPath(assetParts);
  if (!assetPath) return new Response("Invalid package asset path.", { status: 400 });
  if (
    assetPath === "server.bundle.js"
    || assetPath === "game-fields-package.json"
    || assetPath.startsWith("source/")
  ) {
    return new Response("Package server asset is not browser-readable.", { status: 404 });
  }

  try {
    const content = await fetchPreviewAsset({
      ...scope,
      assetPath,
      sourceKind: "package",
    });
    if (!content) return new Response("Package asset was not found.", { status: 404 });
    const responseContent = assetPath.toLowerCase().endsWith(".html")
      ? injectGameFieldsPackageClient(
          new TextDecoder().decode(content),
          packageAssetBasePath(scope, assetToken),
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
    return new Response("Package asset is temporarily unavailable.", { status: 502 });
  }
}

import {
  GAME_FIELDS_PACKAGE_CLIENT_ASSET,
  gameFieldsPackageClientRuntimeSource,
} from "@/lib/package-client-runtime";
import {
  GAME_FIELDS_PRESET_ASSET,
  gameFieldsPresetRuntimeSource,
} from "@/lib/preset-runtime";
import {
  isBrowserReadablePreviewAsset,
  PreviewAssetReferenceError,
  rewritePreviewCssAssetUrls,
  rewritePreviewJavaScriptAssetUrls,
} from "@/lib/preview-asset-rewriter";
import {
  previewAssetTokenRejectionCode,
  previewAssetTokenVersionHint,
  recordPreviewAssetTokenEvent,
} from "@/lib/preview-asset-token-observability";
import {
  packageAssetPath,
  previewAssetCacheHeaders,
  previewAssetPath,
  resolvePreviewChildAssetToken,
  type PreviewAssetIdentity,
  type PreviewAssetSourceKind,
  verifyPreviewAssetToken,
} from "@/lib/preview-security";
import {
  fetchPreviewAsset,
  normalizePreviewAssetPath,
  previewContentType,
} from "@/lib/preview-source";

const PRIVATE_ERROR_HEADERS = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
};

export async function renderAuthorizedPreviewAsset({
  request,
  scope,
  sourceKind,
  assetToken,
  assetParts,
}: {
  request: Request;
  scope: PreviewAssetIdentity;
  sourceKind: PreviewAssetSourceKind;
  assetToken: string;
  assetParts: string[];
}) {
  const parsedRequestUrl = new URL(request.url);
  const telemetryContext = { route: parsedRequestUrl.pathname, method: request.method };
  if (parsedRequestUrl.search) {
    return new Response("Preview asset queries are not accepted.", {
      status: 400,
      headers: PRIVATE_ERROR_HEADERS,
    });
  }
  const assetPath = normalizePreviewAssetPath(assetParts);
  if (!assetPath) {
    return new Response("Invalid preview asset path.", {
      status: 400,
      headers: PRIVATE_ERROR_HEADERS,
    });
  }

  let capability;
  try {
    capability = verifyPreviewAssetToken(assetToken, {
      ...scope,
      sourceKind,
      assetPath,
    });
  } catch {
    recordPreviewAssetTokenEvent({
      action: "verify",
      version: previewAssetTokenVersionHint(assetToken),
      outcome: "failed",
      sourceKind,
      gameId: scope.gameId,
      revision: Number(scope.revision),
      assetPath,
      errorCode: "PREVIEW_ASSET_TOKEN_RUNTIME_NOT_CONFIGURED",
      context: telemetryContext,
    });
    return new Response("Preview runtime is not configured.", {
      status: 503,
      headers: PRIVATE_ERROR_HEADERS,
    });
  }
  if (!capability) {
    recordPreviewAssetTokenEvent({
      action: "verify",
      version: previewAssetTokenVersionHint(assetToken),
      outcome: "rejected",
      sourceKind,
      gameId: scope.gameId,
      revision: Number(scope.revision),
      assetPath,
      errorCode: previewAssetTokenRejectionCode(assetToken),
      context: telemetryContext,
    });
    return new Response("Preview asset capability is invalid or expired.", {
      status: 403,
      headers: PRIVATE_ERROR_HEADERS,
    });
  }
  recordPreviewAssetTokenEvent({
    action: "verify",
    version: capability.version,
    outcome: "success",
    sourceKind,
    gameId: scope.gameId,
    revision: Number(scope.revision),
    assetPath,
    context: telemetryContext,
  });
  if (!isBrowserReadablePreviewAsset(sourceKind, assetPath)) {
    return new Response("Preview asset was not found.", {
      status: 404,
      headers: PRIVATE_ERROR_HEADERS,
    });
  }

  const origin = parsedRequestUrl.origin;
  const signedAssetUrl = (childAssetPath: string) => {
    if (!isBrowserReadablePreviewAsset(sourceKind, childAssetPath)) {
      throw new PreviewAssetReferenceError();
    }
    const token = resolvePreviewChildAssetToken(
      assetToken,
      capability,
      {
        ...scope,
        sourceKind,
        assetPath: childAssetPath,
      },
    );
    const path = sourceKind === "package"
      ? packageAssetPath(scope, childAssetPath, token)
      : previewAssetPath(scope, childAssetPath, token);
    return new URL(path, origin).href;
  };

  try {
    const virtualSource = sourceKind === "package"
      && assetPath === GAME_FIELDS_PACKAGE_CLIENT_ASSET
      ? gameFieldsPackageClientRuntimeSource()
      : sourceKind === "mock" && assetPath === GAME_FIELDS_PRESET_ASSET
        ? gameFieldsPresetRuntimeSource()
        : null;
    const content = virtualSource === null
      ? await fetchPreviewAsset({
          ...scope,
          assetPath,
          ...(sourceKind === "package" ? { sourceKind: "package" as const } : {}),
        })
      : new TextEncoder().encode(virtualSource).buffer;
    if (!content) {
      return new Response("Preview asset was not found.", {
        status: 404,
        headers: PRIVATE_ERROR_HEADERS,
      });
    }

    const lowerPath = assetPath.toLowerCase();
    const responseContent = lowerPath.endsWith(".css")
      ? rewritePreviewCssAssetUrls(
          new TextDecoder().decode(content),
          assetPath,
          signedAssetUrl,
        )
      : lowerPath.endsWith(".js") || lowerPath.endsWith(".mjs")
        ? rewritePreviewJavaScriptAssetUrls(
            new TextDecoder().decode(content),
            assetPath,
            signedAssetUrl,
          )
        : content;
    return new Response(responseContent, {
      headers: {
        "Content-Type": previewContentType(assetPath),
        ...previewAssetCacheHeaders(capability.expiresAt),
        "Cross-Origin-Resource-Policy": "cross-origin",
        "Referrer-Policy": "no-referrer",
        "X-Content-Type-Options": "nosniff",
        "X-Robots-Tag": "noindex, nofollow, noarchive",
      },
    });
  } catch (error) {
    if (error instanceof PreviewAssetReferenceError) {
      return new Response("Preview asset contains an unsupported reference.", {
        status: 422,
        headers: PRIVATE_ERROR_HEADERS,
      });
    }
    return new Response("Preview asset is temporarily unavailable.", {
      status: 502,
      headers: PRIVATE_ERROR_HEADERS,
    });
  }
}

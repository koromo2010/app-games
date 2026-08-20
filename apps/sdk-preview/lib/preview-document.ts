import type { SdkPreviewGrant } from "@game-fields/sdk-preview-auth";
import { normalizeLegacyModuleUsageReview } from "@/lib/legacy-module-usage-review";
import {
  GAME_FIELDS_PACKAGE_CLIENT_ASSET,
  injectGameFieldsPackageClient,
} from "@/lib/package-client-runtime";
import {
  GAME_FIELDS_PRESET_ASSET,
  injectGameFieldsPreset,
} from "@/lib/preset-runtime";
import {
  isBrowserReadablePreviewAsset,
  previewInlineStyleAssetPaths,
  PreviewAssetReferenceError,
  rewritePreviewHtmlDocument,
} from "@/lib/preview-asset-rewriter";
import { previewAssetReferenceFailureResponse } from "@/lib/preview-document-error";
import { recordPreviewAssetTokenEvent } from "@/lib/preview-asset-token-observability";
import {
  createPreviewAssetToken,
  packageAssetPath,
  previewAssetPath,
  previewContentSecurityPolicy,
  previewInlineStyleHashes,
  type PreviewAssetSourceKind,
} from "@/lib/preview-security";
import {
  fetchPreviewAsset,
  previewContentType,
} from "@/lib/preview-source";

const DOCUMENT_ASSET_PATH = "index.html";

function previewDocumentHeaders(
  origin: string,
  inlineStyleHashes: readonly string[],
) {
  return {
    "Content-Type": previewContentType(DOCUMENT_ASSET_PATH),
    "Cache-Control": "private, no-store",
    "Content-Security-Policy": previewContentSecurityPolicy(
      origin,
      inlineStyleHashes,
    ),
    "Cross-Origin-Resource-Policy": "cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "X-Robots-Tag": "noindex, nofollow, noarchive",
  };
}

export async function renderAuthorizedPreviewDocument({
  requestUrl,
  grant,
  sourceKind,
}: {
  requestUrl: string;
  grant: SdkPreviewGrant;
  sourceKind: PreviewAssetSourceKind;
}) {
  const scope = {
    instanceId: grant.instanceId,
    gameId: grant.gameId,
    revision: grant.revision,
  };
  const parsedRequestUrl = new URL(requestUrl);
  const origin = parsedRequestUrl.origin;
  const telemetryContext = { route: parsedRequestUrl.pathname, method: "GET" };
  const runtimeAssetPath = sourceKind === "package"
    ? GAME_FIELDS_PACKAGE_CLIENT_ASSET
    : GAME_FIELDS_PRESET_ASSET;
  let runtimeCapability: ReturnType<typeof createPreviewAssetToken>;
  try {
    runtimeCapability = createPreviewAssetToken(
      grant,
      sourceKind,
      runtimeAssetPath,
    );
    recordPreviewAssetTokenEvent({
      action: "issue",
      version: "v2",
      outcome: "success",
      sourceKind,
      gameId: grant.gameId,
      revision: Number(grant.revision),
      assetPath: runtimeAssetPath,
      context: telemetryContext,
    });
  } catch {
    recordPreviewAssetTokenEvent({
      action: "issue",
      version: "v2",
      outcome: "failed",
      sourceKind,
      gameId: grant.gameId,
      revision: Number(grant.revision),
      assetPath: runtimeAssetPath,
      errorCode: "PREVIEW_ASSET_TOKEN_ISSUE_FAILED",
      context: telemetryContext,
    });
    return new Response("Preview link is invalid or expired.", { status: 403 });
  }
  const signedAssetUrl = (assetPath: string) => {
    if (!isBrowserReadablePreviewAsset(sourceKind, assetPath)) {
      throw new PreviewAssetReferenceError();
    }
    const capability = assetPath === runtimeAssetPath
      ? runtimeCapability
      : createPreviewAssetToken(grant, sourceKind, assetPath);
    if (assetPath !== runtimeAssetPath) {
      recordPreviewAssetTokenEvent({
        action: "issue",
        version: "v2",
        outcome: "success",
        sourceKind,
        gameId: grant.gameId,
        revision: Number(grant.revision),
        assetPath,
        context: telemetryContext,
      });
    }
    const path = sourceKind === "package"
      ? packageAssetPath(scope, assetPath, capability.token)
      : previewAssetPath(scope, assetPath, capability.token);
    return new URL(path, origin).href;
  };

  try {
    const content = await fetchPreviewAsset({
      ...scope,
      assetPath: DOCUMENT_ASSET_PATH,
      ...(sourceKind === "package" ? { sourceKind: "package" as const } : {}),
    });
    if (!content) {
      return new Response("Preview document was not found.", { status: 404 });
    }

    const source = normalizeLegacyModuleUsageReview(
      new TextDecoder().decode(content),
    );
    const inlineStyleAssetPaths = previewInlineStyleAssetPaths(
      source,
      DOCUMENT_ASSET_PATH,
    );
    const inlineStyleAssetAvailability = await Promise.all(
      inlineStyleAssetPaths.map(async (assetPath) => ({
        assetPath,
        content: await fetchPreviewAsset({
          ...scope,
          assetPath,
          ...(sourceKind === "package" ? { sourceKind: "package" as const } : {}),
        }),
      })),
    );
    if (inlineStyleAssetAvailability.some((asset) => !asset.content)) {
      throw new PreviewAssetReferenceError("INLINE_STYLE_ASSET_MISSING");
    }
    const rewritten = rewritePreviewHtmlDocument(
      source,
      DOCUMENT_ASSET_PATH,
      signedAssetUrl,
      new Set(inlineStyleAssetAvailability.map((asset) => asset.assetPath)),
    );
    const inlineStyleHashes = previewInlineStyleHashes(
      rewritten.inlineStyleContents,
    );
    const responseContent = sourceKind === "package"
      ? injectGameFieldsPackageClient(
          rewritten.html,
          signedAssetUrl(GAME_FIELDS_PACKAGE_CLIENT_ASSET),
        )
      : injectGameFieldsPreset(
          rewritten.html,
          signedAssetUrl(GAME_FIELDS_PRESET_ASSET),
        );

    return new Response(responseContent, {
      status: 200,
      headers: previewDocumentHeaders(origin, inlineStyleHashes),
    });
  } catch (error) {
    if (error instanceof PreviewAssetReferenceError) {
      return previewAssetReferenceFailureResponse(error.code);
    }
    return new Response("Preview document is temporarily unavailable.", { status: 502 });
  }
}

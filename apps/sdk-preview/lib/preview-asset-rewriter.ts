import {
  analyzeGamePackageHtmlDocument,
  GamePackageHtmlPolicyError,
  isBrowserReadableGamePackageAsset,
  normalizeGamePackageAssetReference,
  rewriteGamePackageHtmlDocument,
  type GamePackageDocumentReferenceContext,
} from "@game-fields/sdk-package-assets";

const GAME_FIELDS_PRESET_ASSET = "game-fields/preset.js";
type PreviewAssetSourceKind = "mock" | "package";

const JAVASCRIPT_LOCAL_ASSET_REFERENCE = new RegExp(
  `(["'])((?:\\.{1,2}\\/|\\/)[^"'\\\\\\r\\n]+)\\1`,
  "gi",
);

export class PreviewAssetReferenceError extends Error {
  readonly code: PreviewAssetReferenceErrorCode;

  constructor(code: PreviewAssetReferenceErrorCode = "PREVIEW_ASSET_REFERENCE_INVALID") {
    super(code);
    this.name = "PreviewAssetReferenceError";
    this.code = code;
  }
}

export type PreviewAssetReferenceErrorCode =
  | "PREVIEW_ASSET_REFERENCE_INVALID"
  | "HTML_PARSE_ERROR"
  | "BASE_ELEMENT_UNSUPPORTED"
  | "INLINE_SCRIPT_UNSUPPORTED"
  | "EVENT_HANDLER_UNSUPPORTED"
  | "STYLE_ATTRIBUTE_UNSUPPORTED"
  | "INLINE_STYLE_PARSE_ERROR"
  | "INLINE_STYLE_ASSET_OUTSIDE_ROOT"
  | "INLINE_STYLE_ASSET_INVALID"
  | "INLINE_STYLE_ASSET_MISSING"
  | "INLINE_STYLE_ASSET_NOT_BROWSER_READABLE";

function normalizeAssetPath(parts: readonly string[]) {
  if (parts.length === 0 || parts.length > 20) return null;
  const normalized: string[] = [];
  for (const part of parts) {
    if (
      !part
      || part === "."
      || part === ".."
      || part.length > 120
      || !/^[A-Za-z0-9][A-Za-z0-9._@()+, -]*$/.test(part)
    ) {
      return null;
    }
    normalized.push(part);
  }
  const path = normalized.join("/");
  return path.length <= 500 ? path : null;
}

export function isBrowserReadablePreviewAsset(
  sourceKind: PreviewAssetSourceKind,
  assetPath: string,
) {
  if (sourceKind === "package") {
    return isBrowserReadableGamePackageAsset(assetPath);
  }
  if (
    assetPath === (
      GAME_FIELDS_PRESET_ASSET
    )
  ) {
    return true;
  }
  if (
    assetPath === "index.html"
    || assetPath === "server.bundle.js"
    || assetPath === "game-fields-package.json"
    || assetPath === "preview.json"
    || assetPath.startsWith("source/")
  ) {
    return false;
  }
  return isBrowserReadableGamePackageAsset(assetPath);
}

function resolvedReference(
  reference: string,
  parentAssetPath: string,
  context: GamePackageDocumentReferenceContext = "html-attribute",
) {
  const local = normalizeGamePackageAssetReference(parentAssetPath, reference);
  if (!local) return null;
  if (local.outside) {
    throw new PreviewAssetReferenceError(
      context === "inline-style" && local.path
        ? "INLINE_STYLE_ASSET_OUTSIDE_ROOT"
        : context === "inline-style"
          ? "INLINE_STYLE_ASSET_INVALID"
          : "PREVIEW_ASSET_REFERENCE_INVALID",
    );
  }
  if (!normalizeAssetPath(local.path.split("/"))) {
    throw new PreviewAssetReferenceError(
      context === "inline-style"
        ? "INLINE_STYLE_ASSET_INVALID"
        : "PREVIEW_ASSET_REFERENCE_INVALID",
    );
  }
  if (!/(?:^|\/)[^/]+\.[A-Za-z0-9]{1,8}$/.test(local.path)) {
    if (context === "inline-style") {
      throw new PreviewAssetReferenceError("INLINE_STYLE_ASSET_INVALID");
    }
    return null;
  }
  if (!isBrowserReadableGamePackageAsset(local.path)) {
    throw new PreviewAssetReferenceError(
      context === "inline-style"
        ? "INLINE_STYLE_ASSET_NOT_BROWSER_READABLE"
        : "PREVIEW_ASSET_REFERENCE_INVALID",
    );
  }
  return local;
}

function signedReference(
  reference: string,
  parentAssetPath: string,
  signedAssetUrl: (assetPath: string) => string,
  context: GamePackageDocumentReferenceContext = "html-attribute",
  availableInlineStyleAssetPaths?: ReadonlySet<string>,
) {
  const local = resolvedReference(reference, parentAssetPath, context);
  if (!local) return reference;
  if (
    context === "inline-style"
    && !availableInlineStyleAssetPaths?.has(local.path)
  ) {
    throw new PreviewAssetReferenceError("INLINE_STYLE_ASSET_MISSING");
  }
  return `${signedAssetUrl(local.path)}${local.fragment}`;
}

function policyError(error: unknown): never {
  if (error instanceof PreviewAssetReferenceError) throw error;
  if (error instanceof GamePackageHtmlPolicyError) {
    throw new PreviewAssetReferenceError(error.code);
  }
  throw error;
}

export function previewInlineStyleAssetPaths(
  html: string,
  documentAssetPath: string,
) {
  try {
    const analysis = analyzeGamePackageHtmlDocument(html, documentAssetPath);
    if (analysis.issues[0]) {
      throw new GamePackageHtmlPolicyError(analysis.issues[0]);
    }
    const paths = new Set<string>();
    for (const reference of analysis.references) {
      if (reference.context !== "inline-style") continue;
      const local = resolvedReference(
        reference.reference,
        reference.parent,
        reference.context,
      );
      if (local) paths.add(local.path);
    }
    return [...paths].sort();
  } catch (error) {
    policyError(error);
  }
}

export function rewritePreviewHtmlDocument(
  html: string,
  documentAssetPath: string,
  signedAssetUrl: (assetPath: string) => string,
  availableInlineStyleAssetPaths: ReadonlySet<string> = new Set(),
) {
  try {
    return rewriteGamePackageHtmlDocument(
      html,
      documentAssetPath,
      (reference) => signedReference(
        reference.reference,
        reference.parent,
        signedAssetUrl,
        reference.context,
        availableInlineStyleAssetPaths,
      ),
    );
  } catch (error) {
    policyError(error);
  }
}

export function rewritePreviewHtmlAssetUrls(
  html: string,
  documentAssetPath: string,
  signedAssetUrl: (assetPath: string) => string,
  availableInlineStyleAssetPaths: ReadonlySet<string> = new Set(),
) {
  return rewritePreviewHtmlDocument(
    html,
    documentAssetPath,
    signedAssetUrl,
    availableInlineStyleAssetPaths,
  ).html;
}

export function rewritePreviewCssAssetUrls(
  css: string,
  stylesheetAssetPath: string,
  signedAssetUrl: (assetPath: string) => string,
) {
  let output = css.replace(
    /url\(\s*(?:(["'])(.*?)\1|([^)]*?))\s*\)/gi,
    (_match, _quote: string | undefined, quoted: string | undefined, bare: string | undefined) => {
      const reference = quoted ?? bare ?? "";
      return `url("${signedReference(
        reference,
        stylesheetAssetPath,
        signedAssetUrl,
      )}")`;
    },
  );
  output = output.replace(
    /(@import\s+)(["'])([^"']+)\2/gi,
    (_match, prefix: string, quote: string, reference: string) => (
      `${prefix}${quote}${signedReference(
        reference,
        stylesheetAssetPath,
        signedAssetUrl,
      )}${quote}`
    ),
  );
  return output;
}

export function rewritePreviewJavaScriptAssetUrls(
  source: string,
  scriptAssetPath: string,
  signedAssetUrl: (assetPath: string) => string,
) {
  let output = source.replace(
    /(\b(?:import|export)\s+(?:[^"'()]*?\s+from\s*)?)(["'])([^"']+)\2/g,
    (_match, prefix: string, quote: string, reference: string) => (
      `${prefix}${quote}${signedReference(
        reference,
        scriptAssetPath,
        signedAssetUrl,
      )}${quote}`
    ),
  );
  output = output.replace(
    /(\bimport\s*\(\s*)(["'])([^"']+)\2(\s*\))/g,
    (
      _match,
      prefix: string,
      quote: string,
      reference: string,
      suffix: string,
    ) => (
      `${prefix}${quote}${signedReference(
        reference,
        scriptAssetPath,
        signedAssetUrl,
      )}${quote}${suffix}`
    ),
  );
  output = output.replace(
    JAVASCRIPT_LOCAL_ASSET_REFERENCE,
    (_match, quote: string, reference: string) => (
      `${quote}${signedReference(
        reference,
        scriptAssetPath,
        signedAssetUrl,
      )}${quote}`
    ),
  );
  return output;
}

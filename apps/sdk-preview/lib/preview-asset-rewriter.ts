import {
  isBrowserReadableGamePackageAsset,
  normalizeGamePackageAssetReference,
} from "@game-fields/sdk-package-assets";

const GAME_FIELDS_PRESET_ASSET = "game-fields/preset.js";
type PreviewAssetSourceKind = "mock" | "package";

const JAVASCRIPT_LOCAL_ASSET_REFERENCE = new RegExp(
  `(["'])((?:\\.{1,2}\\/|\\/)[^"'\\\\\\r\\n]+)\\1`,
  "gi",
);

export class PreviewAssetReferenceError extends Error {
  constructor() {
    super("PREVIEW_ASSET_REFERENCE_INVALID");
    this.name = "PreviewAssetReferenceError";
  }
}

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

function signedReference(
  reference: string,
  parentAssetPath: string,
  signedAssetUrl: (assetPath: string) => string,
) {
  const local = normalizeGamePackageAssetReference(parentAssetPath, reference);
  if (!local) return reference;
  if (local.outside || !normalizeAssetPath(local.path.split("/"))) {
    throw new PreviewAssetReferenceError();
  }
  if (!/(?:^|\/)[^/]+\.[A-Za-z0-9]{1,8}$/.test(local.path)) {
    return reference;
  }
  if (!isBrowserReadableGamePackageAsset(local.path)) {
    throw new PreviewAssetReferenceError();
  }
  return `${signedAssetUrl(local.path)}${local.fragment}`;
}

function rejectInlineExecutableContent(html: string) {
  if (
    /<base\b/i.test(html)
    || /<style\b/i.test(html)
    || /\sstyle\s*=/i.test(html)
    || /\son[a-z]+\s*=/i.test(html)
    || /<script\b(?![^>]*\bsrc\s*=)[^>]*>/i.test(html)
  ) {
    throw new PreviewAssetReferenceError();
  }
}

export function rewritePreviewHtmlAssetUrls(
  html: string,
  documentAssetPath: string,
  signedAssetUrl: (assetPath: string) => string,
) {
  rejectInlineExecutableContent(html);
  let output = html.replace(
    /(\s(?:src|href|poster)\s*=\s*)(["'])([^"']+)\2/gi,
    (_match, prefix: string, quote: string, reference: string) => (
      `${prefix}${quote}${signedReference(
        reference,
        documentAssetPath,
        signedAssetUrl,
      )}${quote}`
    ),
  );
  output = output.replace(
    /(\ssrcset\s*=\s*)(["'])([^"']+)\2/gi,
    (_match, prefix: string, quote: string, value: string) => {
      const rewritten = value.split(",").map((candidate) => {
        const match = candidate.trim().match(/^(\S+)([\s\S]*)$/);
        if (!match) return candidate;
        return `${signedReference(
          match[1],
          documentAssetPath,
          signedAssetUrl,
        )}${match[2]}`;
      }).join(", ");
      return `${prefix}${quote}${rewritten}${quote}`;
    },
  );
  return output;
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

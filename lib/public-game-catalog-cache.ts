import { createHash } from "node:crypto";

export const publicGameCatalogCacheControl = "public, max-age=0, must-revalidate";

/**
 * Produces a public, opaque identity for cache revalidation. The input must be
 * limited to public catalog and visibility data; callers never pass auth state
 * or user-specific values into this digest.
 */
export function publicGameCatalogVersion(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function publicGameCatalogEtag(version: string) {
  return `"${version}"`;
}

export function requestAcceptsPublicGameCatalogVersion(
  ifNoneMatch: string | null,
  etag: string,
) {
  if (!ifNoneMatch) return false;
  return ifNoneMatch
    .split(",")
    .map((candidate) => candidate.trim())
    .some((candidate) => candidate === etag || candidate === `W/${etag}`);
}

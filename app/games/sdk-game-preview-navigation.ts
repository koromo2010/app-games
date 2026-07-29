const SDK_PACKAGE_REVISION_PATTERN = /^[a-f0-9]{40}$/;

export function isSdkPackageRevision(value: unknown): value is string {
  return typeof value === "string" && SDK_PACKAGE_REVISION_PATTERN.test(value);
}

export function sdkGamePreviewHref(input: {
  creatorSlug: string;
  gameId: string;
  revision?: string | null;
}) {
  const path = `/sdk-preview/${input.creatorSlug}/games/${input.gameId}`;
  return isSdkPackageRevision(input.revision)
    ? `${path}?revision=${encodeURIComponent(input.revision)}`
    : path;
}

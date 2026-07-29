export type PreviewRuntimeResolutionInput<TPackage, TLegacy> = {
  requestedRevision?: string;
  resolvePackageRevision: (
    revision?: string,
  ) => Promise<TPackage | undefined>;
  resolveLegacyPreview: () => Promise<TLegacy | undefined>;
};

/**
 * The normal creator route and a revision-pinned route must resolve package
 * runtimes through the same immutable package-revision lookup. Legacy mock
 * preview is allowed only when the normal route has no package revision.
 * Resolver failures intentionally propagate instead of falling back.
 */
export async function resolvePreviewRuntime<TPackage, TLegacy>({
  requestedRevision,
  resolvePackageRevision,
  resolveLegacyPreview,
}: PreviewRuntimeResolutionInput<TPackage, TLegacy>) {
  const packageRuntime = await resolvePackageRevision(requestedRevision);
  if (packageRuntime || requestedRevision) return packageRuntime;
  return resolveLegacyPreview();
}

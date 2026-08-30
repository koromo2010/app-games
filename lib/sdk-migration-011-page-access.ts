import {
  isCanonicalDevelopmentPlatformRuntime,
  type SdkMigration011PlatformRuntimeIdentity,
} from "./sdk-migration-011-proxy.ts";

export type SdkMigration011PageAccessDependencies = {
  runtimeIdentity(): SdkMigration011PlatformRuntimeIdentity;
  requireRecentMfa(): Promise<void>;
};

export async function requireSdkMigration011PageAccess(
  dependencies: SdkMigration011PageAccessDependencies,
) {
  if (!isCanonicalDevelopmentPlatformRuntime(dependencies.runtimeIdentity())) {
    throw new Error("DEVELOPMENT_RUNTIME_REQUIRED");
  }
  await dependencies.requireRecentMfa();
}

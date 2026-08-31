import {
  isCanonicalDevelopmentPlatformRuntime,
  type SdkMigration011PlatformRuntimeIdentity,
} from "./sdk-migration-011-proxy.ts";

export type SdkMigration011PageAccessDependencies = {
  runtimeIdentity(): SdkMigration011PlatformRuntimeIdentity;
  requireFullSession(): Promise<{ recentMfa: boolean }>;
};

export type SdkMigration011PageAccess = "ready" | "step-up-required";

export async function requireSdkMigration011PageAccess(
  dependencies: SdkMigration011PageAccessDependencies,
): Promise<SdkMigration011PageAccess> {
  if (!isCanonicalDevelopmentPlatformRuntime(dependencies.runtimeIdentity())) {
    throw new Error("DEVELOPMENT_RUNTIME_REQUIRED");
  }
  const session = await dependencies.requireFullSession();
  return session.recentMfa ? "ready" : "step-up-required";
}

import {
  isCanonicalDevelopmentPlatformRuntime,
  type SdkMigration011PlatformRuntimeIdentity,
} from "./sdk-migration-011-proxy.ts";

export type DevelopmentPrivateWorkspaceImportPageAccess = "ready" | "step-up-required";

export async function requireDevelopmentPrivateWorkspaceImportPageAccess(
  dependencies: {
    runtimeIdentity(): SdkMigration011PlatformRuntimeIdentity;
    requireFullSession(): Promise<{ recentMfa: boolean }>;
  },
): Promise<DevelopmentPrivateWorkspaceImportPageAccess> {
  if (!isCanonicalDevelopmentPlatformRuntime(dependencies.runtimeIdentity())) {
    throw new Error("DEVELOPMENT_RUNTIME_REQUIRED");
  }
  const session = await dependencies.requireFullSession();
  return session.recentMfa ? "ready" : "step-up-required";
}

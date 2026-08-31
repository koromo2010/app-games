export type ProductionPrivateWorkspaceImportPageMode = "preparation" | "execution";
export type ProductionPrivateWorkspaceImportPageAccess = "ready" | "step-up-required";

export type ProductionPrivateWorkspaceImportRuntimeIdentity = {
  semanticEnvironment?: string;
  vercelEnvironment?: string;
  project?: string;
  ref?: string;
};

export function productionPrivateWorkspaceImportPageMode(
  identity: ProductionPrivateWorkspaceImportRuntimeIdentity,
): ProductionPrivateWorkspaceImportPageMode | null {
  if (
    identity.semanticEnvironment === "development"
    && identity.vercelEnvironment === "production"
    && identity.project === "app-games-dev"
    && identity.ref === "develop"
  ) return "preparation";
  if (
    identity.semanticEnvironment === "production"
    && identity.vercelEnvironment === "production"
    && identity.project === "app-games"
    && identity.ref === "main"
  ) return "execution";
  return null;
}

export async function requireProductionPrivateWorkspaceImportPageAccess(
  mode: ProductionPrivateWorkspaceImportPageMode,
  requireFullSession: () => Promise<{ recentMfa: boolean }>,
): Promise<ProductionPrivateWorkspaceImportPageAccess> {
  const session = await requireFullSession();
  return mode === "execution" && !session.recentMfa ? "step-up-required" : "ready";
}

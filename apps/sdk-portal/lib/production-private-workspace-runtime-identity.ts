import promotionProjects from "../../../config/main-promotion-projects.json" with { type: "json" };

type SdkProductionRuntimeEnvironment = NodeJS.ProcessEnv;

export type SdkProductionRuntimeIdentity = {
  environment: "production";
  sourceCommit: string;
};

const productionSdkPortal = promotionProjects.projects.find(
  (project) => project.role === "production-sdk-portal",
);
const sourceCommitPattern = /^[0-9a-f]{40}$/;

/**
 * Resolve the SDK Portal's Production runtime only from deployment-provided
 * identity and the repository's project map. APP_ENV is a Platform semantic
 * marker and is intentionally not part of this SDK-specific decision.
 */
export function resolveSdkProductionRuntimeIdentity(
  environment: SdkProductionRuntimeEnvironment = process.env,
): SdkProductionRuntimeIdentity | null {
  const sourceCommit = environment.VERCEL_GIT_COMMIT_SHA ?? "";
  if (
    !productionSdkPortal
    || environment.VERCEL_ENV !== "production"
    || environment.VERCEL_PROJECT_NAME !== productionSdkPortal.project
    || environment.VERCEL_GIT_COMMIT_REF !== productionSdkPortal.branch
    || !sourceCommitPattern.test(sourceCommit)
    || /^0+$/.test(sourceCommit)
  ) return null;

  return {
    environment: "production",
    sourceCommit,
  };
}

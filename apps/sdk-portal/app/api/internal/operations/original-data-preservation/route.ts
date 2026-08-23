import { createGamePackageRuntimeReader } from "@/lib/mock-git-store";
import { resolveSdkDatabaseBinding } from "@/lib/sdk-database-binding-diagnostic";
import { sdkSql } from "@/lib/sdk-postgres";
import { requireSdkServiceRequest } from "@/lib/sdk-service-auth";
import { processOriginalDataPreservationRequest } from "@/lib/original-data-preservation-route";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

function runtimeIdentity() {
  const sourceRef = process.env.VERCEL_GIT_COMMIT_REF?.trim() ?? "";
  const production = sourceRef === "main"
    && process.env.VERCEL_ENV === "production";
  const sourceMainCommit = process.env.VERCEL_GIT_COMMIT_SHA?.trim() ?? "";
  return {
    environment: production ? "production" as const : "development" as const,
    sourceRef,
    sourceMainCommit,
    sourceDeploymentIdentity: process.env.VERCEL_URL?.trim()
      || sourceMainCommit,
  };
}

export async function POST(request: Request) {
  return processOriginalDataPreservationRequest(request, {
    authorize: (incoming) => requireSdkServiceRequest(incoming, { expectedEnvironment: "production" }),
    runtimeIdentity,
    databaseContext: () => ({
      sql: sdkSql(),
      binding: resolveSdkDatabaseBinding(),
    }),
    serviceSecret: () => process.env.SDK_ACCOUNT_LINK_SECRET ?? "",
    artifactReader: () => createGamePackageRuntimeReader(),
  });
}

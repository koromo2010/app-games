import {
  AppReleaseArtifactTransferError,
  probeDevelopmentPackageArtifactSource,
} from "@/lib/app-release-artifact-transfer";
import {
  GamePackageGitTargetError,
  probeGamePackageGitWriteTarget,
} from "@/lib/mock-git-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  if (process.env.VERCEL_GIT_COMMIT_REF !== "main") {
    return Response.json(
      { error: "APP_RELEASE_ARTIFACT_HEALTH_MAIN_ONLY" },
      { status: 403 },
    );
  }
  try {
    await Promise.all([
      probeDevelopmentPackageArtifactSource(),
      probeGamePackageGitWriteTarget(),
    ]);
    return Response.json({
      service: "game-fields-sdk-app-release-artifacts",
      status: "ok",
      developmentSource: "ok",
      mainTarget: "ok",
    }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const code = error instanceof AppReleaseArtifactTransferError
      ? error.code
      : error instanceof GamePackageGitTargetError
        ? error.code
      : "APP_RELEASE_ARTIFACT_SOURCE_UNAVAILABLE";
    const sourceUnavailable = error instanceof AppReleaseArtifactTransferError;
    return Response.json({
      service: "game-fields-sdk-app-release-artifacts",
      status: "unavailable",
      developmentSource: sourceUnavailable ? "unavailable" : "ok",
      mainTarget: sourceUnavailable ? "unknown" : "unavailable",
      code,
    }, {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  }
}

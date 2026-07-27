import {
  AppReleaseArtifactTransferError,
  probeDevelopmentPackageArtifactSource,
} from "@/lib/app-release-artifact-transfer";

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
    await probeDevelopmentPackageArtifactSource();
    return Response.json({
      service: "game-fields-sdk-app-release-artifacts",
      status: "ok",
      developmentSource: "ok",
    }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const code = error instanceof AppReleaseArtifactTransferError
      ? error.code
      : "APP_RELEASE_ARTIFACT_SOURCE_UNAVAILABLE";
    return Response.json({
      service: "game-fields-sdk-app-release-artifacts",
      status: "unavailable",
      developmentSource: "unavailable",
      code,
    }, {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  }
}

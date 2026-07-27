import { requireSdkServiceRequest } from "@/lib/sdk-service-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    requireSdkServiceRequest(request);
  } catch {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }
  if (process.env.VERCEL_GIT_COMMIT_REF !== "develop") {
    return Response.json(
      { error: "APP_RELEASE_ARTIFACT_SOURCE_DEVELOPMENT_ONLY" },
      { status: 403 },
    );
  }
  return Response.json({
    service: "game-fields-sdk-development-package-artifacts",
    status: "ok",
    channel: "development",
  }, {
    headers: { "Cache-Control": "private, no-store" },
  });
}

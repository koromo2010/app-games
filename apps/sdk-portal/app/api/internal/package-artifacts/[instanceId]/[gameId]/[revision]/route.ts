import {
  listGamePackageFilesAtRevision,
  readGamePackageFileAtRevision,
} from "@/lib/mock-git-store";
import { requireSdkServiceRequest } from "@/lib/sdk-service-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function authorize(request: Request) {
  try {
    requireSdkServiceRequest(request);
    return null;
  } catch {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }
}

export async function GET(
  request: Request,
  context: {
    params: Promise<{
      instanceId: string;
      gameId: string;
      revision: string;
    }>;
  },
) {
  const denied = authorize(request);
  if (denied) return denied;
  if (process.env.VERCEL_GIT_COMMIT_REF !== "develop") {
    return Response.json(
      { error: "APP_RELEASE_ARTIFACT_SOURCE_DEVELOPMENT_ONLY" },
      { status: 403 },
    );
  }
  const { instanceId, gameId, revision } = await context.params;
  try {
    const requestedPath = new URL(request.url).searchParams.get("path");
    if (!requestedPath) {
      const files = await listGamePackageFilesAtRevision({
        instanceId,
        gameId,
        revision,
      });
      return Response.json({ revision, files }, {
        headers: { "Cache-Control": "private, no-store" },
      });
    }
    const content = await readGamePackageFileAtRevision({
      instanceId,
      gameId,
      revision,
      path: requestedPath,
    });
    if (!content) {
      return Response.json(
        { error: "APP_RELEASE_ARTIFACT_FILE_NOT_FOUND" },
        { status: 404 },
      );
    }
    return new Response(new Uint8Array(content), {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Length": String(content.byteLength),
        "Content-Type": "application/octet-stream",
      },
    });
  } catch {
    return Response.json(
      { error: "APP_RELEASE_ARTIFACT_SOURCE_UNAVAILABLE" },
      { status: 503 },
    );
  }
}

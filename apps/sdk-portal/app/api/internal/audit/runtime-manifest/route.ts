import { RuntimeArtifactError } from "@game-fields/sdk-runtime-artifact";
import { loadRuntimeManifestAudit } from "@/lib/runtime-manifest-audit";
import { requireSdkServiceRequest } from "@/lib/sdk-service-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const GAME = /^[a-z][a-z0-9-]{1,63}$/;
const REVISION = /^[a-f0-9]{40}$/;
const headers = { "Cache-Control": "private, no-store" };

export async function GET(request: Request) {
  try {
    requireSdkServiceRequest(request);
  } catch {
    return Response.json({ error: "forbidden" }, { status: 403, headers });
  }
  const parameters = new URL(request.url).searchParams;
  const gameId = parameters.get("gameId") ?? "";
  const revision = parameters.get("revision") ?? "";
  if (
    [...parameters.keys()].length !== 2
    || parameters.getAll("gameId").length !== 1
    || parameters.getAll("revision").length !== 1
    || !GAME.test(gameId)
    || !REVISION.test(revision)
  ) {
    return Response.json({ error: "SDK_AUDIT_QUERY_INVALID" }, { status: 400, headers });
  }
  try {
    return Response.json(await loadRuntimeManifestAudit(gameId, revision), { headers });
  } catch (error) {
    const code = error instanceof RuntimeArtifactError ? error.code : "UNAVAILABLE";
    const status = code === "RELEASE_NOT_FOUND" || code === "COMMIT_NOT_FOUND" || code === "PATH_NOT_FOUND" ? 404 : code.endsWith("MISMATCH") ? 409 : 422;
    return Response.json({ error: `SDK_RUNTIME_ARTIFACT_${code}` }, { status, headers });
  }
}

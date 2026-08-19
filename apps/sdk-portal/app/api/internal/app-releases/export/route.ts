import { requireSdkServiceRequest } from "@/lib/sdk-service-auth";
import { findCurrentAppReleaseForExport } from "@/lib/app-release-store";
import { createGamePackageRuntimeReader } from "@/lib/mock-git-store";
import { prepareOperatorPackageExport } from "@/lib/operator-package-export";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function input(request: Request) {
  const params = new URL(request.url).searchParams;
  return {
    publicGameId: params.get("publicGameId") ?? "",
    lineageId: params.get("lineageId") ?? "",
    revision: params.get("revision") ?? "",
    packageRootSha256: params.get("packageRootSha256") ?? "",
    serverBundleSha256: params.get("serverBundleSha256") ?? "",
    appSetSourceSha256: params.get("appSetSourceSha256") ?? "",
  };
}

export async function GET(request: Request) {
  try {
    requireSdkServiceRequest(request);
  } catch {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }
  if (process.env.VERCEL_GIT_COMMIT_REF !== "main") {
    return Response.json({ error: "APP_RELEASE_MAIN_ONLY" }, { status: 403 });
  }
  const result = await prepareOperatorPackageExport(input(request), {
    findCurrent: findCurrentAppReleaseForExport,
    reader: createGamePackageRuntimeReader(),
  });
  if (result.status !== "ok") {
    const status = result.status === "input_invalid" ? 400 : result.status === "not_found" ? 404 : 422;
    const error = result.status === "input_invalid"
      ? "APP_RELEASE_EXPORT_INPUT_INVALID"
      : result.status === "not_found"
        ? "APP_RELEASE_EXPORT_NOT_FOUND"
        : "APP_RELEASE_EXPORT_UNAVAILABLE";
    return Response.json({ error }, { status });
  }
  return new Response(new Uint8Array(result.archive), {
    status: 200,
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${result.filename}"`,
      "X-Content-Type-Options": "nosniff",
    },
  });
}

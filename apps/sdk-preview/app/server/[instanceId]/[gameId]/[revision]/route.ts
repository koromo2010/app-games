import { createHash } from "node:crypto";
import type { GameSdkPortableServerRequest } from "@game-fields/game-sdk/portable-server";
import { fetchPreviewAsset } from "@/lib/preview-source";
import { verifyPortalPreviewGrant } from "@/lib/preview-grant-verifier";
import {
  GameSdkPortableRunnerError,
  runGameSdkPortableServer,
} from "@/lib/server-runner";
import {
  logServerRuntimeAuthFailure,
  serverRuntimeAuthFailure,
} from "@/lib/server-runtime-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 10;

const MAX_REQUEST_BYTES = 1024 * 1024;

function bearerToken(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  return authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
}

export async function POST(
  request: Request,
  context: { params: Promise<{ instanceId: string; gameId: string; revision: string }> },
) {
  const params = await context.params;
  let grant;
  try {
    grant = await verifyPortalPreviewGrant(bearerToken(request));
  } catch {
    return Response.json({ error: "SERVER_RUNTIME_NOT_CONFIGURED" }, { status: 503 });
  }
  const authFailure = serverRuntimeAuthFailure(grant, {
    environment: (
      process.env.VERCEL_GIT_COMMIT_REF === "main"
        ? "production"
        : "development"
    ),
    instanceId: params.instanceId,
    gameId: params.gameId,
    revision: params.revision,
  });
  if (authFailure || !grant) {
    const failure = authFailure ?? "TOKEN_INVALID";
    logServerRuntimeAuthFailure(failure, "invoke");
    const error = failure === "TOKEN_INVALID"
      ? "SERVER_RUNTIME_TOKEN_INVALID"
      : failure === "AUDIENCE_INVALID" || failure === "ROLE_INVALID"
        ? "SERVER_RUNTIME_GRANT_ROLE_INVALID"
        : failure === "ENVIRONMENT_MISMATCH"
          ? "SERVER_RUNTIME_GRANT_ENVIRONMENT_INVALID"
          : "SERVER_RUNTIME_GRANT_SCOPE_INVALID";
    return Response.json({ error }, { status: 403 });
  }

  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_REQUEST_BYTES) {
    return Response.json({ error: "SERVER_RUNTIME_REQUEST_TOO_LARGE" }, { status: 413 });
  }

  let invocation: GameSdkPortableServerRequest;
  try {
    const body = await request.text();
    if (new TextEncoder().encode(body).byteLength > MAX_REQUEST_BYTES) {
      return Response.json({ error: "SERVER_RUNTIME_REQUEST_TOO_LARGE" }, { status: 413 });
    }
    invocation = JSON.parse(body) as GameSdkPortableServerRequest;
  } catch {
    return Response.json({ error: "SERVER_RUNTIME_INVALID_REQUEST" }, { status: 400 });
  }

  try {
    const bundleBytes = await fetchPreviewAsset({
      ...params,
      assetPath: "server.bundle.js",
      sourceKind: "package",
    });
    if (!bundleBytes) {
      return Response.json({ error: "SERVER_RUNTIME_BUNDLE_NOT_FOUND" }, { status: 404 });
    }
    const bundleSha256 = createHash("sha256")
      .update(new Uint8Array(bundleBytes))
      .digest("hex");
    if (bundleSha256 !== grant.bundleSha256) {
      return Response.json({ error: "SERVER_RUNTIME_BUNDLE_HASH_MISMATCH" }, { status: 409 });
    }
    const result = await runGameSdkPortableServer({
      bundle: new TextDecoder().decode(bundleBytes),
      request: invocation,
    });
    return Response.json(result, {
      headers: {
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "X-Robots-Tag": "noindex, nofollow, noarchive",
      },
    });
  } catch (error) {
    const code = error instanceof GameSdkPortableRunnerError
      ? error.code
      : "INVALID_BUNDLE";
    const status = code === "BUNDLE_TOO_LARGE" || code === "REQUEST_TOO_LARGE"
      ? 413
      : code === "EXECUTION_LIMIT"
        ? 408
        : 422;
    return Response.json({ error: `SERVER_RUNTIME_${code}` }, { status });
  }
}

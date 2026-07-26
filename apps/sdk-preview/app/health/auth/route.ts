import { verifySdkPreviewToken } from "@game-fields/sdk-preview-auth";
import { previewSigningSecret } from "@/lib/preview-security";
import {
  logServerRuntimeAuthFailure,
  serverRuntimeAuthFailure,
} from "@/lib/server-runtime-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SIGNING_PROBE_SCOPE = {
  instanceId: "health-check",
  gameId: "health-check",
  revision: "0".repeat(40),
} as const;

function bearerToken(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  return authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
}

export function POST(request: Request) {
  let grant;
  try {
    grant = verifySdkPreviewToken(bearerToken(request), previewSigningSecret());
  } catch {
    return Response.json(
      { error: "SDK_PREVIEW_SIGNING_NOT_CONFIGURED" },
      { status: 503 },
    );
  }
  const failure = serverRuntimeAuthFailure(grant, {
    environment: process.env.VERCEL_GIT_COMMIT_REF === "main"
      ? "production"
      : "development",
    ...SIGNING_PROBE_SCOPE,
  });
  if (failure) {
    logServerRuntimeAuthFailure(failure, "health-check");
    return Response.json(
      { error: "SDK_PREVIEW_SIGNING_MISMATCH" },
      { status: 503 },
    );
  }
  return new Response(null, {
    status: 204,
    headers: { "Cache-Control": "no-store" },
  });
}

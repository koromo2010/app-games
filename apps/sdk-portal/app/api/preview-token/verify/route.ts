import {
  verifySdkPreviewToken,
} from "@game-fields/sdk-preview-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_REQUEST_BYTES = 4 * 1024;

function previewSigningSecret() {
  const secret = process.env.SDK_PREVIEW_SIGNING_SECRET?.trim() ?? "";
  if (!secret) throw new Error("SDK_PREVIEW_SIGNING_NOT_CONFIGURED");
  return secret;
}

function expectedEnvironment() {
  return process.env.VERCEL_GIT_COMMIT_REF === "main"
    ? "production" as const
    : "development" as const;
}

export async function POST(request: Request) {
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_REQUEST_BYTES) {
    return Response.json(
      { error: "PREVIEW_TOKEN_REQUEST_TOO_LARGE" },
      { status: 413 },
    );
  }

  let token = "";
  try {
    const body = await request.text();
    if (new TextEncoder().encode(body).byteLength > MAX_REQUEST_BYTES) {
      return Response.json(
        { error: "PREVIEW_TOKEN_REQUEST_TOO_LARGE" },
        { status: 413 },
      );
    }
    const payload = JSON.parse(body) as { token?: unknown };
    token = typeof payload.token === "string" ? payload.token : "";
  } catch {
    return Response.json(
      { error: "PREVIEW_TOKEN_REQUEST_INVALID" },
      { status: 400 },
    );
  }

  let grant;
  try {
    grant = verifySdkPreviewToken(token, previewSigningSecret());
  } catch {
    return Response.json(
      { error: "PREVIEW_TOKEN_VERIFIER_NOT_CONFIGURED" },
      { status: 503 },
    );
  }
  if (!grant || grant.environment !== expectedEnvironment()) {
    return Response.json(
      { error: "PREVIEW_TOKEN_INVALID" },
      { status: 403 },
    );
  }

  return Response.json({ grant }, {
    headers: { "Cache-Control": "private, no-store" },
  });
}

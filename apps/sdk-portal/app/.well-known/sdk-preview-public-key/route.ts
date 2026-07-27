import {
  sdkPreviewPublicKey,
} from "@game-fields/sdk-preview-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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

export async function GET() {
  try {
    return Response.json({
      algorithm: "Ed25519",
      environment: expectedEnvironment(),
      publicKey: sdkPreviewPublicKey(previewSigningSecret()),
      version: 4,
    }, {
      headers: {
        "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return Response.json(
      { error: "SDK_PREVIEW_PUBLIC_KEY_NOT_CONFIGURED" },
      {
        status: 503,
        headers: { "Cache-Control": "private, no-store" },
      },
    );
  }
}

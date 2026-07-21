import { verifySdkPreviewToken } from "@game-fields/sdk-preview-auth";
import { NextResponse, type NextRequest } from "next/server";
import { previewCookieName, previewCookiePath, previewSigningSecret } from "@/lib/preview-security";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ instanceId: string; gameId: string; revision: string }> },
) {
  const params = await context.params;
  const token = request.nextUrl.searchParams.get("token") ?? "";
  let grant;
  try {
    grant = verifySdkPreviewToken(token, previewSigningSecret());
  } catch {
    return new Response("Preview runtime is not configured.", { status: 503 });
  }
  if (!grant
    || grant.instanceId !== params.instanceId
    || grant.gameId !== params.gameId
    || grant.revision !== params.revision) {
    return new Response("Preview link is invalid or expired.", { status: 403 });
  }

  const destination = new URL(`${previewCookiePath(grant)}index.html`, request.url);
  destination.search = "";
  const response = NextResponse.redirect(destination, 307);
  response.cookies.set({
    name: previewCookieName(grant),
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: previewCookiePath(grant),
    maxAge: Math.max(1, Math.floor((grant.expiresAt - Date.now()) / 1000)),
  });
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  return response;
}

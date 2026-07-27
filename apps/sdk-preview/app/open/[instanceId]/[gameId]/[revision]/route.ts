import { NextResponse, type NextRequest } from "next/server";
import { verifyPortalPreviewGrant } from "@/lib/preview-grant-verifier";
import {
  previewExchangePageResponse,
  readPreviewExchangeToken,
} from "@/lib/preview-exchange";
import {
  createPreviewClientSessionToken,
  previewCookieName,
  previewCookiePath,
} from "@/lib/preview-security";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
) {
  if (request.nextUrl.search) {
    return new Response("Query credentials are not accepted.", { status: 400 });
  }
  return previewExchangePageResponse(request.url);
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ instanceId: string; gameId: string; revision: string }> },
) {
  const params = await context.params;
  const token = await readPreviewExchangeToken(request);
  if (!token) {
    return Response.json({ error: "PREVIEW_EXCHANGE_INVALID" }, { status: 400 });
  }
  let grant;
  try {
    grant = await verifyPortalPreviewGrant(token);
  } catch {
    return new Response("Preview runtime is not configured.", { status: 503 });
  }
  if (!grant
    || grant.audience !== "mock-client"
    || grant.instanceId !== params.instanceId
    || grant.gameId !== params.gameId
    || grant.revision !== params.revision) {
    return new Response("Preview link is invalid or expired.", { status: 403 });
  }

  const session = createPreviewClientSessionToken(grant);
  const destination = new URL(`${previewCookiePath(grant)}index.html`, request.url);
  destination.search = "";
  const response = NextResponse.redirect(destination, 303);
  response.cookies.set({
    name: previewCookieName(grant),
    value: session.token,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: previewCookiePath(grant),
    maxAge: Math.max(1, Math.floor((session.expiresAt - Date.now()) / 1000)),
  });
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  return response;
}

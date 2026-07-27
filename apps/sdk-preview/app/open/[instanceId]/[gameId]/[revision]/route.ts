import type { NextRequest } from "next/server";
import { renderAuthorizedPreviewDocument } from "@/lib/preview-document";
import { verifyPortalPreviewGrant } from "@/lib/preview-grant-verifier";
import {
  previewExchangePageResponse,
  readPreviewExchangeToken,
} from "@/lib/preview-exchange";

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

  return renderAuthorizedPreviewDocument({
    requestUrl: request.url,
    grant,
    sourceKind: "mock",
  });
}

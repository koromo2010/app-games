import {
  createSdkPortalHandshakeDescriptor,
  negotiateSdkPortalHandshake,
} from "@/lib/sdk-handshake";

export const dynamic = "force-dynamic";

const publicHeaders = {
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Origin": "*",
  "Cache-Control": "no-store",
};

export function GET(request: Request) {
  const origin = new URL(request.url).origin;
  return Response.json(createSdkPortalHandshakeDescriptor(origin), {
    headers: publicHeaders,
  });
}

export async function POST(request: Request) {
  const origin = new URL(request.url).origin;
  const body = await request.json().catch(() => null);
  const result = negotiateSdkPortalHandshake(body, origin);
  return Response.json(result, {
    status: result.accepted ? 200 : 409,
    headers: publicHeaders,
  });
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: publicHeaders });
}


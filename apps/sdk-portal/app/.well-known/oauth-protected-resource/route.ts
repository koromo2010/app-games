import { portalBaseUrl, SDK_SCOPES } from "@/lib/oauth-store";

export function GET(request: Request) {
  const base = portalBaseUrl(new URL(request.url).origin);
  return Response.json({ resource: `${base}/api/mcp`, authorization_servers: [base], scopes_supported: SDK_SCOPES });
}

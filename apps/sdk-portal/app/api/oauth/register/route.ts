import { registerOAuthClient } from "@/lib/oauth-store";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { client_name?: unknown; redirect_uris?: unknown } | null;
  const redirectUris = Array.isArray(body?.redirect_uris) ? body.redirect_uris.filter((v): v is string => typeof v === "string") : [];
  try {
    const clientId = await registerOAuthClient({ clientName: typeof body?.client_name === "string" ? body.client_name : undefined, redirectUris });
    return Response.json({ client_id: clientId, client_name: body?.client_name ?? "AI client", redirect_uris: redirectUris, token_endpoint_auth_method: "none" }, { status: 201 });
  } catch {
    return Response.json({ error: "invalid_redirect_uri" }, { status: 400 });
  }
}

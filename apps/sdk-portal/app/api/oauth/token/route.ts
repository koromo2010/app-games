import { exchangeAuthorizationCode, refreshAccessToken } from "@/lib/oauth-store";

export async function POST(request: Request) {
  const form = await request.formData();
  const grantType = String(form.get("grant_type") ?? "");
  const clientId = String(form.get("client_id") ?? "");
  const result = grantType === "authorization_code"
    ? await exchangeAuthorizationCode({ code: String(form.get("code") ?? ""), clientId, redirectUri: String(form.get("redirect_uri") ?? ""), codeVerifier: String(form.get("code_verifier") ?? "") })
    : grantType === "refresh_token"
      ? await refreshAccessToken(String(form.get("refresh_token") ?? ""), clientId)
      : null;
  if (!result) return Response.json({ error: "invalid_grant" }, { status: 400 });
  return Response.json({ access_token: result.accessToken, token_type: "Bearer", expires_in: result.expiresIn, refresh_token: result.refreshToken, scope: result.scope }, { headers: { "Cache-Control": "no-store" } });
}

import { createAuthorizationCode, normalizeScope, validateOAuthClient } from "@/lib/oauth-store";
import { getSdkAccountSession } from "@/lib/account-session";

function params(url: URL) {
  return {
    clientId: url.searchParams.get("client_id") ?? "",
    redirectUri: url.searchParams.get("redirect_uri") ?? "",
    state: url.searchParams.get("state") ?? "",
    scope: normalizeScope(url.searchParams.get("scope")),
    challenge: url.searchParams.get("code_challenge") ?? "",
    challengeMethod: url.searchParams.get("code_challenge_method") ?? "",
    audience: url.searchParams.get("resource") ?? `${url.origin}/api/mcp`,
  };
}

function escape(value: string) { return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!); }

export async function GET(request: Request) {
  const url = new URL(request.url);
  const p = params(url);
  if (!p.clientId || !p.redirectUri || !p.challenge || p.challengeMethod !== "S256" || !p.scope || p.audience !== `${url.origin}/api/mcp` || !await validateOAuthClient(p.clientId, p.redirectUri)) {
    return Response.json({ error: "invalid_request" }, { status: 400 });
  }
  const account = await getSdkAccountSession();
  if (!account) {
    const target = `/api/oauth/authorize?${url.searchParams.toString()}`;
    return Response.redirect(new URL(`/api/account-link/start?returnTo=${encodeURIComponent(target)}`, url.origin), 303);
  }
  const html = `<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Game Fields SDKを許可</title><style>body{font-family:system-ui;background:#f5f7fb;color:#15213b;margin:0}.card{max-width:560px;margin:10vh auto;background:white;border:1px solid #dce3ef;border-radius:20px;padding:32px;box-shadow:0 14px 40px #1f345018}button{width:100%;padding:14px;border:0;border-radius:12px;background:#2456d7;color:#fff;font-weight:700;font-size:16px}small{color:#60708c}</style><main class="card"><h1>制作クライアントを接続</h1><p><strong>${escape(account.playerName ?? "Game Fields利用者")}</strong>として、ChatGPT WorkまたはCodexにゲーム制作操作を許可します。</p><ul><li>制作者URLの予約・確定</li><li>本人のSDK環境へのモック保存・更新</li></ul><p><small>本体DB、管理画面、他の利用者の環境にはアクセスできません。連携は後から解除できます。</small></p><form method="post"><input type="hidden" name="client_id" value="${escape(p.clientId)}"><input type="hidden" name="redirect_uri" value="${escape(p.redirectUri)}"><input type="hidden" name="state" value="${escape(p.state)}"><input type="hidden" name="scope" value="${escape(p.scope)}"><input type="hidden" name="audience" value="${escape(p.audience)}"><input type="hidden" name="code_challenge" value="${escape(p.challenge)}"><button type="submit">この制作クライアントを許可</button></form></main></html>`;
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const form = await request.formData();
  const clientId = String(form.get("client_id") ?? "");
  const redirectUri = String(form.get("redirect_uri") ?? "");
  const state = String(form.get("state") ?? "");
  const scope = normalizeScope(String(form.get("scope") ?? ""));
  const codeChallenge = String(form.get("code_challenge") ?? "");
  const audience = String(form.get("audience") ?? "");
  const account = await getSdkAccountSession();
  if (!account || !scope || !codeChallenge || audience !== `${new URL(request.url).origin}/api/mcp` || !await validateOAuthClient(clientId, redirectUri)) return Response.json({ error: "invalid_request" }, { status: 400 });
  const code = await createAuthorizationCode({ clientId, redirectUri, playerId: account.playerId, scope, codeChallenge, audience });
  const callback = new URL(redirectUri);
  callback.searchParams.set("code", code);
  if (state) callback.searchParams.set("state", state);
  return Response.redirect(callback, 303);
}

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("SDK OAuth discovery requires authorization code with S256 PKCE", () => {
  const metadata = read("apps/sdk-portal/app/.well-known/oauth-authorization-server/route.ts");
  const authorize = read("apps/sdk-portal/app/api/oauth/authorize/route.ts");
  assert.match(metadata, /authorization_code/);
  assert.match(metadata, /refresh_token/);
  assert.match(metadata, /S256/);
  assert.match(authorize, /challengeMethod !== "S256"/);
});

test("SDK MCP challenges unauthenticated callers and scopes mock publication", () => {
  const mcp = read("apps/sdk-portal/app/api/mcp/route.ts");
  assert.match(mcp, /WWW-Authenticate/);
  assert.match(mcp, /oauth-protected-resource/);
  assert.match(mcp, /name === "publish_mock"/);
  assert.match(mcp, /name: "get_sdk_handshake"/);
  assert.match(mcp, /name === "get_sdk_handshake"/);
  assert.match(mcp, /accepted=true/);
  assert.match(mcp, /name: "list_creator_environments"/);
  assert.match(mcp, /name === "list_creator_environments"/);
  assert.match(mcp, /listCreatorEnvironments\(playerId\)/);
  assert.match(mcp, /includes\("sdk:mock"\)/);
  assert.match(mcp, /authenticateCreatorOwner\(slug, playerId\)/);
  assert.match(mcp, /SUPPORTED_PROTOCOL_VERSIONS/);
  assert.match(mcp, /body\.params\?\.protocolVersion/);
  assert.match(mcp, /listChanged: false/);
  assert.match(mcp, /readOnlyHint: true/);
  assert.match(mcp, /title: "ゲームモックの保存"/);
  assert.match(mcp, /creatorUrl, gameUrl, previewUrl: gameUrl/);
});

test("DownloadMe contains no embedded credential placeholders", () => {
  const entry = read("sdk/entry/START_GAME_FIELDS.md");
  assert.match(entry, /__SDK_PORTAL_BASE_URL__\/api\/mcp/);
  assert.match(entry, /get_sdk_handshake/);
  assert.match(entry, /"handshakeVersion": __SDK_HANDSHAKE_VERSION__/);
  assert.match(entry, /"environment": "__SDK_ENVIRONMENT__"/);
  assert.match(entry, /accepted.*true/);
  assert.doesNotMatch(entry, /__GAME_FIELDS_AGENT_TOKEN__/);
  assert.doesNotMatch(entry, /GAME_FIELDS_AGENT_TOKEN=/);
});

test("SDK Portal distributes the current DownloadMe revision", () => {
  const page = read("apps/sdk-portal/app/page.tsx");
  const nextConfig = read("apps/sdk-portal/next.config.ts");
  const syncScript = read("apps/sdk-portal/scripts/sync-download.mjs");

  for (const source of [page, nextConfig, syncScript]) {
    assert.match(source, /GameFieldsDownloadMe-ver7\.md/);
    assert.doesNotMatch(source, /GameFieldsDownloadMe-ver[23456]\.md/);
  }
  const download = read("apps/sdk-portal/public/GameFieldsDownloadMe-ver7.md");
  assert.match(download, /DownloadMe: `ver7`/);
  assert.match(download, /`downloadMeVersion`が`7`/);
  assert.doesNotMatch(download, /解除可|任意へ|必須解除/);
});

test("SDK Portal exposes one public handshake contract before authenticated tools", () => {
  const route = read("apps/sdk-portal/app/.well-known/game-fields-sdk/route.ts");
  const handshake = read("apps/sdk-portal/lib/sdk-handshake.ts");
  assert.match(route, /negotiateSdkPortalHandshake/);
  assert.match(route, /result\.accepted \? 200 : 409/);
  assert.match(route, /Access-Control-Allow-Origin/);
  assert.match(handshake, /GAME_FIELDS_SDK_HANDSHAKE_VERSION/);
  assert.match(handshake, /surface: "creator-portal"/);
  assert.match(handshake, /sdkPortalEnvironment/);
});

test("DownloadMe makes the creator environment the primary link", () => {
  const entry = read("sdk/entry/START_GAME_FIELDS.md");
  assert.match(entry, /\[あなたのGame Fields環境を開く\]\(SDKから返されたcreatorUrl\)/);
  assert.match(entry, /\[今回のゲームを直接開く\]\(SDKから返されたgameUrl\)/);
  assert.match(entry, /最初の案内には使わず`creatorUrl`を優先/);
});

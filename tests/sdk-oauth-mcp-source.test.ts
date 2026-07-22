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
  assert.doesNotMatch(entry, /__GAME_FIELDS_AGENT_TOKEN__/);
  assert.doesNotMatch(entry, /GAME_FIELDS_AGENT_TOKEN=/);
});

test("SDK Portal distributes the current DownloadMe revision", () => {
  const page = read("apps/sdk-portal/app/page.tsx");
  const nextConfig = read("apps/sdk-portal/next.config.ts");
  const syncScript = read("apps/sdk-portal/scripts/sync-download.mjs");

  for (const source of [page, nextConfig, syncScript]) {
    assert.match(source, /GameFieldsDownloadMe-ver5\.md/);
    assert.doesNotMatch(source, /GameFieldsDownloadMe-ver[234]\.md/);
  }
});

test("DownloadMe makes the creator environment the primary link", () => {
  const entry = read("sdk/entry/START_GAME_FIELDS.md");
  assert.match(entry, /\[あなたのGame Fields環境を開く\]\(SDKから返されたcreatorUrl\)/);
  assert.match(entry, /\[今回のゲームを直接開く\]\(SDKから返されたgameUrl\)/);
  assert.match(entry, /最初の案内には使わず`creatorUrl`を優先/);
});

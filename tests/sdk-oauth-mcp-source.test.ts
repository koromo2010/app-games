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
  assert.match(mcp, /enum: \[\.\.\.SDK_PORTAL_CAPABILITIES\]/);
  assert.match(mcp, /DownloadMe記載の必要機能だけ/);
  assert.match(mcp, /enumの全候補を要求せず/);
  assert.match(mcp, /accepted=true/);
  assert.match(mcp, /toolが遅延読み込み/);
  assert.match(mcp, /gameapp-dev get_sdk_handshake Game Fields SDK接続互換性でtool検索/);
  assert.match(mcp, /明示的な検索後/);
  assert.match(mcp, /新しいチャット/);
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
  assert.match(mcp, /parseSdkMockPreviewManifest\(gameId, args\.files\)/);
  assert.match(mcp, /manifest = EXCLUDED\.manifest/);
  assert.match(mcp, /creatorUrl, gameUrl, previewUrl: gameUrl/);
});

test("SDK Portal persists app-declared settings and exposes them to preview", () => {
  const parser = read("apps/sdk-portal/lib/mock-preview-manifest.ts");
  const runtime = read("apps/sdk-portal/app/api/preview-runtime/[instanceId]/[gameId]/route.ts");
  assert.match(parser, /preview\.json/);
  assert.match(parser, /requireTimeLimit: true/);
  assert.match(runtime, /legacyTimeLimitFallback: true/);
  assert.match(runtime, /settings: parseGameSdkSettingDefinitions/);
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
    assert.match(source, /GameFieldsDownloadMe-ver9\.md/);
    assert.doesNotMatch(source, /GameFieldsDownloadMe-ver[2345678]\.md/);
  }
  const download = read("apps/sdk-portal/public/GameFieldsDownloadMe-ver9.md");
  assert.match(download, /DownloadMe: `ver9`/);
  assert.match(download, /`downloadMeVersion`が`9`/);
  assert.match(download, /必要になるまで遅延読み込み/);
  assert.match(download, /tool検索・発見機能で`gameapp-dev get_sdk_handshake Game Fields SDK接続互換性`を検索/);
  assert.match(download, /最初のtool一覧に名前がないことだけを根拠に、未接続や旧版と判定してはいけません/);
  assert.match(download, /明示的なtool検索を実行しても/);
  assert.match(download, /`gameapp-dev`プラグインが古い/);
  assert.match(download, /プラグイン管理画面で`gameapp-dev`を更新/);
  assert.match(download, /更新後に新しいチャットを開いて/);
  assert.match(download, /このDownloadMeをもう一度添付/);
  assert.match(download, /`requiredCapabilities`は以下の4件をそのまま送り/);
  assert.doesNotMatch(download, /解除可|任意へ|必須解除/);
  assert.match(nextConfig, /legacyDownloadMePaths/);
  assert.match(nextConfig, /GameFieldsDownloadMe-ver\$\{index \+ 1\}\.md/);
  assert.match(nextConfig, /destination: currentDownloadMePath/);
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
  assert.match(handshake, /export const SDK_PORTAL_CAPABILITIES/);
  assert.match(handshake, /capabilities: SDK_PORTAL_CAPABILITIES/);
});

test("DownloadMe makes the creator environment the primary link", () => {
  const entry = read("sdk/entry/START_GAME_FIELDS.md");
  assert.match(entry, /\[あなたのGame Fields環境を開く\]\(SDKから返されたcreatorUrl\)/);
  assert.match(entry, /\[今回のゲームを直接開く\]\(SDKから返されたgameUrl\)/);
  assert.match(entry, /最初の案内には使わず`creatorUrl`を優先/);
});

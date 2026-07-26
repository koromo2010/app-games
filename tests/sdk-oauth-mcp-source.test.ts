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
  assert.match(authorize, /本番採用.*アクセスできません/);
  assert.doesNotMatch(authorize, /Candidateを同一revisionのままdevelopmentへ昇格/);
});

test("SDK MCP challenges unauthenticated callers and scopes mock publication", () => {
  const mcp = read("apps/sdk-portal/app/api/mcp/route.ts");
  const packageStore = read("apps/sdk-portal/lib/game-package-store.ts");
  const dashboardSubmit = read("apps/sdk-portal/app/api/dashboard/games/[instanceId]/[gameId]/submit/route.ts");
  const dashboard = read("apps/sdk-portal/app/dashboard/page.tsx");
  assert.match(mcp, /WWW-Authenticate/);
  assert.match(mcp, /oauth-protected-resource/);
  assert.match(mcp, /name === "publish_mock"/);
  assert.match(mcp, /name: "publish_game_package"/);
  assert.match(mcp, /saveCreatorGamePackage/);
  assert.doesNotMatch(mcp, /name: "promote_game_package_to_development"/);
  assert.doesNotMatch(mcp, /promoteGamePackage/);
  assert.match(packageStore, /appSetSourceSha256/);
  assert.match(packageStore, /ready-for-submission/);
  assert.doesNotMatch(packageStore, /status = 'submitted'/);
  assert.match(dashboardSubmit, /package_app_set_sha256/);
  assert.match(dashboardSubmit, /status = 'submitted'/);
  assert.match(dashboardSubmit, /authenticateCreatorOwner/);
  assert.match(dashboardSubmit, /r\.revision IS DISTINCT FROM g\.package_revision/);
  assert.match(dashboard, /<SubmitGameButton/);
  assert.match(mcp, /immutableAppSet: true/);
  assert.match(mcp, /name: "get_sdk_handshake"/);
  assert.match(mcp, /name === "get_sdk_handshake"/);
  assert.match(mcp, /name: "search_sdk_help"/);
  assert.match(mcp, /name === "search_sdk_help"/);
  assert.match(mcp, /searchSdkHelp\(query, limit\)/);
  assert.doesNotMatch(mcp, /enum: \[\.\.\.SDK_PORTAL_CAPABILITIES\]/);
  assert.match(mcp, /固定enumではなく/);
  assert.match(mcp, /CAPABILITY_UNAVAILABLE/);
  assert.match(mcp, /DownloadMe記載の必要機能だけ/);
  assert.match(mcp, /将来の機能名も送信でき/);
  assert.match(mcp, /accepted=true/);
  assert.match(mcp, /toolが遅延読み込み/);
  assert.match(mcp, /gameapp-dev get_sdk_handshake Game Fields SDK接続互換性でtool検索/);
  assert.match(mcp, /明示的な検索後/);
  assert.match(mcp, /新しいチャット/);
  assert.match(mcp, /既存チャットのtool schemaはプラグイン更新後も差し替わりません/);
  assert.match(mcp, /name: "list_creator_environments"/);
  assert.match(mcp, /name === "list_creator_environments"/);
  assert.match(mcp, /listCreatorEnvironments\(playerId\)/);
  assert.match(mcp, /includes\("sdk:mock"\)/);
  assert.match(mcp, /authenticateCreatorOwner\(slug, playerId\)/);
  assert.doesNotMatch(mcp, /expectedPackageRootSha256/);
  assert.doesNotMatch(mcp, /expectedServerBundleSha256/);
  assert.doesNotMatch(mcp, /expectedAppSetSourceSha256/);
  assert.doesNotMatch(mcp, /sdkPortalEnvironment\(origin\) !== "development"/);
  assert.doesNotMatch(mcp, /promote_game_package_to_stable/);
  assert.match(mcp, /SUPPORTED_PROTOCOL_VERSIONS/);
  assert.match(mcp, /body\.params\?\.protocolVersion/);
  assert.match(mcp, /listChanged: false/);
  assert.match(mcp, /readOnlyHint: true/);
  assert.match(mcp, /title: "ゲームモックの保存"/);
  assert.match(mcp, /parseSdkMockPreviewManifest\(gameId, args\.files\)/);
  assert.match(mcp, /manifest = EXCLUDED\.manifest/);
  assert.match(mcp, /creatorUrl, gameUrl, previewUrl: gameUrl/);
});

test("SDK Help uses one source for the creator UI and AI answers", () => {
  const help = read("apps/sdk-portal/lib/sdk-help.ts");
  const helpPage = read("apps/sdk-portal/app/help/page.tsx");
  const dashboard = read("apps/sdk-portal/app/dashboard/page.tsx");
  assert.match(help, /package-candidate-and-formal-submission/);
  assert.match(help, /publish_game_packageで「提出候補」/);
  assert.match(help, /これは正式提出ではありません/);
  assert.match(help, /制作者本人がSDKのマイゲーム画面/);
  assert.match(helpPage, /SDK_HELP_ENTRIES\.map/);
  assert.match(dashboard, /href="\/help"/);
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
    assert.match(source, /GameFieldsDownloadMe-ver15\.md/);
    assert.doesNotMatch(source, /GameFieldsDownloadMe-ver[2345678]\.md/);
  }
  const download = read("apps/sdk-portal/public/GameFieldsDownloadMe-ver15.md");
  assert.match(download, /# GF-AECP\/15/);
  assert.match(download, /HUMAN_DOCUMENTATION := false/);
  assert.match(download, /downloadMeVersion == 15/);
  assert.match(download, /IF surface == Work AND get_sdk_handshake not_loaded/);
  assert.match(download, /WORK_DISCOVERY_QUERY := "gameapp-dev get_sdk_handshake Game Fields SDK接続互換性"/);
  assert.match(download, /CALL tool検索\(WORK_DISCOVERY_QUERY\)/);
  assert.match(download, /discovered\(gameapp-dev\.\*\) AND NOT discovered\(gameapp-dev\.get_sdk_handshake\)/);
  assert.match(download, /`gameapp-dev`のtool schemaがこのDownloadMeより古い/);
  assert.match(download, /プラグイン管理画面で`gameapp-dev`を更新/);
  assert.match(download, /現在のチャットを閉じて新しいWork／Codexチャットを作成/);
  assert.match(download, /更新ボタンを押しても既存チャットのtool schemaは差し替わりません/);
  assert.match(download, /schema_accepts_all\(C0\.capabilityVector\)/);
  assert.match(download, /GameFieldsDownloadMe-ver15\.mdだけを添付/);
  assert.match(download, /bilingual standardResult\.presentation\.reason/);
  assert.match(download, /保存済みの制作者環境とゲームは、新しいチャットから再取得できます/);
  assert.match(download, /capabilityVector:/);
  assert.match(download, /"game-package-publish"/);
  assert.match(download, /MUST preserve submitted AppSet source and package hashes through preview\/review\/promotion/);
  assert.match(download, /FREEZE \{AppSet source, client, package manifest, both hashes\}/);
  assert.doesNotMatch(download, /CALL promote_game_package_to_development WITH/);
  assert.doesNotMatch(download, /expectedPackageRootSha256/);
  assert.match(download, /制作者はSDKからdevまたはmainへ昇格できません/);
  assert.match(download, /本番採用は運営管理画面/);
  assert.doesNotMatch(download, /解除可|任意へ|必須解除/);
  assert.match(nextConfig, /legacyDownloadMePaths/);
  assert.match(nextConfig, /GameFieldsDownloadMe-ver\$\{index \+ 1\}\.md/);
  assert.match(nextConfig, /destination: currentDownloadMePath/);
  assert.match(page, /プラグイン更新後は、必ず新しいチャットを作成してください/);
  assert.match(page, /既存チャットへ読み込まれたtool schemaは更新されない/);
  assert.match(page, /保存済みの制作者環境とゲームはアカウントに紐づいている/);
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
  assert.match(entry, /\[あなたのGame Fields環境を開く\]\(creatorUrl\)/);
  assert.match(entry, /\[今回のゲームを直接開く\]\(gameUrl\)/);
  assert.match(entry, /EMIT publish_mock\.creatorUrl as first clickable link/);
  assert.match(entry, /MUST_NOT prefer backward-compatible previewUrl/);
});

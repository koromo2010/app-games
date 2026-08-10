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
  const releaseProfile = read("apps/sdk-portal/lib/sdk-release-profile.ts");
  const packageStore = read("apps/sdk-portal/lib/game-package-store.ts");
  const dashboardSubmit = read("apps/sdk-portal/app/api/dashboard/games/[instanceId]/[gameId]/submit/route.ts");
  const dashboard = read("apps/sdk-portal/app/dashboard/page.tsx");
  const instanceRegistry = read("apps/sdk-portal/lib/instance-registry.ts");
  const submitButton = read("apps/sdk-portal/app/dashboard/SubmitGameButton.tsx");
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
  assert.match(dashboardSubmit, /resolveCreatorOwner/);
  assert.match(dashboardSubmit, /status === "owner_mismatch"/);
  assert.match(dashboardSubmit, /status: 409/);
  assert.match(dashboardSubmit, /r\.revision IS DISTINCT FROM g\.package_revision/);
  assert.match(dashboard, /<SubmitGameButton/);
  assert.match(dashboard, /game\.packageCandidateAvailable &&/);
  assert.doesNotMatch(dashboard, /!game\.packageAvailable && game\.packageCandidateAvailable/);
  assert.match(dashboard, /isUpdate=\{game\.packageAvailable\}/);
  assert.match(dashboard, /packageRevision:/);
  assert.match(dashboard, /ready-for-submission/);
  assert.match(
    dashboard,
    /href=\{creatorEnvironmentPath\(game\.creatorSlug\)\}>制作環境/,
  );
  assert.match(dashboard, /creatorGameModulesPath/);
  assert.match(dashboard, /creatorGamePreviewPath/);
  assert.match(dashboard, /creatorGameFormalRoomPath/);
  assert.match(mcp, /packagePreviewUrl: `\$\{portalBaseUrl\(origin\)\}\$\{result\.candidatePreviewPath\}`/);
  assert.match(instanceRegistry, /candidate\.revision AS "packageCandidateRevision"/);
  assert.match(submitButton, /更新版を正式提出/);
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
  assert.match(mcp, /sdkPortalMcpInstructions\(base\)/);
  assert.match(releaseProfile, /toolが遅延読み込み/);
  assert.match(releaseProfile, /明示的な検索後/);
  assert.match(releaseProfile, /新しいチャット/);
  assert.match(releaseProfile, /既存チャットのtool schemaはプラグイン更新後も差し替わりません/);
  assert.match(mcp, /name: "list_creator_environments"/);
  assert.match(mcp, /name === "list_creator_environments"/);
  assert.match(mcp, /listCreatorEnvironments\(playerId\)/);
  assert.match(mcp, /SDK_INSTANCE_REGISTRY_NOT_CONFIGURED: Game Fields運営側/);
  assert.match(mcp, /SDK_INSTANCE_REGISTRY_UNAVAILABLE: 制作者URL機能へ一時的に接続できません/);
  assert.match(mcp, /sdkToolErrorMessage\(error\)/);
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
  assert.match(mcp, /title: "操作プロトタイプの検査・保存"/);
  assert.match(mcp, /parseSdkMockPreviewManifest\(gameId, prototypeFiles\)/);
  assert.match(mcp, /requireConfirmedCreatorGameModuleContract/);
  assert.match(mcp, /validateGameSdkModuleUsage/);
  assert.match(mcp, /prototype_source_sha256/);
  assert.match(mcp, /creatorUrl,/);
  assert.match(mcp, /gameUrl,/);
  assert.match(mcp, /previewUrl: gameUrl/);
});

test("SDK Portal health probes the instance registry without reserving a slug", () => {
  const health = read("apps/sdk-portal/app/api/health/route.ts");
  const client = read("apps/sdk-portal/lib/instance-registry-client.ts");
  const registry = read("apps/sdk-portal/lib/instance-registry.ts");

  assert.match(health, /probeSdkInstanceRegistry/);
  assert.match(health, /SDK_INSTANCE_REGISTRY_NOT_CONFIGURED/);
  assert.match(health, /SDK_INSTANCE_REGISTRY_UNAVAILABLE/);
  assert.match(client, /\["PING"\]/);
  assert.match(client, /AbortSignal\.timeout\(3_000\)/);
  assert.match(registry, /sdkInstanceRegistryCommand as command/);
  assert.doesNotMatch(health, /reserveInstanceSlug|\["SET"/);
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

test("normal formal Room preview resolves and pins the latest immutable Package", () => {
  const instanceRegistry = read("apps/sdk-portal/lib/instance-registry.ts");
  const runtimeRoute = read("apps/sdk-portal/app/api/preview-runtime/[instanceId]/[gameId]/route.ts");
  const catalogRoute = read("apps/sdk-portal/app/api/preview-catalog/[instanceId]/route.ts");
  const catalog = read("app/games/sdk-game-catalog.ts");
  const definition = read("app/games/game-definition-source.ts");
  const previewPage = read("app/sdk-preview/[creatorSlug]/games/[gameId]/page.tsx");
  const roomRoute = read("app/api/sdk-preview/[creatorSlug]/games/[gameId]/rooms/route.ts");

  assert.match(instanceRegistry, /candidate\.revision AS "packageCandidateRevision"/);
  assert.match(instanceRegistry, /ORDER BY created_at DESC, revision DESC/);
  assert.match(instanceRegistry, /revision\?: string/);
  assert.match(instanceRegistry, /ORDER BY r\.created_at DESC, r\.revision DESC/);
  assert.match(runtimeRoute, /resolvePreviewRuntime/);
  assert.match(runtimeRoute, /getCreatorGamePackageRevision\(instanceId, gameId, revision\)/);
  assert.match(runtimeRoute, /status: 503/);
  assert.match(catalogRoute, /revision: game\.packageCandidateRevision/);
  assert.match(catalog, /isSdkPackageRevision\(game\.revision\)/);
  assert.match(definition, /sdkGamePreviewHref\(definition\.runtime\)/);
  assert.match(previewPage, /packageRevision=\{game\.revision\}/);
  assert.match(previewPage, /rooms\?revision=\$\{encodeURIComponent\(game\.revision\)\}/);
  assert.match(roomRoute, /revision: requestedRevision/);
  assert.match(roomRoute, /runtime\.runtimeContract\.packageRevision/);
});

test("DownloadMe contains no embedded credential placeholders", () => {
  const entry = read("sdk/entry/START_GAME_FIELDS.md");
  assert.match(entry, /__SDK_PORTAL_BASE_URL__\/api\/mcp/);
  assert.match(entry, /get_sdk_handshake/);
  assert.match(entry, /"handshakeVersion": __SDK_HANDSHAKE_VERSION__/);
  assert.match(entry, /"environment": "__SDK_ENVIRONMENT__"/);
  assert.match(entry, /name: "__SDK_PLUGIN_NAME__"/);
  assert.match(entry, /__DOWNLOAD_ME_FILE_NAME__/);
  assert.match(entry, /PLUGIN_SETUP/);
  assert.match(entry, /「新規プラグイン」/);
  assert.match(entry, /press Connect, complete OAuth, then press Update/);
  assert.match(entry, /accepted.*true/);
  assert.doesNotMatch(entry, /gameapp-dev/);
  assert.doesNotMatch(entry, /__GAME_FIELDS_AGENT_TOKEN__/);
  assert.doesNotMatch(entry, /GAME_FIELDS_AGENT_TOKEN=/);
});

test("SDK Portal derives the current DownloadMe from one environment profile", () => {
  const page = read("apps/sdk-portal/app/page.tsx");
  const nextConfig = read("apps/sdk-portal/next.config.ts");
  const syncScript = read("apps/sdk-portal/scripts/sync-download.mjs");
  const releaseProfile = read("apps/sdk-portal/lib/sdk-release-profile.ts");

  assert.match(page, /sdkPortalDownloadMeFileName/);
  assert.match(page, /releaseProfile\.pluginName/);
  assert.match(nextConfig, /resolveSdkReleaseProfile/);
  assert.match(nextConfig, /sdkDownloadMeFileName/);
  assert.match(syncScript, /renderSdkOnboardingTemplate/);
  assert.match(syncScript, /generatedDownloadMePattern/);
  assert.match(releaseProfile, /sdkPortalMcpInstructions/);
  assert.match(releaseProfile, /profile\.pluginName/);
  assert.match(releaseProfile, /sdkDownloadMeFileName/);
  assert.match(nextConfig, /legacyDownloadMePaths/);
  assert.match(nextConfig, /\["production", "development"\]/);
  assert.match(nextConfig, /historicalIntegerName/);
  assert.match(nextConfig, /destination: currentDownloadMePath/);
  assert.match(page, /プラグイン更新後は、必ず新しいチャットを作成してください/);
  assert.match(page, /既存チャットへ読み込まれたtool schemaは更新されない/);
  assert.match(page, /保存済みの制作者環境とゲームはアカウントに紐づいている/);
  assert.doesNotMatch(page, /gameapp-dev/);
  assert.doesNotMatch(releaseProfile, /gameapp-dev/);
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

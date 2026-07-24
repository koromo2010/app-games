import { readFileSync, readdirSync } from "node:fs";
import { extname, join, relative } from "node:path";

const root = process.cwd();
const packageRoot = join(root, "packages/game-sdk");
const sourceRoot = join(packageRoot, "src");
const typescriptFiles = (directory) => readdirSync(
  directory,
  { recursive: true },
)
  .filter((name) => [".ts", ".tsx"].includes(extname(name)))
  .map((name) => join(directory, name));
const sdkFiles = typescriptFiles(sourceRoot);
const runtimePackageRoot = join(root, "packages/game-runtime");
const runtimeSourceRoot = join(runtimePackageRoot, "src");
const runtimeFiles = typescriptFiles(runtimeSourceRoot);
const proofGameFile = join(root, "tests/fixtures/sdk-count-up-game.ts");
const pilotGameRoot = join(root, "games/wordwolf-sdk");
const pilotGameFiles = readdirSync(pilotGameRoot, { recursive: true })
  .filter((name) => extname(name) === ".ts")
  .map((name) => join(pilotGameRoot, name));
const starterRoot = join(root, "sdk/starter-template");
const sdkRoomRouteFile = join(root, "app/api/game-sdk/[gameId]/rooms/route.ts");
const sdkServerRegistryFile = join(root, "lib/game-sdk-server-registry.ts");
const sdkHttpClientFile = join(sourceRoot, "client-runtime.ts");
const sdkPreviewPageFile = join(root, "app/sdk-preview/[creatorSlug]/games/[gameId]/page.tsx");
const sdkPreviewRoomRouteFile = join(root, "app/api/sdk-preview/[creatorSlug]/games/[gameId]/rooms/route.ts");
const packageClientRuntimeFile = join(root, "apps/sdk-preview/lib/package-client-runtime.ts");
const packageServerRunnerFile = join(root, "apps/sdk-preview/lib/server-runner.ts");
const packageServerRouteFile = join(
  root,
  "apps/sdk-preview/app/server/[instanceId]/[gameId]/[revision]/route.ts",
);
const packageAssetRouteFile = join(
  root,
  "apps/sdk-preview/app/package/[instanceId]/[gameId]/[revision]/[[...assetPath]]/route.ts",
);
const previewLinksFile = join(root, "apps/sdk-portal/lib/preview-links.ts");
const packageManifestFile = join(root, "apps/sdk-portal/lib/game-package-manifest.ts");
const packageGitStoreFile = join(root, "apps/sdk-portal/lib/mock-git-store.ts");
const promotionRouteFile = join(root, "apps/sdk-portal/app/api/internal/promotions/route.ts");
const starterSourceFiles = ["src", "tests"].flatMap((directory) =>
  readdirSync(join(starterRoot, directory))
    .filter((name) => extname(name) === ".ts")
    .map((name) => join(starterRoot, directory, name)),
);
const allowedRelativeImports = new Set([
  "./client-realtime.js",
  "./collection.js",
  "./content-source.js",
  "./drawing.js",
  "./index.js",
  "./llm.js",
  "./modules/assignment.js",
  "./modules/collection.js",
  "./modules/flow.js",
  "./modules/presentation.js",
  "./modules/profile.js",
  "./modules/result.js",
  "./modules/timeout.js",
  "./modules/voting.js",
  "./playing-cards.js",
  "./resources.js",
  "./runtime.js",
  "react",
]);
const allowedRuntimeImports = new Set([
  "@game-fields/game-sdk",
  "@game-fields/game-sdk/modules",
  "@game-fields/game-sdk/resources",
  "@game-fields/game-sdk/runtime",
]);
const failures = [];

for (const absoluteFile of sdkFiles) {
  const file = relative(root, absoluteFile);
  const source = readFileSync(absoluteFile, "utf8");
  const imports = source.matchAll(/(?:import|export)\s+(?:type\s+)?(?:[^"']+?\s+from\s+)?["']([^"']+)["']/g);
  for (const match of imports) {
    const specifier = match[1];
    if (!allowedRelativeImports.has(specifier)) {
      failures.push(`${file}: 公開SDKから許可されていない依存 ${specifier} をimportしています。`);
    }
  }
  if (/\bprocess\.env\b/.test(source)) {
    failures.push(`${file}: 公開SDKから環境変数へ直接アクセスしています。`);
  }
}

const sdkRoomRouteSource = readFileSync(sdkRoomRouteFile, "utf8");
for (const token of [
  "approvedGameSdkRegistration",
  "requireAuthenticatedPlayer",
  "rateLimitPolicies.roomMutation",
  "rateLimitPolicies.sdkRuntimeRead",
  "createGameSdkOnlineRoomHttpHandlers",
  "export function DELETE",
]) {
  if (!sdkRoomRouteSource.includes(token)) {
    failures.push(`${relative(root, sdkRoomRouteFile)}: SDK Room Routeに必須境界 ${token} がありません。`);
  }
}

const sdkServerRegistrySource = readFileSync(sdkServerRegistryFile, "utf8");
if (
  !sdkServerRegistrySource.includes("wordWolfSdkServerModule")
  || !sdkServerRegistrySource.includes("channel: \"development\"")
  || !sdkServerRegistrySource.includes("createAuthenticatedGameSdkPlatformAdapter")
) {
  failures.push(`${relative(root, sdkServerRegistryFile)}: 審査済みmoduleの静的登録境界がありません。`);
}
if (/fetch\s*\(|SDK_PORTAL_INTERNAL_URL|preview-runtime/.test(sdkServerRegistrySource)) {
  failures.push(`${relative(root, sdkServerRegistryFile)}: 未審査Portal metadataからserver moduleを動的登録しています。`);
}

const sdkHttpClientSource = readFileSync(sdkHttpClientFile, "utf8");
if (!sdkHttpClientSource.includes("credentials: \"same-origin\"")) {
  failures.push(`${relative(root, sdkHttpClientFile)}: 署名済みplatform sessionを使うsame-origin通信がありません。`);
}
for (const token of ["readActiveRoom", "listRooms", "dissolveRoom", "watchRoom"]) {
  if (!sdkHttpClientSource.includes(token)) {
    failures.push(`${relative(root, sdkHttpClientFile)}: Online Room lifecycle契約 ${token} がありません。`);
  }
}
if (/\b(actor|playerId|displayName|debugAccess)\s*:/.test(sdkHttpClientSource)) {
  failures.push(`${relative(root, sdkHttpClientFile)}: Client Runtimeがactor identityをHTTP payloadへ組み立てています。`);
}

const sdkPreviewPageSource = readFileSync(sdkPreviewPageFile, "utf8");
if (/game-sdk-server-registry|game-sdk-platform-adapter|\/api\/game-sdk\//.test(sdkPreviewPageSource)) {
  failures.push(`${relative(root, sdkPreviewPageFile)}: 未審査previewを認証済みserver Runtimeへ直接接続しています。`);
}
const sdkPreviewRoomRouteSource = readFileSync(sdkPreviewRoomRouteFile, "utf8");
for (const token of [
  "loadSdkPreviewPackageModule",
  "createGameSdkOnlineRoomHttpHandlers",
  "createAuthenticatedGameSdkPlatformAdapter",
]) {
  if (!sdkPreviewRoomRouteSource.includes(token)) {
    failures.push(`${relative(root, sdkPreviewRoomRouteFile)}: 正式Preview Room境界 ${token} がありません。`);
  }
}
const packageClientRuntimeSource = readFileSync(packageClientRuntimeFile, "utf8");
for (const token of ["GameFieldsRoom", "game-fields:room-command", "resources: Object.freeze({})"]) {
  if (!packageClientRuntimeSource.includes(token)) {
    failures.push(`${relative(root, packageClientRuntimeFile)}: package client bridge境界 ${token} がありません。`);
  }
}
if (/contentSource\s*:|llm\s*:\s*\{/.test(packageClientRuntimeSource)) {
  failures.push(`${relative(root, packageClientRuntimeFile)}: ブラウザへPlatform resource adapterを公開しています。`);
}
const packageServerRunnerSource = readFileSync(packageServerRunnerFile, "utf8");
for (const token of [
  "VM_MEMORY_LIMIT_BYTES",
  "VM_STACK_LIMIT_BYTES",
  "VM_EXECUTION_LIMIT_MS",
  "setInterruptHandler",
  "newContext",
]) {
  if (!packageServerRunnerSource.includes(token)) {
    failures.push(`${relative(root, packageServerRunnerFile)}: 隔離server runner制限 ${token} がありません。`);
  }
}
const packageServerRouteSource = readFileSync(packageServerRouteFile, "utf8");
for (const token of [
  'grant.audience !== "package-server"',
  "grant.bundleSha256",
  "SERVER_RUNTIME_BUNDLE_HASH_MISMATCH",
  'assetPath: "server.bundle.js"',
]) {
  if (!packageServerRouteSource.includes(token)) {
    failures.push(`${relative(root, packageServerRouteFile)}: hash固定server実行境界 ${token} がありません。`);
  }
}
const packageAssetRouteSource = readFileSync(packageAssetRouteFile, "utf8");
for (const token of [
  'grant.audience !== "package-client"',
  'assetPath === "server.bundle.js"',
  'assetPath === "game-fields-package.json"',
  'assetPath.startsWith("source/")',
]) {
  if (!packageAssetRouteSource.includes(token)) {
    failures.push(`${relative(root, packageAssetRouteFile)}: client/server package分離境界 ${token} がありません。`);
  }
}
const previewLinksSource = readFileSync(previewLinksFile, "utf8");
for (const token of [
  'audience: "package-client"',
  'audience: "package-server"',
  "bundleSha256: input.serverBundleSha256",
]) {
  if (!previewLinksSource.includes(token)) {
    failures.push(`${relative(root, previewLinksFile)}: client/server token分離境界 ${token} がありません。`);
  }
}
const packageManifestSource = readFileSync(packageManifestFile, "utf8");
for (const token of [
  "MAX_PORTABLE_SERVER_BUNDLE_BYTES",
  "GAME_SDK_PACKAGE_SERVER_BUNDLE_TOO_LARGE",
  "actualBundleSha256",
  "actualAppSetSourceSha256",
]) {
  if (!packageManifestSource.includes(token)) {
    failures.push(`${relative(root, packageManifestFile)}: package受信時の固定hash境界 ${token} がありません。`);
  }
}
const packageGitStoreSource = readFileSync(packageGitStoreFile, "utf8");
for (const token of [
  "const packageTree =",
  'mode: "040000"',
  "path: input.prefix",
]) {
  if (!packageGitStoreSource.includes(token)) {
    failures.push(`${relative(root, packageGitStoreFile)}: package subtreeの完全置換境界 ${token} がありません。`);
  }
}
const promotionRouteSource = readFileSync(promotionRouteFile, "utf8");
for (const token of [
  "packageRevision",
  "packageBundleSha256",
  "packageAppSetSha256",
  "developmentRevision",
  "stableRevision",
  "verifyPortableManifest",
  "promotion_source_changed",
]) {
  if (!promotionRouteSource.includes(token)) {
    failures.push(`${relative(root, promotionRouteFile)}: 無再build昇格境界 ${token} がありません。`);
  }
}

for (const absoluteFile of runtimeFiles) {
  const file = relative(root, absoluteFile);
  const source = readFileSync(absoluteFile, "utf8");
  const imports = source.matchAll(/(?:import|export)\s+(?:type\s+)?(?:[^"']+?\s+from\s+)?["']([^"']+)["']/g);
  for (const match of imports) {
    const specifier = match[1];
    if (!allowedRuntimeImports.has(specifier) && !specifier.startsWith("./")) {
      failures.push(`${file}: 内部Runtime coreから許可されていない依存 ${specifier} をimportしています。`);
    }
  }
  if (/\bprocess\.env\b/.test(source)) {
    failures.push(`${file}: 内部Runtime coreから環境変数へ直接アクセスしています。`);
  }
}

const proofSource = readFileSync(proofGameFile, "utf8");
for (const match of proofSource.matchAll(/(?:import|export)\s+(?:type\s+)?(?:[^"']+?\s+from\s+)?["']([^"']+)["']/g)) {
  const specifier = match[1];
  if (!allowedRuntimeImports.has(specifier)) {
    failures.push(`${relative(root, proofGameFile)}: 実証ゲームがSDK外の依存 ${specifier} をimportしています。`);
  }
}
if (/\bprocess\.env\b|Redis|DATABASE_URL|API_KEY/.test(proofSource)) {
  failures.push(`${relative(root, proofGameFile)}: 実証ゲームがplatform資源へ直接アクセスしています。`);
}

for (const absoluteFile of pilotGameFiles) {
  const file = relative(root, absoluteFile);
  const source = readFileSync(absoluteFile, "utf8");
  for (const match of source.matchAll(/(?:import|export)\s+(?:type\s+)?(?:[^"']+?\s+from\s+)?["']([^"']+)["']/g)) {
    const specifier = match[1];
    if (!specifier.startsWith("@game-fields/game-sdk") && !specifier.startsWith("./") && !specifier.startsWith("../")) {
      failures.push(`${file}: SDKワードウルフがSDK外の依存 ${specifier} をimportしています。`);
    }
  }
  if (/\bprocess\.env\b|Redis|DATABASE_URL|API_KEY|@\/|lib\//.test(source)) {
    failures.push(`${file}: SDKワードウルフがplatform内部資源へ依存しています。`);
  }
}

for (const absoluteFile of starterSourceFiles) {
  const file = relative(root, absoluteFile);
  const source = readFileSync(absoluteFile, "utf8");
  const imports = source.matchAll(/(?:import|export)\s+(?:type\s+)?(?:[^"']+?\s+from\s+)?["']([^"']+)["']/g);
  for (const match of imports) {
    const specifier = match[1];
    const allowed = specifier.startsWith("@game-fields/game-sdk")
      || specifier.startsWith("./")
      || specifier.startsWith("../")
      || specifier === "node:assert/strict"
      || specifier === "node:test";
    if (!allowed) failures.push(`${file}: 試用スターターがSDK外の依存 ${specifier} をimportしています。`);
  }
  if (/\bprocess\.env\b|DATABASE_URL|API_KEY|from\s+["'](?:redis|@vercel\/blob)/.test(source)) {
    failures.push(`${file}: 試用スターターがplatform資源へ直接アクセスしています。`);
  }
}

const starterAppSetSource = readFileSync(join(starterRoot, "src/app-set.ts"), "utf8");
const starterServerModuleSource = readFileSync(join(starterRoot, "src/server-module.ts"), "utf8");
if (!starterAppSetSource.includes("defineGameSdkOnlineRoomAppSet")) {
  failures.push("sdk/starter-template/src/app-set.ts: SDK基本セットへ登録するAppSetがありません。");
}
if (
  !starterServerModuleSource.includes("createGameSdkOnlineRoomModule")
  || /\bcreateRoom\s*\(|\bapplyCommand\s*\(|\bpresentRoom\s*\(/.test(starterServerModuleSource)
) {
  failures.push("sdk/starter-template/src/server-module.ts: 基本セットとの合成以外を実装しないでください。");
}
const wordWolfAppSetSource = readFileSync(join(pilotGameRoot, "server-module.ts"), "utf8");
if (
  !wordWolfAppSetSource.includes("defineGameSdkOnlineRoomAppSet")
  || !wordWolfAppSetSource.includes("createGameSdkOnlineRoomModule")
  || wordWolfAppSetSource.includes("applyGameSdkRoomLifecycleCommand")
) {
  failures.push("games/wordwolf-sdk: ワードウルフ固有部をSDK基本セットへAppSetとして登録してください。");
}

const starterPackageJson = JSON.parse(readFileSync(join(starterRoot, "package.json"), "utf8"));
if (starterPackageJson.private !== true) {
  failures.push("sdk/starter-template/package.json: 試用スターターはprivateである必要があります。");
}
if (starterPackageJson.dependencies?.["@game-fields/game-sdk"] !== "file:vendor/__SDK_TARBALL__") {
  failures.push("sdk/starter-template/package.json: SDKは同梱tarballだけを参照する必要があります。");
}
const starterRuntimeDependencies = Object.keys(starterPackageJson.dependencies ?? {})
  .filter((name) => name !== "@game-fields/game-sdk");
if (starterRuntimeDependencies.length > 0) {
  failures.push(`sdk/starter-template/package.json: 未承認のruntime依存があります: ${starterRuntimeDependencies.join(", ")}`);
}

const packageJson = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8"));
if (packageJson.name !== "@game-fields/game-sdk") {
  failures.push("packages/game-sdk/package.json: package名が@game-fields/game-sdkではありません。");
}
if (
  packageJson.private === true
  || packageJson.license !== "MIT"
  || packageJson.publishConfig?.access !== "public"
  || packageJson.publishConfig?.provenance !== true
) {
  failures.push("packages/game-sdk/package.json: 公開SDKはpublic access・MIT・provenanceを固定してください。");
}
const sdkPreviewPackageJson = JSON.parse(
  readFileSync(join(root, "apps/sdk-preview/package.json"), "utf8"),
);
for (const script of ["predev", "prebuild"]) {
  if (
    sdkPreviewPackageJson.scripts?.[script]
    !== "npm run build --workspace @game-fields/game-sdk"
  ) {
    failures.push(`apps/sdk-preview/package.json: ${script}で公開SDK workspaceを先にbuildしてください。`);
  }
}
for (const exportPath of [
  ".",
  "./runtime",
  "./modules",
  "./content-source",
  "./llm",
  "./resources",
  "./playing-cards",
  "./playing-cards-react",
  "./drawing",
  "./drawing-react",
  "./mock-runtime",
  "./client-runtime",
  "./portable-server",
  "./handshake",
  "./package.json",
]) {
  if (!packageJson.exports?.[exportPath]) {
    failures.push(`packages/game-sdk/package.json: exports ${exportPath} がありません。`);
  }
}
if (Object.keys(packageJson.dependencies ?? {}).length > 0) {
  failures.push("packages/game-sdk/package.json: 公開SDKに外部runtime依存を追加しないでください。");
}

const runtimePackageJson = JSON.parse(readFileSync(join(runtimePackageRoot, "package.json"), "utf8"));
if (runtimePackageJson.name !== "@game-fields/game-runtime") {
  failures.push("packages/game-runtime/package.json: package名が@game-fields/game-runtimeではありません。");
}
if (runtimePackageJson.private !== true || runtimePackageJson.license !== "UNLICENSED") {
  failures.push("packages/game-runtime/package.json: 内部RuntimeはprivateかつUNLICENSEDである必要があります。");
}
if (JSON.stringify(runtimePackageJson.dependencies ?? {}) !== JSON.stringify({ "@game-fields/game-sdk": "0.1.1" })) {
  failures.push("packages/game-runtime/package.json: 内部Runtime coreは公開SDK以外へ依存できません。");
}

if (failures.length > 0) {
  console.error("\n[game-sdk-boundaries] SDK境界の検査に失敗しました:\n");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`[game-sdk-boundaries] 公開SDK ${sdkFiles.length}件、内部Runtime ${runtimeFiles.length}件、実証ゲーム、SDKワードウルフ ${pilotGameFiles.length}件、試用スターター ${starterSourceFiles.length}件の依存境界を確認しました。`);

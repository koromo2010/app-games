import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import {
  renderSdkDownloadMe,
  resolveSdkReleaseProfile,
  sdkDownloadMeFileName,
  sdkDownloadMeVersion,
} from "../packages/sdk-release-profiles/index.js";
import { extractStoredZip } from "./lib/stored-zip.mjs";

const root = resolve(import.meta.dirname, "..");
const platformRelease = JSON.parse(
  readFileSync(join(root, "config/platform-release.json"), "utf8"),
);
const profileConfig = JSON.parse(
  readFileSync(join(root, "config/sdk-release-profiles.json"), "utf8"),
);
const releaseProfile = resolveSdkReleaseProfile({
  release: platformRelease,
  profileConfig,
  requestedEnvironment: process.env.SDK_PORTAL_CHANNEL,
  gitRef: process.env.VERCEL_GIT_COMMIT_REF,
  portalBaseUrl: process.env.SDK_PORTAL_BASE_URL,
  defaultEnvironment: process.env.VERCEL ? undefined : "development",
});
const fixtureRoot = mkdtempSync(join(tmpdir(), "game-fields-sdk-starter-check-"));
const zipPath = join(fixtureRoot, "starter.zip");
const extractRoot = join(fixtureRoot, "extracted");
const repositoryRoot = join(fixtureRoot, "repository");
const npmEnvironment = {
  ...process.env,
  npm_config_cache: join(fixtureRoot, "npm-cache"),
};

function collectFiles(directory) {
  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const absolutePath = join(directory, entry.name);
      return entry.isDirectory() ? collectFiles(absolutePath) : [absolutePath];
    });
}

function fileMap(directory) {
  return new Map(collectFiles(directory).map((absolutePath) => [
    relative(directory, absolutePath).replaceAll("\\", "/"),
    createHash("sha256").update(readFileSync(absolutePath)).digest("hex"),
  ]));
}

try {
  execFileSync(process.execPath, [
    join(root, "scripts/build-game-sdk-starter.mjs"),
    "--output",
    zipPath,
  ], { cwd: root, stdio: "pipe", env: npmEnvironment });

  const entries = extractStoredZip(zipPath, extractRoot);
  const starterRoot = join(extractRoot, "game-fields-sdk-starter");
  for (const required of [
    "START_HERE.md",
    "AGENTS.md",
    "GAME_SPEC.md",
    "APP_REQUIREMENTS.md",
    "SDK_MODULE_CATALOG.md",
    "MOCK_GUIDE.md",
    "MOCK_REVIEW.md",
    "SDK_API.md",
    "SUBMISSION_CHECKLIST.md",
    "starter-manifest.json",
    "package.json",
    "scripts/build-submission.mjs",
    "scripts/build-game-package.mjs",
    "scripts/check-promotion-readiness.mjs",
    "scripts/check-mock.mjs",
    "scripts/promotion-readiness.mjs",
    "scripts/publish-game-package.mjs",
    "scripts/publish-mock.mjs",
    "scripts/stored-zip.mjs",
    "apps/sdk-portal/.vercel-root-placeholder",
    "apps/sdk-portal/vercel.json",
    "apps/sdk-preview/vercel.json",
    "src/manifest.ts",
    "src/contracts.ts",
    "src/app-set.ts",
    "src/server-module.ts",
    "tests/game-contract.test.ts",
    "mock/README.md",
    "mock/preview.json",
  ]) {
    if (!entries.includes(`game-fields-sdk-starter/${required}`)) {
      throw new Error(`Starter archive is missing ${required}.`);
    }
  }
  const packageJson = JSON.parse(readFileSync(join(starterRoot, "package.json"), "utf8"));
  const sdkReference = packageJson.dependencies?.["@game-fields/game-sdk"];
  if (typeof sdkReference !== "string" || !sdkReference.startsWith("file:vendor/")) {
    throw new Error("Starter package does not install the bundled SDK tarball.");
  }
  if (!existsSync(join(starterRoot, sdkReference.slice("file:".length)))) {
    throw new Error("Bundled SDK tarball is missing.");
  }
  const mockHtml = readFileSync(join(starterRoot, "mock/index.html"), "utf8");
  const mockScript = readFileSync(join(starterRoot, "mock/mock.js"), "utf8");
  const appRequirements = readFileSync(join(starterRoot, "APP_REQUIREMENTS.md"), "utf8");
  const moduleCatalog = readFileSync(join(starterRoot, "SDK_MODULE_CATALOG.md"), "utf8");
  const sdkApi = readFileSync(join(starterRoot, "SDK_API.md"), "utf8");
  const mockCheck = readFileSync(join(starterRoot, "scripts/check-mock.mjs"), "utf8");
  for (const forbidden of ["data-screen=\"lobby\"", "data-screen=\"entry\"", "data-screen=\"room\"", "data-gf-player-list", "data-gf-debug-panel"]) {
    if (mockHtml.includes(forbidden)) {
      throw new Error(`Starter mock duplicates Platform shell UI: ${forbidden}`);
    }
  }
  for (const required of ["game-slot", "GameFieldsRoom", "subscribe", "send"]) {
    if (!`${mockHtml}\n${mockScript}`.includes(required)) {
      throw new Error(`Starter mock is missing the promotable Room bridge: ${required}`);
    }
  }
  for (const forbidden of ["GameFieldsPreset.resources", "GameFieldsPreset.registerGame"]) {
    if (mockScript.includes(forbidden)) {
      throw new Error(`Starter mock keeps browser-local Preview behavior: ${forbidden}`);
    }
  }
  for (const required of [
    "context.resources.contentSource",
    "初期Word DB",
    "easy | normal | hard",
  ]) {
    if (!`${appRequirements}\n${moduleCatalog}\n${sdkApi}\n${mockCheck}`.includes(required)) {
      throw new Error(`Starter does not route Word DB use through the content source: ${required}`);
    }
  }
  for (const required of [
    "presentation.reason",
    "presentation.highlights",
    "presentation.playLog",
    "共有可能",
  ]) {
    if (!`${appRequirements}\n${moduleCatalog}\n${sdkApi}`.includes(required)) {
      throw new Error(`Starter does not define localized safe result playback: ${required}`);
    }
  }
  for (const required of [
    "room/debug-add-dummy",
    "room/debug-remove-dummy",
    "room/debug-auto-progress",
    "room/debug-simulate-timeout",
    "room/debug-set-connected",
    "room/debug-simulate-input-error",
  ]) {
    if (!sdkApi.includes(required)) {
      throw new Error(`Starter does not define the shared DEBUG command: ${required}`);
    }
  }
  for (const required of [
    "閲覧プレイヤー視点切替",
    "安全な主要状態進行",
    "時間切れ・切断・入力エラー",
    "自動進行",
    "進行中断",
  ]) {
    if (!`${appRequirements}\n${moduleCatalog}\n${sdkApi}`.includes(required)) {
      throw new Error(`Starter does not define the complete shared DEBUG surface: ${required}`);
    }
  }
  const starterManifest = JSON.parse(readFileSync(join(starterRoot, "starter-manifest.json"), "utf8"));
  if (starterManifest.downloadMeVersion !== sdkDownloadMeVersion(platformRelease)
    || starterManifest.environment !== releaseProfile.environment
    || starterManifest.repository !== "https://github.com/koromo2010/app-games"
    || starterManifest.ref !== releaseProfile.starterRef
    || starterManifest.sdkVersion !== platformRelease.sdkPackageVersion
    || starterManifest.platformVersion !== platformRelease.platformVersion
    || starterManifest.sdkHandshakeVersion !== platformRelease.sdkHandshakeVersion
    || starterManifest.sdkContractVersion !== platformRelease.sdkContractVersion) {
    throw new Error("Starter manifest does not identify the expected public source and SDK version.");
  }
  const appSetSource = readFileSync(join(starterRoot, "src/app-set.ts"), "utf8");
  const serverModuleSource = readFileSync(join(starterRoot, "src/server-module.ts"), "utf8");
  if (!appSetSource.includes("defineGameSdkOnlineRoomAppSet")) {
    throw new Error("Starter does not define its game-specific AppSet.");
  }
  if (
    !serverModuleSource.includes("createGameSdkOnlineRoomModule")
    || /\bcreateRoom\s*\(|\bapplyCommand\s*\(|\bpresentRoom\s*\(/.test(serverModuleSource)
  ) {
    throw new Error("Starter server module reimplements SDK basic-set responsibilities.");
  }

  // The distributed starter intentionally contains unanswered review fields,
  // and `npm run check` must reject that state. Complete only this disposable
  // fixture before exercising the submission pipeline end to end.
  const unansweredReviewFiles = new Map();
  for (const relativePath of ["GAME_SPEC.md", "MOCK_REVIEW.md"]) {
    const path = join(starterRoot, relativePath);
    const unanswered = readFileSync(path, "utf8");
    unansweredReviewFiles.set(path, unanswered);
    writeFileSync(
      path,
      unanswered.replaceAll("未記入", "スターター検証済み"),
    );
  }

  execFileSync("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund"], {
    cwd: starterRoot,
    stdio: "pipe",
    env: npmEnvironment,
  });
  execFileSync("npm", ["run", "check"], {
    cwd: starterRoot,
    stdio: "pipe",
    env: npmEnvironment,
  });
  execFileSync("npm", ["run", "check:mock"], {
    cwd: starterRoot,
    stdio: "pipe",
    env: npmEnvironment,
  });
  const demo = execFileSync("npm", ["run", "demo"], {
    cwd: starterRoot,
    encoding: "utf8",
    env: npmEnvironment,
  });
  if (!demo.includes("ゲーム終了") || !demo.includes("revision: 5")) {
    throw new Error("Starter demo did not complete the expected game flow.");
  }

  execFileSync("npm", ["run", "diagnose:promotion"], {
    cwd: starterRoot,
    stdio: "pipe",
    env: npmEnvironment,
  });
  execFileSync("npm", ["run", "build:game-package"], {
    cwd: starterRoot,
    stdio: "pipe",
    env: npmEnvironment,
  });
  const builtPackage = JSON.parse(
    readFileSync(join(starterRoot, "game-package/game-fields-package.json"), "utf8"),
  );
  if (
    builtPackage.gameId !== "my-first-game"
    || !/^[a-f0-9]{64}$/.test(builtPackage.server?.bundleSha256 ?? "")
    || !/^[a-f0-9]{64}$/.test(builtPackage.server?.appSetSourceSha256 ?? "")
  ) {
    throw new Error("Starter did not build one hash-pinned promotable game package.");
  }

  execFileSync("npm", ["run", "package"], {
    cwd: starterRoot,
    stdio: "pipe",
    env: npmEnvironment,
  });
  const submissionRoot = join(fixtureRoot, "submission-extracted");
  const submissionEntries = extractStoredZip(
    join(starterRoot, "submission/game-fields-submission.zip"),
    submissionRoot,
  );
  for (const required of [
    "game-fields-submission/GAME_SPEC.md",
    "game-fields-submission/package.json",
    "game-fields-submission/src/app-set.ts",
    "game-fields-submission/src/server-module.ts",
    "game-fields-submission/tests/game-contract.test.ts",
    `game-fields-submission/vendor/game-fields-game-sdk-${platformRelease.sdkPackageVersion}.tgz`,
  ]) {
    if (!submissionEntries.includes(required)) {
      throw new Error(`Submission archive is missing ${required}.`);
    }
  }
  if (submissionEntries.some((entry) => /(^|\/)(?:node_modules|dist|\.git|submission)(?:\/|$)/.test(entry.replace("game-fields-submission/", "")))) {
    throw new Error("Submission archive contains generated or repository-only directories.");
  }
  if (submissionEntries.some((entry) => entry.startsWith("game-fields-submission/apps/"))) {
    throw new Error("Submission archive contains repository-only Vercel branch guards.");
  }

  for (const [path, content] of unansweredReviewFiles) {
    writeFileSync(path, content);
  }

  execFileSync(process.execPath, [
    join(root, "scripts/build-game-sdk-starter-repository.mjs"),
    "--output",
    repositoryRoot,
  ], { cwd: root, stdio: "pipe", env: npmEnvironment });
  const extractedFiles = fileMap(starterRoot);
  for (const generated of ["node_modules", "dist", "game-package", "submission", "package-lock.json"]) {
    for (const key of [...extractedFiles.keys()]) {
      if (key === generated || key.startsWith(`${generated}/`)) extractedFiles.delete(key);
    }
  }
  const repositoryFiles = fileMap(repositoryRoot);
  if (JSON.stringify([...repositoryFiles]) !== JSON.stringify([...extractedFiles])) {
    throw new Error("Public starter repository snapshot differs from the tested starter ZIP.");
  }

  const entryTemplate = readFileSync(
    join(root, "sdk/entry/START_GAME_FIELDS.md"),
    "utf8",
  );
  if (!entryTemplate.includes("__SDK_STARTER_REF__")) {
    throw new Error("Entry guide must receive its starter ref from the release ledger.");
  }
  const entryGuide = renderSdkDownloadMe(
    entryTemplate,
    platformRelease,
    releaseProfile,
  );
  if (entryGuide.charCodeAt(0) !== 0xfeff) {
    throw new Error("Entry guide must start with a UTF-8 BOM to prevent mojibake in browser downloads.");
  }
  for (const requiredText of [
    `# GF-AECP/${sdkDownloadMeVersion(platformRelease)}`,
    "HUMAN_DOCUMENTATION := false",
    `ref: "${releaseProfile.starterRef}"`,
    "https://github.com/koromo2010/app-games",
    "starter-manifest.json",
    `downloadMeVersion == ${sdkDownloadMeVersion(platformRelease)}`,
    releaseProfile.pluginName,
    sdkDownloadMeFileName(platformRelease, releaseProfile),
    "schema_accepts_all(C0.capabilityVector)",
    "更新ボタンを押しても既存チャットのtool schemaは差し替わりません",
    "get_sdk_handshake",
    "tool検索",
    "response.accepted == true",
    "sdkHandshakeVersion",
    "npm run check",
    "npm run demo",
    "npm run package",
    "submission/game-fields-submission.zip",
    "formal_package.saved == true",
    "publish_game_source_package",
    "MUST_NOT ask a general creator to install Node.js, npm, Git, or Vercel CLI as the default path",
    "moduleProfileRevision",
    "moduleContractDigest",
    "prototypeRevision",
    "制作者はSDKからdevまたはmainへ昇格できません",
    "previewUrl",
    "MUST_NOT substitute mock preview",
  ]) {
    if (!entryGuide.includes(requiredText)) {
      throw new Error(`Entry guide is missing required instruction: ${requiredText}`);
    }
  }

  console.log("[game-sdk-starter] 入口、公開Git用snapshot、ZIP展開、同梱SDK install、型検査、契約テスト、1ゲーム完走、提出ZIPを確認しました。");
} finally {
  rmSync(fixtureRoot, { recursive: true, force: true });
}

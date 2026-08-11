import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, posix } from "node:path";

const root = process.cwd();
const sdkPackageRoot = join(root, "packages/game-sdk");
const sdkPackageJson = JSON.parse(
  readFileSync(join(sdkPackageRoot, "package.json"), "utf8"),
);
const fixtureRoot = mkdtempSync(join(tmpdir(), "game-fields-sdk-pack-"));
const npmEnvironment = {
  ...process.env,
  npm_config_cache: join(fixtureRoot, "npm-cache"),
};

function declaredDistTargets(exportsField) {
  const targets = new Set();
  const visit = (value) => {
    if (typeof value === "string") {
      if (value === "./package.json") return;
      if (!value.startsWith("./dist/") || value.includes("*")) {
        throw new Error(`Unsupported SDK package export target: ${value}`);
      }
      targets.add(value.slice(2));
      return;
    }
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("SDK package exports contain an invalid target.");
    }
    for (const nestedTarget of Object.values(value)) visit(nestedTarget);
  };

  if (!exportsField || typeof exportsField !== "object" || Array.isArray(exportsField)) {
    throw new Error("SDK package exports must be an object.");
  }
  for (const target of Object.values(exportsField)) visit(target);
  return targets;
}

function resolvePackedDependency(sourcePath, specifier) {
  if (!specifier.startsWith(".")) return null;
  let dependencyPath = posix.normalize(posix.join(posix.dirname(sourcePath), specifier));
  if (sourcePath.endsWith(".d.ts") && dependencyPath.endsWith(".js")) {
    dependencyPath = dependencyPath.replace(/\.js$/, ".d.ts");
  }
  if (!dependencyPath.startsWith("dist/")) {
    throw new Error(`SDK package artifact escapes dist: ${sourcePath} -> ${specifier}`);
  }
  return dependencyPath;
}

function expectedPackedFiles(packedPaths) {
  const expected = new Set(["LICENSE", "README.md", "package.json"]);
  const pending = [...declaredDistTargets(sdkPackageJson.exports)];

  for (const rootFile of expected) {
    if (!packedPaths.has(rootFile)) {
      throw new Error(`Missing SDK tarball root file: ${rootFile}`);
    }
  }

  while (pending.length > 0) {
    const packedPath = pending.pop();
    if (expected.has(packedPath)) continue;
    if (!packedPaths.has(packedPath)) {
      throw new Error(`Missing SDK tarball file required by package exports: ${packedPath}`);
    }
    expected.add(packedPath);
    if (packedPath.endsWith(".map")) continue;

    const source = readFileSync(join(sdkPackageRoot, packedPath), "utf8");
    const sourceMap = source.match(/\/\/# sourceMappingURL=([^\s]+)/)?.[1];
    if ((packedPath.endsWith(".js") || packedPath.endsWith(".d.ts")) && !sourceMap) {
      throw new Error(`SDK package artifact is missing its source map: ${packedPath}`);
    }
    if (sourceMap) {
      const sourceMapPath = resolvePackedDependency(packedPath, `./${sourceMap}`);
      if (sourceMapPath) pending.push(sourceMapPath);
    }

    const moduleSpecifiers = source.matchAll(
      /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s*)["']([^"']+)["']/g,
    );
    for (const match of moduleSpecifiers) {
      const dependencyPath = resolvePackedDependency(packedPath, match[1]);
      if (dependencyPath) pending.push(dependencyPath);
    }
  }

  return expected;
}

try {
  const packOutput = execFileSync(
    "npm",
    ["pack", "./packages/game-sdk", "--json", "--pack-destination", fixtureRoot],
    { cwd: root, encoding: "utf8", env: npmEnvironment },
  );
  const [packResult] = JSON.parse(packOutput);
  if (!packResult?.filename) throw new Error("SDK tarball was not created.");

  const packedPaths = new Set((packResult.files ?? []).map((file) => file.path));
  const expectedFiles = expectedPackedFiles(packedPaths);
  const unexpectedFiles = [...packedPaths].filter((path) => !expectedFiles.has(path));
  if (unexpectedFiles.length > 0) {
    throw new Error(`Unexpected files in SDK tarball: ${unexpectedFiles.join(", ")}`);
  }

  const tarballPath = join(fixtureRoot, packResult.filename);
  const consumerRoot = join(fixtureRoot, "consumer");
  mkdirSync(consumerRoot);
  writeFileSync(join(consumerRoot, "package.json"), JSON.stringify({
    name: "game-fields-sdk-install-fixture",
    private: true,
    type: "module",
    dependencies: {
      "@game-fields/game-sdk": `file:${tarballPath}`,
      react: "19.2.4",
    },
  }, null, 2));
  writeFileSync(join(consumerRoot, "consumer.mjs"), `
import { GAME_SDK_VERSION, defineGameManifest } from "@game-fields/game-sdk";
import { advanceGameSdkRoom, defineGameServerModule } from "@game-fields/game-sdk/runtime";
import {
  createInitialGameSdkModuleProfile,
  nextGameSdkRoundStep,
  requiredGameSdkModuleIds,
} from "@game-fields/game-sdk/modules";
import { createGameSdkMockRuntime } from "@game-fields/game-sdk/mock-runtime";
import { createGameSdkHttpClientRuntime } from "@game-fields/game-sdk/client-runtime";
import {
  defineGameSdkContentSource,
  GAME_SDK_CONTENT_POOL_DEFINITIONS,
} from "@game-fields/game-sdk/content-source";
import {
  createStandardPlayingCardDeck,
} from "@game-fields/game-sdk/playing-cards";
import {
  normalizeDrawingStroke,
} from "@game-fields/game-sdk/drawing";
import {
  PlayingCardView,
} from "@game-fields/game-sdk/playing-cards-react";
import {
  DrawingCanvas,
  DrawingLayerPanel,
  DrawingToolbar,
} from "@game-fields/game-sdk/drawing-react";
import {
  requireGameSdkContentSource,
} from "@game-fields/game-sdk/resources";
import {
  defineGameSdkLlmGateway,
} from "@game-fields/game-sdk/llm";
import {
  GAME_FIELDS_SDK_HANDSHAKE_PROTOCOL,
  GAME_FIELDS_SDK_HANDSHAKE_VERSION,
  negotiateGameSdkHandshake,
} from "@game-fields/game-sdk/handshake";
import {
  GAME_SDK_PORTABLE_SERVER_GLOBAL,
} from "@game-fields/game-sdk/portable-server";
import {
  validateGameSdkMockQuality,
} from "@game-fields/game-sdk/mock-quality";
import {
  validateGameSdkModuleUsage,
} from "@game-fields/game-sdk/module-usage";

const manifest = defineGameManifest({
  sdkVersion: GAME_SDK_VERSION,
  id: "pack-consumer",
  title: { ja: "外部install検査", en: "External install check" },
  playMode: "online-room",
  minimumPlayers: 1,
  maximumPlayers: 2,
  supportsDebug: false,
  supportsSpectators: false,
  supportsReplay: false,
  supportsRating: false,
  usesLlm: false,
  settings: [{
    key: "timeLimitSeconds",
    label: { ja: "制限時間", en: "Time limit" },
    type: "select",
    defaultValue: 60,
    platformRole: "time-limit",
    options: [0, 30, 60],
  }],
});
const module = defineGameServerModule({
  manifest,
  createRoom(_input, context) {
    return { code: context.roomCode, revision: 1, phase: "lobby", hostPlayerId: context.actor.playerId };
  },
  applyCommand(room, _command, context) {
    if (room.hostPlayerId !== context.actor.playerId) throw new Error("HOST_REQUIRED");
    return advanceGameSdkRoom(room, { phase: "playing" });
  },
  presentRoom(room, context) {
    return { phase: room.phase, isHost: room.hostPlayerId === context.viewer.playerId };
  },
});
const actor = { playerId: "host-1", displayName: "Host", role: "host", debugAccess: false };
const runtime = createGameSdkMockRuntime({ module });
const created = await runtime.createRoom({ roomCode: "PACK", create: {}, actor });
const result = await runtime.sendCommand({
  code: created.code,
  envelope: { expectedRevision: created.revision, command: { type: "start" } },
  actor,
});
if (result.revision !== 2 || result.room.view.phase !== "playing") process.exit(1);
const httpRuntime = createGameSdkHttpClientRuntime({
  gameId: "pack-consumer",
  endpoint: "https://game-fields.example/api/game-sdk/pack-consumer/rooms",
  fetcher: async () => Response.json({ room: created }),
});
const remoteRoom = await httpRuntime.readRoom("PACK");
if (remoteRoom?.revision !== 1) process.exit(1);
const handshake = negotiateGameSdkHandshake({
  protocol: GAME_FIELDS_SDK_HANDSHAKE_PROTOCOL,
  handshakeVersion: GAME_FIELDS_SDK_HANDSHAKE_VERSION,
  client: { kind: "starter-cli" },
  expected: {
    environment: "development",
    canonicalMcpUrl: "https://sdk-dev.game-fields.com/api/mcp",
    onboardingProfileId: "game-fields-development-authoring-v1",
    platformVersion: "0.1.1",
    sdkPackageVersion: "0.1.1",
    sdkContractVersion: 1,
  },
  requiredCapabilities: ["starter-download"],
}, {
  protocol: GAME_FIELDS_SDK_HANDSHAKE_PROTOCOL,
  handshakeVersion: GAME_FIELDS_SDK_HANDSHAKE_VERSION,
  surface: "creator-portal",
  environment: "development",
  onboardingProfileId: "game-fields-development-authoring-v1",
  release: {
    platformVersion: "0.1.1",
    sdkPackageVersion: "0.1.1",
    sdkContractVersion: 1,
    supportedSdkContractVersions: [1],
    roomSchemaVersion: 2,
  },
  capabilities: ["starter-download"],
  endpoints: {
    portal: "https://sdk-dev.game-fields.com",
    handshake: "https://sdk-dev.game-fields.com/.well-known/game-fields-sdk",
    mcp: "https://sdk-dev.game-fields.com/api/mcp",
  },
});
if (!handshake.accepted || handshake.environment !== "development") process.exit(1);
if (GAME_SDK_PORTABLE_SERVER_GLOBAL !== "GameFieldsServerBundle") process.exit(1);
if (
  typeof validateGameSdkMockQuality !== "function"
  || typeof validateGameSdkModuleUsage !== "function"
) process.exit(1);
const round = nextGameSdkRoundStep({
  currentRound: 1,
  totalRounds: 2,
  repeatPhase: "playing",
  completedPhase: "result",
});
if (round.round !== 2 || round.phase !== "playing" || round.complete) process.exit(1);
if (requiredGameSdkModuleIds(createInitialGameSdkModuleProfile()).length !== 39) process.exit(1);
const contentSource = defineGameSdkContentSource({
  async drawWords(request) {
    return Array.from({ length: request.count }, (_, index) => ({
      id: "word-" + index,
      surface: "word-" + index,
      difficulty: request.difficulty ?? "normal",
    }));
  },
  async drawWordPairs() { return []; },
  async findDefinitions() { return []; },
});
const words = await requireGameSdkContentSource({ contentSource }).drawWords({
  pool: "general-words",
  difficulty: "easy",
  count: 2,
});
if (words.length !== 2) process.exit(1);
if (GAME_SDK_CONTENT_POOL_DEFINITIONS["general-words"].displayName !== "一般語彙") process.exit(1);
if (GAME_SDK_CONTENT_POOL_DEFINITIONS["word-pairs"].displayName !== "審査済みワードペア") process.exit(1);
if ("rare-words" in GAME_SDK_CONTENT_POOL_DEFINITIONS) process.exit(1);
if (createStandardPlayingCardDeck({ jokersPerDeck: 2 }).length !== 54) process.exit(1);
if (!normalizeDrawingStroke({
  id: "stroke-1",
  color: "#0f172a",
  width: 1,
  opacity: 1,
  tool: "pen",
  points: [{ x: 0.5, y: 0.5 }],
})) process.exit(1);
const llm = defineGameSdkLlmGateway({
  async generate(request) {
    return {
      text: request.prompt,
      generation: {
        provider: "local",
        model: "fixture",
        mode: "local",
        promptVersion: request.promptVersion,
        latencyMs: 0,
        retrievedFeedbackIds: [],
      },
    };
  },
});
if ((await llm.generate({
  task: "fixture",
  prompt: "ok",
  promptVersion: "v1",
})).text !== "ok") process.exit(1);
if (
  typeof PlayingCardView !== "function"
  || typeof DrawingCanvas !== "function"
  || typeof DrawingToolbar !== "function"
  || typeof DrawingLayerPanel !== "function"
) process.exit(1);
`);

  execFileSync("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund"], {
    cwd: consumerRoot,
    stdio: "pipe",
    env: npmEnvironment,
  });
  execFileSync(process.execPath, ["consumer.mjs"], { cwd: consumerRoot, stdio: "pipe" });

  const installedPackage = JSON.parse(readFileSync(
    join(consumerRoot, "node_modules/@game-fields/game-sdk/package.json"),
    "utf8",
  ));
  if (
    installedPackage.name !== "@game-fields/game-sdk"
    || installedPackage.version !== sdkPackageJson.version
    || installedPackage.private === true
    || installedPackage.license !== "MIT"
    || installedPackage.publishConfig?.access !== "public"
  ) {
    throw new Error("Installed SDK package identity does not match the expected preview package.");
  }

  console.log(`[game-sdk-package] ${packResult.filename}を外部fixtureへinstallし、Runtime・resource・React UIの公開exportと全必須module profileを確認しました。`);
} finally {
  rmSync(fixtureRoot, { recursive: true, force: true });
}

import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = process.cwd();
const fixtureRoot = mkdtempSync(join(tmpdir(), "game-fields-sdk-pack-"));
const npmEnvironment = {
  ...process.env,
  npm_config_cache: join(fixtureRoot, "npm-cache"),
};

try {
  const packOutput = execFileSync(
    "npm",
    ["pack", "./packages/game-sdk", "--json", "--pack-destination", fixtureRoot],
    { cwd: root, encoding: "utf8", env: npmEnvironment },
  );
  const [packResult] = JSON.parse(packOutput);
  if (!packResult?.filename) throw new Error("SDK tarball was not created.");

  const allowedFiles = /^(LICENSE|README\.md|package\.json|dist\/(index|runtime|modules|modules\/(profile|collection|voting|flow|assignment|presentation|result)|content-source|llm|resources|playing-cards|playing-cards-react|drawing|drawing-react|mock-runtime|client-runtime|client-realtime|handshake)\.(js|js\.map|d\.ts|d\.ts\.map))$/;
  const unexpectedFiles = (packResult.files ?? [])
    .map((file) => file.path)
    .filter((path) => !allowedFiles.test(path));
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
    platformVersion: "0.1.0",
    sdkPackageVersion: "0.1.0",
    sdkContractVersion: 1,
  },
  requiredCapabilities: ["starter-download"],
}, {
  protocol: GAME_FIELDS_SDK_HANDSHAKE_PROTOCOL,
  handshakeVersion: GAME_FIELDS_SDK_HANDSHAKE_VERSION,
  surface: "creator-portal",
  environment: "development",
  release: {
    platformVersion: "0.1.0",
    sdkPackageVersion: "0.1.0",
    sdkContractVersion: 1,
    supportedSdkContractVersions: [1],
    roomSchemaVersion: 1,
  },
  capabilities: ["starter-download"],
  endpoints: {
    portal: "https://sdk-dev.game-fields.com",
    handshake: "https://sdk-dev.game-fields.com/.well-known/game-fields-sdk",
  },
});
if (!handshake.accepted || handshake.environment !== "development") process.exit(1);
const round = nextGameSdkRoundStep({
  currentRound: 1,
  totalRounds: 2,
  repeatPhase: "playing",
  completedPhase: "result",
});
if (round.round !== 2 || round.phase !== "playing" || round.complete) process.exit(1);
if (requiredGameSdkModuleIds(createInitialGameSdkModuleProfile()).length !== 38) process.exit(1);
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
if (GAME_SDK_CONTENT_POOL_DEFINITIONS["rare-words"].displayName !== "低認知語彙") process.exit(1);
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
    || installedPackage.version !== "0.1.0"
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

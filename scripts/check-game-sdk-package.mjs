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

  const allowedFiles = /^(README\.md|package\.json|dist\/(index|runtime|mock-runtime)\.(js|js\.map|d\.ts|d\.ts\.map))$/;
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
    },
  }, null, 2));
  writeFileSync(join(consumerRoot, "consumer.mjs"), `
import { GAME_SDK_VERSION, defineGameManifest } from "@game-fields/game-sdk";
import { advanceGameSdkRoom, defineGameServerModule } from "@game-fields/game-sdk/runtime";
import { createGameSdkMockRuntime } from "@game-fields/game-sdk/mock-runtime";

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
  if (installedPackage.name !== "@game-fields/game-sdk" || installedPackage.version !== "0.1.0") {
    throw new Error("Installed SDK package identity does not match the expected preview package.");
  }

  console.log(`[game-sdk-package] ${packResult.filename}を外部fixtureへinstallし、3つの公開exportを確認しました。`);
} finally {
  rmSync(fixtureRoot, { recursive: true, force: true });
}

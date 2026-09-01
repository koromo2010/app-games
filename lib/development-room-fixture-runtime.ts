import { createHash } from "node:crypto";
import {
  DevelopmentRoomFixtureOperator,
  type DevelopmentSdkRoomFixtureTemplate,
} from "./development-room-fixture-operator.ts";
import { loadSdkPreviewPackageModule } from "./sdk-preview-package-runtime.ts";

const sdkFixtureGameId = "link-lines";

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export async function loadDevelopmentSdkRoomFixtureTemplate(input: {
  creatorSlug: string;
  operationId: string;
  request: Request;
  playerId: string;
}) {
  const hostPlayerId = `t185-fixture-${sha256(input.operationId).slice(0, 24)}`;
  const runtime = await loadSdkPreviewPackageModule({
    creatorSlug: input.creatorSlug,
    gameId: sdkFixtureGameId,
    request: input.request,
    playerId: input.playerId,
  });
  if (!runtime?.definition.manifest) {
    throw new Error("DEVELOPMENT_ROOM_FIXTURE_SDK_RUNTIME_UNAVAILABLE");
  }
  const settings = Object.fromEntries(runtime.definition.settings.map((setting) => [
    setting.key,
    setting.defaultValue,
  ]));
  const requestId = `t185-template-${input.operationId}`;
  const room = await runtime.module.createRoom(
    { settings, app: {} },
    {
      actor: {
        playerId: hostPlayerId,
        displayName: "T-185 fixture",
        role: "host",
        debugAccess: false,
      },
      now: Date.now(),
      requestId,
      roomCode: "T185",
      resources: runtime.resources,
    },
  );
  if (
    room.code !== "T185"
    || !Number.isSafeInteger(room.revision)
    || room.phase !== "lobby"
    || !Array.isArray((room as { players?: unknown }).players)
  ) throw new Error("DEVELOPMENT_ROOM_FIXTURE_SDK_TEMPLATE_INVALID");
  return {
    runtimeId: runtime.roomScopeId,
    runtimeContract: runtime.runtimeContract,
    maximumPlayers: runtime.definition.manifest.maximumPlayers,
    hostPlayerId,
    room: room as DevelopmentSdkRoomFixtureTemplate["room"],
  } satisfies DevelopmentSdkRoomFixtureTemplate;
}

export function createDevelopmentRoomFixtureOperator(input: {
  playerId: string;
}) {
  return new DevelopmentRoomFixtureOperator({
    loadSdkTemplate: (templateInput) => loadDevelopmentSdkRoomFixtureTemplate({
      ...templateInput,
      playerId: input.playerId,
    }),
  });
}

import assert from "node:assert/strict";
import { test } from "node:test";
import { createGameSdkMockRuntime } from "@game-fields/game-sdk/mock-runtime";
import { buildGameSdkDebugRoom } from "../app/components/game-sdk/game-sdk-frame-presentation.ts";
import type { PackageRoom } from "../app/components/game-sdk/game-sdk-frame-types.ts";
import {
  createSdkPreviewPackageRouteHandler,
  type SdkPreviewPackageRouteTarget,
} from "../lib/sdk-preview-package-route-handler.ts";
import { sdkCountUpServerModule } from "./fixtures/sdk-count-up-game.ts";

const revision = "6".repeat(40);
const creatorSlug = "test10-1";
const gameId = "twixt-repro";
const playerId = "preview-host";
const target: SdkPreviewPackageRouteTarget = {
  creatorSlug,
  gameId,
  scope: { creatorSlug, gameId, revision },
  actor: {
    playerId,
    displayName: "Preview Host",
    role: "host",
    debugAccess: true,
  },
  debugEnabled: true,
  module: sdkCountUpServerModule,
};

const route = createSdkPreviewPackageRouteHandler({
  resolveTarget: async () => target,
  createRuntime: (runtimeTarget, initialRoom) => createGameSdkMockRuntime({
    module: runtimeTarget.module as typeof sdkCountUpServerModule,
    ...(initialRoom ? { initialRooms: [initialRoom] } : {}),
    resources: {},
  }),
});

const unauthorizedRoute = createSdkPreviewPackageRouteHandler({
  resolveTarget: async () => ({
    ...target,
    actor: { ...target.actor, debugAccess: false },
    debugEnabled: false,
  }),
  createRuntime: (runtimeTarget, initialRoom) => createGameSdkMockRuntime({
    module: runtimeTarget.module as typeof sdkCountUpServerModule,
    ...(initialRoom ? { initialRooms: [initialRoom] } : {}),
    resources: {},
  }),
});

function context() {
  return {
    params: Promise.resolve({ creatorSlug, gameId }),
  };
}

function url() {
  return `https://game-fields.test/api/sdk-preview/${creatorSlug}/games/${gameId}/preview?revision=${revision}`;
}

function cookieHeaderFromSetCookie(response: Response) {
  const setCookie = response.headers.get("set-cookie");
  assert.ok(setCookie);
  const separator = setCookie.indexOf(";");
  assert.ok(separator > 0);
  return setCookie.slice(0, separator);
}

async function patch(cookie: string, body: Record<string, unknown>) {
  const response = await route(
    new Request(url(), {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        cookie,
      },
      body: JSON.stringify(body),
    }),
    context(),
    "PATCH",
  );
  if (response.status !== 200) {
    throw new Error(`${response.status} ${await response.text()}`);
  }
  return {
    data: await response.json() as {
    room: {
      phase: string;
      revision: number;
      view: {
        common: {
          players: Array<{ isDummy?: boolean }>;
          permissions: {
            canDebug: boolean;
            canDebugActAsDummy?: boolean;
          };
        };
        app: { count?: number };
      };
    };
    },
    cookie: cookieHeaderFromSetCookie(response),
  };
}

test("T-103 Preview keeps DEBUG controls across Lobby -> playing", async () => {
  const previousSecret = process.env.PLAYER_SESSION_SECRET;
  process.env.PLAYER_SESSION_SECRET = "t103-preview-test-secret-that-is-long-enough-32";
  try {
    const createdResponse = await route(
      new Request(url(), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          roomCode: "GF1234",
          create: { settings: { target: 3 }, app: {} },
        }),
      }),
      context(),
      "POST",
    );
    assert.equal(createdResponse.status, 200);
    const created = await createdResponse.json() as {
      room: {
        revision: number;
        view: { common: { permissions: { canDebug: boolean } } };
      };
    };
    const cookie = cookieHeaderFromSetCookie(createdResponse);
    assert.equal(created.room.view.common.permissions.canDebug, true);

    const lobby = await patch(cookie, {
      code: "GF1234",
      finalViewer: "self",
      envelope: {
        expectedRevision: created.room.revision,
        command: { type: "room/debug-add-dummy" },
      },
    });
    assert.equal(lobby.data.room.phase, "lobby");
    assert.equal(lobby.data.room.view.common.permissions.canDebug, true);
    assert.equal(lobby.data.room.view.common.players[1]?.isDummy, true);

    const playing = await patch(lobby.cookie, {
      code: "GF1234",
      finalViewer: "self",
      envelope: {
      expectedRevision: lobby.data.room.revision,
        command: { type: "game/start" },
      },
    });
    assert.equal(playing.data.room.phase, "playing");
    assert.equal(playing.data.room.view.common.permissions.canDebug, true);
    assert.equal(playing.data.room.view.common.permissions.canDebugActAsDummy, true);

    const debugRoom = buildGameSdkDebugRoom({
      room: playing.data.room as PackageRoom,
      common: playing.data.room.view.common as PackageRoom["view"]["common"],
      moduleRequired: () => true,
      supportsSpectators: false,
      debugAutoFollow: false,
      debugOwnerSeat: null,
      debugActorSeat: null,
      debugViewer: "self",
      debugSwitchSource: "manual",
      pending: false,
      message: "",
      run: async (operation) => operation(),
      send: async () => playing.data.room as PackageRoom,
      autoProgressDebug: async () => playing.data.room as PackageRoom,
      simulateDebugInputError: async () => {},
      onToggleAutoFollow: () => {},
      onSelectActor: () => {},
      onSelectViewer: () => {},
    });
    assert.ok(debugRoom);
    assert.equal(debugRoom.canActAsDummy, true);
    assert.equal(debugRoom.disabled, true);

    const dummyAction = await patch(playing.cookie, {
      code: "GF1234",
      finalViewer: "self",
      envelope: {
        expectedRevision: playing.data.room.revision,
        command: {
          type: "room/debug-act-as-dummy",
          seat: 1,
          command: { type: "game/count-up" },
        },
      },
    });
    assert.equal(dummyAction.data.room.phase, "playing");
    assert.equal(dummyAction.data.room.view.app.count, 1);
    assert.equal(dummyAction.data.room.view.common.permissions.canDebug, true);
  } finally {
    if (previousSecret === undefined) delete process.env.PLAYER_SESSION_SECRET;
    else process.env.PLAYER_SESSION_SECRET = previousSecret;
  }
});

test("T-103 Preview does not expose DEBUG permissions to an unauthorized actor", async () => {
  const previousSecret = process.env.PLAYER_SESSION_SECRET;
  process.env.PLAYER_SESSION_SECRET = "t103-preview-test-secret-that-is-long-enough-32";
  try {
    const response = await unauthorizedRoute(
      new Request(url(), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          roomCode: "GF5678",
          create: { settings: { target: 3 }, app: {} },
        }),
      }),
      context(),
      "POST",
    );
    assert.equal(response.status, 200);
    const payload = await response.json() as {
      room: { view: { common: { permissions: {
        canDebug: boolean;
        canDebugActAsDummy?: boolean;
      } } } };
    };
    assert.equal(payload.room.view.common.permissions.canDebug, false);
    assert.equal(payload.room.view.common.permissions.canDebugActAsDummy, false);
  } finally {
    if (previousSecret === undefined) delete process.env.PLAYER_SESSION_SECRET;
    else process.env.PLAYER_SESSION_SECRET = previousSecret;
  }
});

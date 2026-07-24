import assert from "node:assert/strict";
import test from "node:test";
import { defineGameSdkContentSource } from "@game-fields/game-sdk/content-source";
import { createGameSdkMockRuntime } from "@game-fields/game-sdk/mock-runtime";
import { wordWolfSdkServerModule } from "../games/wordwolf-sdk/server-module.ts";

const actor = (playerId: string, role: "host" | "player" = "player") => ({ playerId, displayName: playerId, role, debugAccess: false } as const);

test("SDK formal room DEBUG can add and remove lobby-only dummies", async () => {
  const runtime = createGameSdkMockRuntime({
    module: wordWolfSdkServerModule,
    now: () => 1_000,
  });
  const debugHost = {
    playerId: "host",
    displayName: "Host",
    role: "host",
    debugAccess: true,
  } as const;
  let snapshot = await runtime.createRoom({
    roomCode: "DBUG",
    create: {
      app: {
        topic: {
          villageWord: "犬",
          wolfWord: "猫",
        },
      },
    },
    actor: debugHost,
  });
  snapshot = (await runtime.sendCommand({
    code: "DBUG",
    envelope: {
      expectedRevision: snapshot.revision,
      command: { type: "room/debug-add-dummy" },
    },
    actor: debugHost,
  })).room;
  assert.equal(snapshot.view.common.players[1]?.isDummy, true);
  assert.equal(snapshot.view.common.permissions.canDebug, true);
  snapshot = (await runtime.sendCommand({
    code: "DBUG",
    envelope: {
      expectedRevision: snapshot.revision,
      command: { type: "room/debug-remove-dummy", seat: 1 },
    },
    actor: debugHost,
  })).room;
  assert.equal(snapshot.view.common.players.length, 1);
  await assert.rejects(
    runtime.sendCommand({
      code: "DBUG",
      envelope: {
        expectedRevision: snapshot.revision,
        command: { type: "room/debug-add-dummy" },
      },
      actor: actor("host", "host"),
    }),
    /DEBUG_ACCESS_REQUIRED/,
  );
});

test("SDK WordWolf completes room join, play, result and rematch without platform imports", async () => {
  const runtime = createGameSdkMockRuntime({ module: wordWolfSdkServerModule, now: () => 1000 });
  let snapshot = await runtime.createRoom({
    roomCode: "WOLF",
    create: {
      app: {
        topic: {
          villageWord: "犬",
          wolfWord: "猫",
        },
      },
    },
    actor: actor("host", "host"),
  });
  for (const id of ["p2", "p3"]) snapshot = (await runtime.sendCommand({ code: "WOLF", envelope: { expectedRevision: snapshot.revision, command: { type: "room/join" } }, actor: actor(id) })).room;
  assert.equal(snapshot.view.common.permissions.canStartGame, false);
  snapshot = (await runtime.readRoom("WOLF", { playerId: "host", role: "host", debugAccess: false }))!;
  assert.equal(snapshot.view.common.permissions.canStartGame, true);
  assert.equal("id" in snapshot.view.common.players[0]!, false);
  assert.equal(JSON.stringify(snapshot.view).includes("playerId"), false);
  snapshot = (await runtime.sendCommand({ code: "WOLF", envelope: { expectedRevision: snapshot.revision, command: { type: "wordwolf/start" } }, actor: actor("host", "host") })).room;
  assert.equal(snapshot.phase, "clue");
  const playerIds = ["host", "p2", "p3"];
  const playerViews = await Promise.all(playerIds.map((playerId) => (
    runtime.readRoom("WOLF", {
      playerId,
      role: playerId === "host" ? "host" : "player",
      debugAccess: false,
    })
  )));
  const wolfSeat = playerViews.findIndex(
    (view) => view?.view.app.myWord === "猫",
  );
  assert.notEqual(wolfSeat, -1);
  assert.equal(
    playerViews.filter((view) => view?.view.app.myWord === "犬").length,
    2,
  );
  const wolfId = playerIds[wolfSeat]!;
  const spectator = await runtime.readRoom("WOLF", { playerId: null, role: "spectator", debugAccess: false });
  assert.equal(spectator?.view.app.myWord, undefined);
  for (const id of playerIds) snapshot = (await runtime.sendCommand({ code: "WOLF", envelope: { expectedRevision: snapshot.revision, command: { type: "wordwolf/submit-clue", text: `clue-${id}` } }, actor: actor(id, id === "host" ? "host" : "player") })).room;
  assert.equal(snapshot.phase, "vote");
  for (const id of playerIds) snapshot = (await runtime.sendCommand({ code: "WOLF", envelope: { expectedRevision: snapshot.revision, command: { type: "wordwolf/vote", targetSeat: wolfSeat } }, actor: actor(id, id === "host" ? "host" : "player") })).room;
  assert.equal(snapshot.phase, "wolfGuess");
  snapshot = (await runtime.sendCommand({ code: "WOLF", envelope: { expectedRevision: snapshot.revision, command: { type: "wordwolf/guess", answer: "犬" } }, actor: actor(wolfId, wolfId === "host" ? "host" : "player") })).room;
  assert.equal(snapshot.view.app.winner, "wolf");
  snapshot = (await runtime.sendCommand({ code: "WOLF", envelope: { expectedRevision: snapshot.revision, command: { type: "room/rematch" } }, actor: actor("host", "host") })).room;
  assert.equal(snapshot.phase, "lobby");
  assert.equal(snapshot.view.common.players.length, 3);
  assert.equal(snapshot.view.app.currentRound, 0);
  assert.equal(snapshot.view.app.clues.length, 0);
  assert.equal(snapshot.view.app.winner, null);
});

test("SDK WordWolf receives a reviewed word pair through the injected content source", async () => {
  const contentSource = defineGameSdkContentSource({
    async drawWords() {
      return [];
    },
    async drawWordPairs() {
      return [{
        id: "opaque-pair",
        first: {
          id: "opaque-word-1",
          surface: "海",
          reading: "うみ",
          difficulty: "normal",
        },
        second: {
          id: "opaque-word-2",
          surface: "湖",
          reading: "みずうみ",
          difficulty: "normal",
        },
        difficulty: "normal",
        relation: "水域",
      }];
    },
    async findDefinitions() {
      return [];
    },
  });
  const runtime = createGameSdkMockRuntime({
    module: wordWolfSdkServerModule,
    resources: { contentSource },
    now: () => 1000,
  });
  let snapshot = await runtime.createRoom({
    roomCode: "WORDS",
    create: { app: {} },
    actor: actor("host", "host"),
  });
  for (const id of ["p2", "p3"]) {
    snapshot = (await runtime.sendCommand({
      code: "WORDS",
      envelope: {
        expectedRevision: snapshot.revision,
        command: { type: "room/join" },
      },
      actor: actor(id),
    })).room;
  }
  snapshot = (await runtime.sendCommand({
    code: "WORDS",
    envelope: {
      expectedRevision: snapshot.revision,
      command: { type: "wordwolf/start" },
    },
    actor: actor("host", "host"),
  })).room;
  const wordsByPlayer = await Promise.all(
    ["host", "p2", "p3"].map(async (playerId) => (
      (await runtime.readRoom("WORDS", {
        playerId,
        role: playerId === "host" ? "host" : "player",
        debugAccess: false,
      }))?.view.app.myWord
    )),
  );
  assert.equal(wordsByPlayer.every((word) => word === "海" || word === "湖"), true);
  assert.equal(wordsByPlayer.includes("海"), true);
  assert.equal(wordsByPlayer.includes("湖"), true);
});

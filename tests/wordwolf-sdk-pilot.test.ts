import assert from "node:assert/strict";
import test from "node:test";
import { createGameSdkMockRuntime } from "@game-fields/game-sdk/mock-runtime";
import { wordWolfSdkServerModule } from "../games/wordwolf-sdk/server-module.ts";

const actor = (playerId: string, role: "host" | "player" = "player") => ({ playerId, displayName: playerId, role, debugAccess: false } as const);

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

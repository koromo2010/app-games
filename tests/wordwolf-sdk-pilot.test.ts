import assert from "node:assert/strict";
import test from "node:test";
import { createGameSdkMockRuntime } from "@game-fields/game-sdk/mock-runtime";
import { wordWolfSdkServerModule } from "../games/wordwolf-sdk/server-module.ts";

const actor = (playerId: string, role: "host" | "player" = "player") => ({ playerId, displayName: playerId, role, debugAccess: false } as const);

test("SDK WordWolf completes room join, play, result and rematch without platform imports", async () => {
  const runtime = createGameSdkMockRuntime({ module: wordWolfSdkServerModule, now: () => 1000 });
  let snapshot = await runtime.createRoom({ roomCode: "WOLF", create: { topic: { villageWord: "犬", wolfWord: "猫" } }, actor: actor("host", "host") });
  for (const id of ["p2", "p3"]) snapshot = (await runtime.sendCommand({ code: "WOLF", envelope: { expectedRevision: snapshot.revision, command: { type: "room/join" } }, actor: actor(id) })).room;
  assert.equal(snapshot.view.permissions.canStartGame, false);
  snapshot = (await runtime.readRoom("WOLF", { playerId: "host", role: "host", debugAccess: false }))!;
  assert.equal(snapshot.view.permissions.canStartGame, true);
  snapshot = (await runtime.sendCommand({ code: "WOLF", envelope: { expectedRevision: snapshot.revision, command: { type: "wordwolf/start" } }, actor: actor("host", "host") })).room;
  assert.equal(snapshot.phase, "clue");
  assert.equal(snapshot.view.myWord, "犬");
  const wolfView = await runtime.readRoom("WOLF", { playerId: "p3", role: "player", debugAccess: false });
  assert.equal(wolfView?.view.myWord, "猫");
  const spectator = await runtime.readRoom("WOLF", { playerId: null, role: "spectator", debugAccess: false });
  assert.equal(spectator?.view.myWord, undefined);
  for (const id of ["host", "p2", "p3"]) snapshot = (await runtime.sendCommand({ code: "WOLF", envelope: { expectedRevision: snapshot.revision, command: { type: "wordwolf/submit-clue", text: `clue-${id}` } }, actor: actor(id, id === "host" ? "host" : "player") })).room;
  assert.equal(snapshot.phase, "vote");
  for (const id of ["host", "p2", "p3"]) snapshot = (await runtime.sendCommand({ code: "WOLF", envelope: { expectedRevision: snapshot.revision, command: { type: "wordwolf/vote", targetPlayerId: "p3" } }, actor: actor(id, id === "host" ? "host" : "player") })).room;
  assert.equal(snapshot.phase, "wolfGuess");
  snapshot = (await runtime.sendCommand({ code: "WOLF", envelope: { expectedRevision: snapshot.revision, command: { type: "wordwolf/guess", answer: "犬" } }, actor: actor("p3") })).room;
  assert.equal(snapshot.view.winner, "wolf");
  snapshot = (await runtime.sendCommand({ code: "WOLF", envelope: { expectedRevision: snapshot.revision, command: { type: "room/rematch" } }, actor: actor("host", "host") })).room;
  assert.equal(snapshot.phase, "lobby");
  assert.equal(snapshot.view.players.length, 3);
});

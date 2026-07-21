import { createGameSdkMockRuntime } from "@game-fields/game-sdk/mock-runtime";
import { myFirstGameServerModule } from "./server-module.js";

const host = {
  playerId: "host-account",
  displayName: "Host",
  role: "host",
  debugAccess: false,
} as const;
const player = {
  playerId: "player-account",
  displayName: "Player",
  role: "player",
  debugAccess: false,
} as const;
const runtime = createGameSdkMockRuntime({ module: myFirstGameServerModule });

let room = await runtime.createRoom({ roomCode: "DEMO", create: { target: 2 }, actor: host });
console.log("部屋作成", room.view);
room = (await runtime.sendCommand({
  code: room.code,
  envelope: { expectedRevision: room.revision, command: { type: "join" } },
  actor: player,
})).room;
console.log("参加", room.view);
room = (await runtime.sendCommand({
  code: room.code,
  envelope: { expectedRevision: room.revision, command: { type: "start" } },
  actor: host,
})).room;
console.log("ゲーム開始", room.view);
room = (await runtime.sendCommand({
  code: room.code,
  envelope: { expectedRevision: room.revision, command: { type: "advance" } },
  actor: host,
})).room;
room = (await runtime.sendCommand({
  code: room.code,
  envelope: { expectedRevision: room.revision, command: { type: "advance" } },
  actor: player,
})).room;
console.log("ゲーム終了", { revision: room.revision, view: room.view });

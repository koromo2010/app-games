import assert from "node:assert/strict";
import test from "node:test";
import {
  nextOnlineRoomRealtimeReconnectDelay,
  onlineRoomRealtimeChannel,
  onlineRoomRealtimeTimings,
  parseOnlineRoomRevisionEvent,
  parseOnlineRoomSubscription,
} from "../lib/online-room-realtime-protocol.ts";
import {
  onlineRoomRealtimeEnabled,
  onlineRoomRealtimeReaderCommands,
} from "../lib/online-room-realtime-server.ts";
import { namespaceRedisCommand } from "../lib/redis-store.ts";

test("部屋更新通知の購読はopaque capabilityと許可済みfamilyだけを受け付ける", () => {
  const capability = `${"a".repeat(100)}.${"b".repeat(43)}`;
  assert.deepEqual(parseOnlineRoomSubscription({ type: "subscribe", capability, families: ["room-revision"] }), {
    type: "subscribe", capability, families: ["room-revision"],
  });
  assert.equal(parseOnlineRoomSubscription({ type: "subscribe", game: "tahoiya", code: "AB12" }), null);
  assert.equal(parseOnlineRoomSubscription({ type: "subscribe", capability, families: ["chat"] }), null);
  assert.equal(onlineRoomRealtimeChannel("wordwolf", "xy99"), "wordwolf:XY99");
});

test("SDK channelは名前空間付きtopicと4〜12文字の部屋番号を維持する", () => {
  assert.equal(
    onlineRoomRealtimeChannel("sdk:wordwolf-sdk", "longcode12"),
    "sdk:wordwolf-sdk:LONGCODE12",
  );
});

test("WebSocket通知はrevisionだけを運び、部屋の秘密情報を受け付けない", () => {
  const event = parseOnlineRoomRevisionEvent({
    type: "room-updated", game: "code-intercept", code: "Q1W2", revision: 12, timestamp: 1234,
  });
  assert.deepEqual(event, {
    type: "room-updated", game: "code-intercept", code: "Q1W2", revision: 12, timestamp: 1234,
  });
  assert.equal(parseOnlineRoomRevisionEvent({
    type: "room-updated", game: "code-intercept", code: "Q1W2", revision: -1, timestamp: 1234,
  }), null);
  assert.deepEqual(parseOnlineRoomRevisionEvent({
    type: "room-updated",
    game: "sdk:wordwolf-sdk",
    code: "LONGCODE12",
    revision: 3,
    timestamp: 4321,
    room: { secret: "ignored" },
  }), {
    type: "room-updated",
    game: "sdk:wordwolf-sdk",
    code: "LONGCODE12",
    revision: 3,
    timestamp: 4321,
  });
});

test("WebSocketは既定でdevelop、Preview、ローカル開発だけ有効にする", () => {
  assert.equal(onlineRoomRealtimeEnabled({
    VERCEL_ENV: "production", VERCEL_GIT_COMMIT_REF: "develop", NODE_ENV: "production",
  }), true);
  assert.equal(onlineRoomRealtimeEnabled({
    VERCEL_ENV: "production", VERCEL_GIT_COMMIT_REF: "main", NODE_ENV: "production",
  }), false);
  assert.equal(onlineRoomRealtimeEnabled({ VERCEL_ENV: "preview", NODE_ENV: "production" }), true);
  assert.equal(onlineRoomRealtimeEnabled({ VERCEL_ENV: "production", NODE_ENV: "production" }), false);
  assert.equal(onlineRoomRealtimeEnabled({ NODE_ENV: "development" }), true);
  assert.equal(onlineRoomRealtimeEnabled({ NODE_ENV: "production", VERCEL_ENV: "preview", ONLINE_ROOM_WEBSOCKET_ENABLED: "0" }), false);
  assert.equal(onlineRoomRealtimeEnabled({ NODE_ENV: "production", VERCEL_ENV: "production", ONLINE_ROOM_WEBSOCKET_ENABLED: "1" }), true);
});

test("WebSocket再接続は30秒を上限に指数バックオフする", () => {
  assert.equal(nextOnlineRoomRealtimeReconnectDelay(1_000), 2_000);
  assert.equal(nextOnlineRoomRealtimeReconnectDelay(16_000), 30_000);
  assert.equal(nextOnlineRoomRealtimeReconnectDelay(30_000), 30_000);
  assert.equal(onlineRoomRealtimeTimings.reconciliation, 45_000);
});

test("developmentのrealtime writerとdirect socket readerは同じnamespaced stream keyを使う", () => {
  const prefix = "app-dev:";
  const writer = namespaceRedisCommand(
    ["XADD", "online-room:events:v1", "*", "d", "payload"],
    prefix,
  );
  const reader = onlineRoomRealtimeReaderCommands(prefix, "12-0");
  const streamIndex = reader.read.indexOf("STREAMS");

  assert.equal(writer[1], "app-dev:online-room:events:v1");
  assert.equal(reader.tail[1], writer[1]);
  assert.equal(streamIndex > -1, true);
  assert.equal(reader.read[streamIndex + 1], writer[1]);
  assert.equal(reader.read.at(-1), "12-0");
});

test("productionのrealtime stream keyは既存prefixなしを維持する", () => {
  const reader = onlineRoomRealtimeReaderCommands("");
  assert.equal(reader.tail[1], "online-room:events:v1");
  assert.equal(reader.read[reader.read.indexOf("STREAMS") + 1], "online-room:events:v1");
});

import assert from "node:assert/strict";
import test from "node:test";
import {
  onlineRoomRealtimeChannel,
  parseOnlineRoomRevisionEvent,
  parseOnlineRoomSubscription,
} from "../lib/online-room-realtime-protocol.ts";
import { onlineRoomRealtimeEnabled } from "../lib/online-room-realtime-server.ts";

test("部屋更新通知はゲームと4文字の部屋番号だけを購読する", () => {
  assert.deepEqual(parseOnlineRoomSubscription({ type: "subscribe", game: "tahoiya", code: "ab12" }), {
    type: "subscribe", game: "tahoiya", code: "AB12",
  });
  assert.equal(parseOnlineRoomSubscription({ type: "subscribe", game: "unknown", code: "AB12" }), null);
  assert.equal(parseOnlineRoomSubscription({ type: "subscribe", game: "tahoiya", code: "TOO-LONG" }), null);
  assert.equal(onlineRoomRealtimeChannel("wordwolf", "xy99"), "wordwolf:XY99");
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
});

test("WebSocketは既定でPreviewとローカル開発だけ有効にする", () => {
  assert.equal(onlineRoomRealtimeEnabled({ VERCEL_ENV: "preview", NODE_ENV: "production" }), true);
  assert.equal(onlineRoomRealtimeEnabled({ VERCEL_ENV: "production", NODE_ENV: "production" }), false);
  assert.equal(onlineRoomRealtimeEnabled({ NODE_ENV: "development" }), true);
  assert.equal(onlineRoomRealtimeEnabled({ VERCEL_ENV: "preview", ONLINE_ROOM_WEBSOCKET_ENABLED: "0" }), false);
  assert.equal(onlineRoomRealtimeEnabled({ VERCEL_ENV: "production", ONLINE_ROOM_WEBSOCKET_ENABLED: "1" }), true);
});

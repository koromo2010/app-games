import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  createRoomChatCursor,
  parseRoomChatCursor,
  parseRoomChatSendInput,
  validateRoomChatText,
} from "../lib/room-chat-contract.ts";
import { createRoomChatService } from "../lib/room-chat-service.ts";
import type { RoomChatStoreDriver } from "../lib/room-chat-store.ts";
import { roomChatEnabled, roomChatRetention } from "../lib/room-chat-policy.ts";
import { roomChatText } from "../app/components/room-chat/room-chat-i18n.ts";
import { createOnlineRoomRealtimeAuthorizer } from "../lib/online-room-realtime-authorization.ts";
import { parseOnlineRoomRealtimeCapability } from "../lib/online-room-realtime-capability.ts";
import { parseOnlineRoomChatHintEvent, parseOnlineRoomSubscription } from "../lib/online-room-realtime-protocol.ts";
import { deliverOnlineRoomEvent, type OnlineRoomRealtimeSocketState } from "../lib/online-room-realtime-server.ts";
import type { WebSocket } from "ws";

const env = { ...process.env, NODE_ENV: "test" as const, PLAYER_SESSION_SECRET: "t195-test-secret-that-is-at-least-32-characters" };
const target = { game: "wordwolf" as const, code: "AB12", roomInstanceId: "room-instance-0001" };
const requestId = "123e4567-e89b-42d3-a456-426614174000";

function memoryDriver(): RoomChatStoreDriver {
  type StoredRecord = Parameters<RoomChatStoreDriver["append"]>[0]["record"];
  const streams = new Map<string, Array<{ entryId: string; record: StoredRecord }>>();
  const dedupe = new Map<string, { entryId: string; record: StoredRecord }>();
  let sequence = 0;
  return {
    async append(input) {
      const prior = dedupe.get(`${input.scope}:${input.dedupeKey}`);
      if (prior) return { ...prior, inserted: false };
      sequence += 1;
      const saved = { entryId: `${sequence}-0`, record: input.record };
      const stream = streams.get(input.scope) ?? [];
      stream.push(saved);
      while (stream.length > input.maximumMessages) stream.shift();
      streams.set(input.scope, stream);
      dedupe.set(`${input.scope}:${input.dedupeKey}`, saved);
      return { ...saved, inserted: true };
    },
    async page(input) {
      const stream = streams.get(input.scope) ?? [];
      const index = input.afterId ? stream.findIndex((entry) => entry.entryId === input.afterId) : -1;
      if (input.afterId && index < 0) return { entries: [], hasMore: false, cursorFound: false };
      const values = stream.slice(index + 1, index + 1 + input.limit + 1);
      return { entries: values.slice(0, input.limit), hasMore: values.length > input.limit, cursorFound: true };
    },
    async delete(scope) { streams.delete(scope); },
  };
}

const validBodies = ["こんにちは", "hello", "<script>alert(1)</script>", "line 1\nline 2", "😀 café"];
for (const body of validBodies) test(`T195 preserves valid text: ${body.slice(0, 12)}`, () => assert.equal(validateRoomChatText(body), body));

const invalidBodies: Array<[string, string]> = [
  ["blank", "   "], ["nul", "a\0b"], ["control", "a\u0007b"], ["lone high surrogate", "\ud800"],
  ["lone low surrogate", "\udc00"], ["too many lines", "a\n\n\n\n\n\n\n\n\nb"], ["too many scalars", "a".repeat(501)], ["too many bytes", "😀".repeat(501)],
];
for (const [name, body] of invalidBodies) test(`T195 rejects ${name}`, () => assert.equal(validateRoomChatText(body), null));

test("T195 parses exact canonical send input and rejects code-only", () => {
  assert.deepEqual(parseRoomChatSendInput({ ...target, requestId, body: "同じRoom" }), { ...target, requestId, body: "同じRoom" });
  assert.equal(parseRoomChatSendInput({ game: "wordwolf", code: "AB12", requestId, body: "no generation" }), null);
});

test("T195 cursor is generation-bound and tamper-evident", () => {
  const cursor = createRoomChatCursor(target.roomInstanceId, "1-0", env);
  assert.equal(parseRoomChatCursor(cursor, target.roomInstanceId, env), "1-0");
  assert.equal(parseRoomChatCursor(cursor, "room-instance-0002", env), undefined);
  assert.equal(parseRoomChatCursor(`${cursor.slice(0, -1)}x`, target.roomInstanceId, env), undefined);
});

test("T195 send is idempotent and returns one message", async () => {
  const service = createRoomChatService({ driver: memoryDriver(), env, resolveAccess: async (actorId, input) => ({ ...input, actorId, environment: "test", expiresAt: 100_000 }) });
  const first = await service.send("actor-a", { ...target, requestId, body: "hello" }, 10_000);
  const second = await service.send("actor-a", { ...target, requestId, body: "hello" }, 10_001);
  assert.ok("message" in first && "message" in second);
  if ("message" in first && "message" in second) {
    assert.equal(first.message.messageId, second.message.messageId);
    assert.equal(first.message.inserted, true);
    assert.equal(second.message.inserted, false);
  }
});

test("T195 independent Room generations never share messages", async () => {
  const driver = memoryDriver();
  const service = createRoomChatService({ driver, env, resolveAccess: async (actorId, input) => ({ ...input, actorId, environment: "test", expiresAt: 100_000 }) });
  await service.send("actor-a", { ...target, requestId, body: "generation A" }, 10_000);
  const other = { ...target, roomInstanceId: "room-instance-0002" };
  const page = await service.page("actor-a", other);
  assert.deepEqual("messages" in page ? page.messages : null, []);
});

test("T195 stale cursor becomes an explicit gap after bounded retention", async () => {
  const driver = memoryDriver();
  const service = createRoomChatService({ driver, env, resolveAccess: async (actorId, input) => ({ ...input, actorId, environment: "test", expiresAt: 999_999 }) });
  let oldCursor = "";
  for (let index = 0; index <= roomChatRetention.maximumMessages; index += 1) {
    const id = `123e4567-e89b-42d3-a456-${String(index).padStart(12, "0")}`;
    const result = await service.send("actor-a", { ...target, requestId: id, body: String(index) }, 10_000 + index);
    if (index === 0 && "message" in result) oldCursor = result.message.orderCursor;
  }
  const page = await service.page("actor-a", { ...target, cursor: oldCursor });
  assert.deepEqual(page, { error: "ROOM_CHAT_CURSOR_EXPIRED" });
});

test("T195 revoked participant cannot send or backfill", async () => {
  const service = createRoomChatService({ driver: memoryDriver(), env, resolveAccess: async () => null });
  assert.deepEqual(await service.send("removed", { ...target, requestId, body: "denied" }), { error: "ROOM_CHAT_MEMBERSHIP_REQUIRED" });
  assert.deepEqual(await service.page("removed", target), { error: "ROOM_CHAT_MEMBERSHIP_REQUIRED" });
});

test("T195 chat capability requires participant and exact generation", async () => {
  const base = { environment: "test" as const, actorId: "actor-a", ...target, targetDigest: "a".repeat(64), role: "participant" as const, sessionEpoch: 1 };
  const authorizer = createOnlineRoomRealtimeAuthorizer({ async resolve() { return base; }, async sessionEpoch() { return 1; } }, { env, now: () => 10_000 });
  const token = await authorizer.mint({ actorId: "actor-a", game: target.game, code: target.code, family: "chat-hint", expectedRoomInstanceId: target.roomInstanceId });
  assert.ok(token);
  assert.equal(parseOnlineRoomRealtimeCapability(token!, { env, now: 10_000 })?.family, "chat-hint");
  assert.equal(await authorizer.mint({ actorId: "actor-a", game: target.game, code: target.code, role: "spectator", family: "chat-hint" }), null);
  assert.equal(await authorizer.mint({ actorId: "actor-a", game: target.game, code: target.code, family: "chat-hint", expectedRoomInstanceId: "room-instance-0002" }), null);
});

test("T195 chat hint is body-free and subscription family is strict", () => {
  const event = parseOnlineRoomChatHintEvent({ type: "room-chat-updated", ...target, latestCursor: "opaque", timestamp: 1, body: "must be ignored" });
  assert.ok(event);
  assert.equal("body" in event!, false);
  const capability = `${"a".repeat(100)}.${"b".repeat(43)}`;
  assert.deepEqual(parseOnlineRoomSubscription({ type: "subscribe", capability, families: ["chat-hint"] }), { type: "subscribe", capability, families: ["chat-hint"] });
  assert.equal(parseOnlineRoomSubscription({ type: "subscribe", capability, families: ["chat-hint", "room-revision"] }), null);
});

test("T195 authoritative revocation commit produces zero chat notifications", async () => {
  const base = { environment: "test" as const, actorId: "actor-a", ...target, targetDigest: "a".repeat(64), role: "participant" as const, sessionEpoch: 1 };
  let epoch = 1;
  const authorizer = createOnlineRoomRealtimeAuthorizer({ async resolve() { return base; }, async sessionEpoch() { return epoch; } }, { env, now: () => 10_000 });
  const token = (await authorizer.mint({ actorId: base.actorId, game: base.game, code: base.code, family: "chat-hint", expectedRoomInstanceId: base.roomInstanceId }))!;
  const capability = parseOnlineRoomRealtimeCapability(token, { env, now: 10_000 })!;
  epoch = 2;
  const sent: string[] = [];
  let closed = 0;
  const socket = { readyState: 1, send(value: string) { sent.push(value); }, close() { closed += 1; } } as unknown as WebSocket;
  const sockets = new Map<WebSocket, OnlineRoomRealtimeSocketState>([[socket, { actorId: base.actorId, capability, capabilityToken: token }]]);
  await deliverOnlineRoomEvent({ type: "room-chat-updated", game: base.game, code: base.code, roomInstanceId: base.roomInstanceId, latestCursor: "opaque", timestamp: 10_001 }, sockets, (value) => authorizer.authorize(value));
  assert.equal(sent.length, 0);
  assert.equal(closed, 1);
});

test("T195 Development/test policy is enabled and Production remains off", () => {
  assert.equal(roomChatEnabled("development"), true);
  assert.equal(roomChatEnabled("test"), true);
  assert.equal(roomChatEnabled("production"), false);
});

test("T195 JA/EN shell copy differs while player text contract stays unchanged", () => {
  assert.equal(roomChatText("ja").title, "ルームチャット");
  assert.equal(roomChatText("en").title, "Room chat");
  assert.equal(validateRoomChatText("日本語 and English"), "日本語 and English");
});

test("T195 all common consumers mount one shared shell and Preview stays excluded", () => {
  const files: Array<[string, string]> = [
    ["wordwolf", "app/wordwolf/WordWolfGame.tsx"], ["tahoiya", "app/tahoiya/TahoiyaGame.tsx"], ["hodoai", "app/hodoai-talk/HodoaiTalkGame.tsx"],
    ["kotoba-senpuku", "app/kotoba-senpuku/KotobaSenpukuGame.tsx"], ["nigoichi", "app/nigoichi/NigoichiGame.tsx"], ["northern-branch", "app/northern-branch/NorthernBranchGame.tsx"],
    ["code-intercept", "app/code-intercept/CodeInterceptGame.tsx"], ["daifugo", "app/daifugo/DaifugoGame.tsx"], ["canvas", "app/canvas/CanvasGame.tsx"],
  ];
  for (const [game, path] of files) {
    const source = readFileSync(path, "utf8");
    assert.match(source, /CommonRoomChatMount/);
    assert.match(source, new RegExp(`game=["']${game}["']`));
  }
  assert.match(readFileSync("app/components/game-sdk/GameSdkFrameView.tsx", "utf8"), /!previewOnly && <CommonRoomChatMount/);
  assert.match(readFileSync("app/sdk-games/[gameId]/ApprovedSdkGameShell.tsx", "utf8"), /CommonRoomChatMount/);
});

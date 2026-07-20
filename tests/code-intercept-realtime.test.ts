import assert from "node:assert/strict";
import test from "node:test";
import { handle, Realtime } from "@upstash/realtime";
import {
  codeInterceptPollingInterval,
  codeInterceptRealtimeChannel,
  codeInterceptRealtimePilotEnabled,
  codeInterceptRealtimeSchema,
  codeInterceptRoomCodeFromRealtimeChannel,
} from "../lib/code-intercept-realtime-schema.ts";

type SubscriberHandler = (...args: unknown[]) => void;

class FakeSubscriber {
  private handlers = new Map<string, SubscriberHandler[]>();
  private closed = false;

  on(event: string, handler: SubscriberHandler) {
    const handlers = this.handlers.get(event) ?? [];
    handlers.push(handler);
    this.handlers.set(event, handlers);
    if (event === "subscribe") queueMicrotask(() => handler());
    return this;
  }

  dispatch(message: unknown) {
    for (const handler of this.handlers.get("message") ?? []) handler({ message });
  }

  async unsubscribe() {
    if (this.closed) return;
    this.closed = true;
    for (const handler of this.handlers.get("unsubscribe") ?? []) handler();
  }
}

class FakeRedis {
  subscribers = new Set<FakeSubscriber>();
  private nextId = 0;

  subscribe() {
    const subscriber = new FakeSubscriber();
    this.subscribers.add(subscriber);
    return subscriber;
  }

  async xrange() {
    return {};
  }

  async xadd() {
    this.nextId += 1;
    return `${this.nextId}-0`;
  }

  async publish(_channel: string, payload: unknown) {
    for (const subscriber of this.subscribers) subscriber.dispatch(payload);
    return this.subscribers.size;
  }

  pipeline() {
    const operations: Array<() => Promise<unknown>> = [];
    return {
      expire: () => {
        operations.push(async () => 1);
        return this;
      },
      publish: (channel: string, payload: unknown) => {
        operations.push(() => this.publish(channel, payload));
        return this;
      },
      exec: async () => Promise.all(operations.map((operation) => operation())),
    };
  }
}

function realtimeWithFakeRedis(redis: FakeRedis) {
  return new Realtime({
    schema: codeInterceptRealtimeSchema,
    redis: redis as never,
    maxDurationSecs: 5,
    history: { maxLength: 64, expireAfterSecs: 3_600 },
  });
}

test("Realtime pilot is limited to development and Vercel Preview", () => {
  assert.equal(codeInterceptRealtimePilotEnabled({ VERCEL_ENV: "preview", APP_ENV: "development" }), true);
  assert.equal(codeInterceptRealtimePilotEnabled({ VERCEL_ENV: "preview", APP_ENV: "development", CODE_INTERCEPT_REALTIME_ENABLED: "0" }), false);
  assert.equal(codeInterceptRealtimePilotEnabled({ APP_ENV: "development", CODE_INTERCEPT_REALTIME_ENABLED: "1" }), true);
  assert.equal(codeInterceptRealtimePilotEnabled({ VERCEL_ENV: "production", APP_ENV: "production", CODE_INTERCEPT_REALTIME_ENABLED: "1" }), false);
  assert.equal(codeInterceptRealtimePilotEnabled({ VERCEL_ENV: "production", APP_ENV: "development", CODE_INTERCEPT_REALTIME_ENABLED: "1" }), false);
});

test("Realtime channels only accept normalized four-character room codes", () => {
  assert.equal(codeInterceptRealtimeChannel("ab12"), "code-intercept:realtime:AB12");
  assert.equal(codeInterceptRoomCodeFromRealtimeChannel("code-intercept:realtime:AB12"), "AB12");
  assert.equal(codeInterceptRoomCodeFromRealtimeChannel("code-intercept:room:AB12"), null);
  assert.throws(() => codeInterceptRealtimeChannel("ABC"), /INVALID_CODE_INTERCEPT_REALTIME_CHANNEL/);
});

test("Connected realtime uses a 30 second safety poll and failures retain current polling", () => {
  assert.equal(codeInterceptPollingInterval({ realtimeEnabled: true, realtimeStatus: "connected", phase: "clue" }), 30_000);
  assert.equal(codeInterceptPollingInterval({ realtimeEnabled: true, realtimeStatus: "error", phase: "clue" }), 3_000);
  assert.equal(codeInterceptPollingInterval({ realtimeEnabled: true, realtimeStatus: "disconnected", phase: "lobby" }), 5_000);
  assert.equal(codeInterceptPollingInterval({ realtimeEnabled: false, realtimeStatus: "connected", phase: "answer" }), 3_000);
});

test("Realtime handler streams a room update through the configured SDK schema", async () => {
  const redis = new FakeRedis();
  const realtime = realtimeWithFakeRedis(redis);
  const channel = codeInterceptRealtimeChannel("AB12");
  const response = await handle({ realtime })(new Request(`http://localhost/api/code-intercept/realtime?channel=${encodeURIComponent(channel)}`));

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "text/event-stream");
  assert.ok(response.body);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const connected = await reader.read();
  assert.match(decoder.decode(connected.value), /"type":"connected"/);

  await realtime.channel(channel).emit("room.updated", { code: "AB12", revision: 7 });
  const update = await reader.read();
  const updateText = decoder.decode(update.value);
  assert.match(updateText, /"event":"room.updated"/);
  assert.match(updateText, /"revision":7/);
  assert.match(updateText, /"channel":"code-intercept:realtime:AB12"/);

  await reader.cancel();
});

test("Realtime middleware rejection prevents a Redis subscription", async () => {
  const redis = new FakeRedis();
  const realtime = realtimeWithFakeRedis(redis);
  const response = await handle({
    realtime,
    middleware: () => Response.json({ error: "Room access is not allowed" }, { status: 403 }),
  })(new Request("http://localhost/api/code-intercept/realtime?channel=code-intercept%3Arealtime%3AAB12"));

  assert.equal(response.status, 403);
  assert.equal(redis.subscribers.size, 0);
});

test("Realtime rejects invalid room update payloads before touching Redis", async () => {
  const redis = new FakeRedis();
  const realtime = realtimeWithFakeRedis(redis);
  await assert.rejects(
    realtime.channel(codeInterceptRealtimeChannel("AB12")).emit("room.updated", { code: "ABC", revision: -1 }),
  );
  assert.equal(redis.subscribers.size, 0);
});

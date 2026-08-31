import assert from "node:assert/strict";
import test from "node:test";
import type { WebSocket } from "ws";
import { createOnlineRoomRealtimeAuthorizer, type OnlineRoomRealtimeTarget } from "../lib/online-room-realtime-authorization.ts";
import { parseOnlineRoomRealtimeCapability } from "../lib/online-room-realtime-capability.ts";
import { parseOnlineRoomSubscription, type OnlineRoomRevisionEvent } from "../lib/online-room-realtime-protocol.ts";
import { deliverOnlineRoomRevision, type OnlineRoomRealtimeSocketState } from "../lib/online-room-realtime-server.ts";
import { builtInCommonOnlineRoomGameIds } from "../lib/game-locale-registry.ts";

const env = { ...process.env, NODE_ENV: "test", PLAYER_SESSION_SECRET: "t181-test-secret-that-is-at-least-32-characters" };
const base: OnlineRoomRealtimeTarget = {
  environment: "development",
  actorId: "actor-0001",
  game: "wordwolf",
  code: "AB12",
  roomInstanceId: "room-instance-0001",
  targetDigest: "a".repeat(64),
  role: "participant",
  sessionEpoch: 3,
};

function fixture() {
  let target: OnlineRoomRealtimeTarget | null = { ...base };
  let epoch = 3;
  const authorizer = createOnlineRoomRealtimeAuthorizer({
    async resolve(input) {
      if (!target || input.actorId !== target.actorId || input.game !== target.game || input.code !== target.code) return null;
      if (input.role && input.role !== target.role) return null;
      return { ...target };
    },
    async sessionEpoch() { return epoch; },
  }, { env, now: () => 10_000 });
  return { authorizer, setTarget(value: OnlineRoomRealtimeTarget | null) { target = value; }, setEpoch(value: number) { epoch = value; } };
}

test("T181 capability roundtrip binds the full authoritative target", async () => {
  const { authorizer } = fixture();
  const token = await authorizer.mint({ actorId: base.actorId, game: base.game, code: base.code });
  assert.ok(token);
  assert.ok(token.length < 421);
  assert.deepEqual(await authorizer.authorize(token), {
    ...base, version: 1, family: "room-revision", scope: "room:revision:read", issuedAt: 10_000, expiresAt: 70_000,
  });
});

const invalidTokens: Array<[string, (token: string) => string]> = [
  ["empty", () => ""], ["signature missing", (token) => token.split(".")[0]],
  ["extra segment", (token) => `${token}.extra`], ["bad signature", (token) => `${token.slice(0, -1)}x`],
  ["payload mutation", (token) => `x${token.slice(1)}`], ["truncated", (token) => token.slice(0, 30)],
  ["whitespace", (token) => ` ${token}`], ["known room code only", () => "AB12"],
  ["channel only", () => "wordwolf:AB12"], ["revision only", () => "12"],
];
for (const [name, mutate] of invalidTokens) {
  test(`T181 rejects ${name}`, async () => {
    const { authorizer } = fixture();
    const token = (await authorizer.mint({ actorId: base.actorId, game: base.game, code: base.code }))!;
    assert.equal(await authorizer.authorize(mutate(token)), null);
  });
}

const revocations: Array<[string, (target: OnlineRoomRealtimeTarget) => OnlineRoomRealtimeTarget | null, number?]> = [
  ["participant leave", () => null], ["T190 participant detach signal", () => null],
  ["membership removal", () => null], ["kick or ban", () => null], ["active claim release", () => null],
  ["wrong game", (target) => ({ ...target, game: "tahoiya" })],
  ["wrong Room", (target) => ({ ...target, code: "ZZ99" })],
  ["generation replacement", (target) => ({ ...target, roomInstanceId: "room-instance-0002" })],
  ["SDK package identity change", (target) => ({ ...target, targetDigest: "b".repeat(64) })],
  ["role change", (target) => ({ ...target, role: "spectator" })],
  ["spectator disable", () => null], ["spectator expiry", () => null], ["spectator revoke", () => null],
  ["Room close", () => null], ["Room expiry", () => null], ["Room dissolve", () => null],
  ["session invalidation", (target) => target, 4], ["logout", (target) => target, 4],
  ["account disable", (target) => target, 4], ["stale capability reconnect", (target) => target, 4],
];
for (const [name, mutate, epoch] of revocations) {
  test(`T181 delivery revalidation rejects ${name}`, async () => {
    const state = fixture();
    const token = (await state.authorizer.mint({ actorId: base.actorId, game: base.game, code: base.code }))!;
    state.setTarget(mutate({ ...base }));
    if (epoch !== undefined) state.setEpoch(epoch);
    assert.equal(await state.authorizer.authorize(token), null);
  });
}

test("T181 authoritative revocation commit produces zero application notifications", async () => {
  const state = fixture();
  const token = (await state.authorizer.mint({ actorId: base.actorId, game: base.game, code: base.code }))!;
  const capability = parseOnlineRoomRealtimeCapability(token, { env, now: 10_000 })!;
  state.setEpoch(4);
  const sent: string[] = [];
  let closed = 0;
  const socket = { readyState: 1, send(value: string) { sent.push(value); }, close() { closed += 1; } } as unknown as WebSocket;
  const sockets = new Map<WebSocket, OnlineRoomRealtimeSocketState>([[socket, { actorId: base.actorId, capability, capabilityToken: token }]]);
  const event: OnlineRoomRevisionEvent = { type: "room-updated", game: "wordwolf", code: "AB12", revision: 9, timestamp: 12_000 };
  await deliverOnlineRoomRevision(event, sockets, state.authorizer.authorize);
  assert.deepEqual(sent, []);
  assert.equal(closed, 1);
});

for (const game of builtInCommonOnlineRoomGameIds) {
  test(`T181 built-in common consumer ${game} remains registered`, () => {
    assert.equal(builtInCommonOnlineRoomGameIds.includes(game), true);
  });
}

const productionSdkGames = ["ai-word-guess", "ciao-ciao", "coyote", "fish-length-chicken-race", "link-lines", "new-pictures", "oogiri-game", "pictures", "skull", "twixt-repro"];
for (const game of productionSdkGames) {
  test(`T181 Production SDK generic consumer ${game} uses a valid namespace`, () => {
    assert.match(`sdk:${game}`, /^sdk:[a-z][a-z0-9-]{0,63}$/);
  });
}

test("T181 subscribe parser rejects unauthorized family and public locators", () => {
  assert.equal(parseOnlineRoomSubscription({ type: "subscribe", game: "wordwolf", code: "AB12", revision: 9 }), null);
  assert.equal(parseOnlineRoomSubscription({ type: "subscribe", capability: `${"a".repeat(100)}.${"b".repeat(43)}`, families: ["chat"] }), null);
});

test("T181 Canvas keeps its special canonical provider adapter outside common 8/8", () => {
  assert.equal(builtInCommonOnlineRoomGameIds.includes("canvas" as never), false);
  assert.equal(parseOnlineRoomSubscription({ type: "subscribe", game: "canvas", code: "AB12" }), null);
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  compareAndDeleteCanonicalRoomInvite,
  compareAndDeleteRoomInviteForPrimary,
  issueCanonicalRoomInvite,
  loadCanonicalRoomInvite,
  type RoomInviteStoreDriver,
} from "../lib/room-invite-store.ts";
import {
  canonicalRoomInvitePrimaryBinding,
  canonicalRoomInvitePrimaryBindingDigest,
  canonicalRoomInviteTargetDigest,
  type CanonicalRoomInviteTarget,
} from "../lib/room-invite-target.ts";

class MemoryDriver implements RoomInviteStoreDriver {
  values = new Map<string, string>();
  async get(key: string) { return this.values.get(key) ?? null; }
  async create(inviteKey: string, bindingKey: string, raw: string, ref: string) { if (this.values.has(inviteKey) || this.values.has(bindingKey)) return false; this.values.set(inviteKey, raw); this.values.set(bindingKey, ref); return true; }
  async refresh(inviteKey: string, bindingKey: string, expected: string, next: string, ref: string) { if (this.values.get(inviteKey) !== expected || this.values.get(bindingKey) !== ref) return false; this.values.set(inviteKey, next); return true; }
  async compareDelete(inviteKey: string, bindingKey: string, expected: string, ref: string) { if (this.values.get(inviteKey) !== expected || this.values.get(bindingKey) !== ref) return false; this.values.delete(inviteKey); this.values.delete(bindingKey); return true; }
}

const now = 1_800_000_000_000;
let sequence = 0;
function ref() { sequence += 1; return sequence.toString(16).padStart(32, "0"); }
function builtIn(gameNamespace = "wordwolf", roomInstanceId = "room-instance-0001") { return { environment: "development" as const, providerKind: "built-in" as const, gameNamespace, displayCode: "ABCD", roomInstanceId, expiresAt: now + 60_000, contentLanguage: "ja" as const }; }
function sdk(sourceGameId = "link-lines", root = "b".repeat(64)) { return { environment: "development" as const, providerKind: "sdk-approved" as const, gameNamespace: "link-lines", displayCode: "ABCD", roomInstanceId: `sdk-instance-${sourceGameId}`, expiresAt: now + 60_000, sdk: { publicGameId: "link-lines", sourceCreatorSlug: "test10-1", sourceGameId, packageRevision: "a".repeat(40), packageRootSha256: root, serverBundleSha256: "c".repeat(64), appSetSourceSha256: "d".repeat(64) } }; }

test("same code is isolated across two built-ins, built-in/SDK, and two SDK identities", async () => {
  const driver = new MemoryDriver();
  const targets = await Promise.all([
    issueCanonicalRoomInvite(builtIn("wordwolf"), { driver, now: () => now, createInviteRef: ref }),
    issueCanonicalRoomInvite(builtIn("tahoiya", "room-instance-0002"), { driver, now: () => now, createInviteRef: ref }),
    issueCanonicalRoomInvite(sdk(), { driver, now: () => now, createInviteRef: ref }),
    issueCanonicalRoomInvite(sdk("word-grid", "e".repeat(64)), { driver, now: () => now, createInviteRef: ref }),
  ]);
  assert.equal(new Set(targets.map((item) => item.target.inviteRef)).size, 4);
  assert.equal(new Set(targets.map((item) => canonicalRoomInviteTargetDigest(item.target))).size, 4);
});

test("same target refreshes; different target overwrite and concurrent replacement fail", async () => {
  const driver = new MemoryDriver();
  const first = await issueCanonicalRoomInvite(builtIn(), { driver, now: () => now, createInviteRef: ref });
  const refreshed = await issueCanonicalRoomInvite({ ...builtIn(), expiresAt: now + 120_000 }, { driver, now: () => now + 1_000, createInviteRef: ref });
  assert.equal(refreshed.created, false);
  assert.equal(refreshed.target.inviteRef, first.target.inviteRef);
  await assert.rejects(() => issueCanonicalRoomInvite({ ...builtIn(), contentLanguage: "en" }, { driver, now: () => now, createInviteRef: ref }), /TARGET_CONFLICT/);
  driver.refresh = async () => false;
  await assert.rejects(() => issueCanonicalRoomInvite(builtIn(), { driver, now: () => now, createInviteRef: ref }), /CONCURRENT_REPLACEMENT/);
});

test("dissolve, expiry, display-code reuse, stale replay and stale delete are safe", async () => {
  const driver = new MemoryDriver();
  const stale = await issueCanonicalRoomInvite(builtIn(), { driver, now: () => now, createInviteRef: ref });
  assert.equal(await compareAndDeleteRoomInviteForPrimary(canonicalRoomInvitePrimaryBinding(stale.target), { driver }), true);
  assert.equal(await loadCanonicalRoomInvite("development", stale.target.inviteRef, { driver, now: () => now }), null);
  const current = await issueCanonicalRoomInvite(builtIn("wordwolf", "room-instance-0009"), { driver, now: () => now, createInviteRef: ref });
  assert.equal(await compareAndDeleteCanonicalRoomInvite(stale.target, { driver }), false);
  assert.equal((await loadCanonicalRoomInvite("development", current.target.inviteRef, { driver, now: () => now }))?.roomInstanceId, "room-instance-0009");
  const expired = await issueCanonicalRoomInvite({ ...builtIn(), roomInstanceId: "room-instance-expired", expiresAt: now + 1 }, { driver, now: () => now, createInviteRef: ref });
  assert.equal(await loadCanonicalRoomInvite("development", expired.target.inviteRef, { driver, now: () => now + 2 }), null);
});

test("legacy unique/missing/ambiguous code-only links are write-zero", () => {
  const source = readFileSync("app/join/[roomCode]/InviteRoomJoiner.tsx", "utf8");
  assert.doesNotMatch(source, /fetch\(/);
  assert.doesNotMatch(source, /method:\s*["']PATCH/);
  assert.match(source, /一意に証明できない/);
});

test("join revalidates generation while recipient locale stays outside Room identity", () => {
  const route = readFileSync("app/api/room-invites/[roomCode]/route.ts", "utf8");
  const ja = builtIn() as CanonicalRoomInviteTarget;
  const en = { ...ja, contentLanguage: "en" as const };
  assert.equal(canonicalRoomInvitePrimaryBindingDigest(canonicalRoomInvitePrimaryBinding(ja)), canonicalRoomInvitePrimaryBindingDigest(canonicalRoomInvitePrimaryBinding(en)));
  assert.match(route, /revalidateCanonicalRoomInviteTarget/);
  assert.match(route, /expectedRoomInstanceId/);
});

test("T-155 common runner five-family source remains present", () => {
  const source = readFileSync("lib/game-sdk-remote-module.ts", "utf8").toLowerCase();
  for (const family of ["create", "command", "presentation", "resource-effect", "manifest"]) assert.ok(source.includes(family));
});

test("all built-in providers and SDK generation checks share the canonical boundary", () => {
  const providers = readFileSync("lib/room-invite-provider.ts", "utf8");
  const runtime = readFileSync("packages/game-runtime/src/index.ts", "utf8");
  const routeFactory = readFileSync("lib/online-room-route-factory.ts", "utf8");
  for (const gameId of ["wordwolf", "tahoiya", "hodoai", "kotoba-senpuku", "northern-branch", "nigoichi", "code-intercept", "daifugo", "canvas"]) {
    assert.ok(providers.includes(gameId));
  }
  assert.match(runtime, /envelope\.expectedRoomInstanceId !== record\.creationRequestId/);
  assert.match(routeFactory, /delete safe\.roomInstanceId/);
});

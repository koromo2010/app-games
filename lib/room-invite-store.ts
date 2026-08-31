import { redisCommand } from "./redis-store.ts";
import {
  canonicalRoomInvitePrimaryBinding,
  canonicalRoomInvitePrimaryBindingDigest,
  canonicalRoomInviteTargetDigest,
  createRoomInviteRef,
  normalizeCanonicalRoomInviteTarget,
  roomInviteRefPattern,
  roomInviteSchemaVersion,
  type CanonicalRoomInvitePrimaryBinding,
  type CanonicalRoomInviteTarget,
} from "./room-invite-target.ts";

const invitePrefix = "room-invite:v1";
const bindingPrefix = "room-invite-binding:v1";

export type RoomInviteStoreDriver = {
  get(key: string): Promise<string | null>;
  create(
    inviteKey: string,
    bindingKey: string,
    raw: string,
    inviteRef: string,
    ttlSeconds: number,
  ): Promise<boolean>;
  refresh(
    inviteKey: string,
    bindingKey: string,
    expectedRaw: string,
    nextRaw: string,
    inviteRef: string,
    ttlSeconds: number,
  ): Promise<boolean>;
  compareDelete(
    inviteKey: string,
    bindingKey: string,
    expectedRaw: string,
    inviteRef: string,
  ): Promise<boolean>;
};

function inviteKey(environment: string, inviteRef: string) {
  return `${invitePrefix}:${environment}:${inviteRef}`;
}

function bindingKey(binding: CanonicalRoomInvitePrimaryBinding) {
  return `${bindingPrefix}:${binding.environment}:${canonicalRoomInvitePrimaryBindingDigest(binding)}`;
}

function ttlSeconds(expiresAt: number, now: number) {
  return Math.max(1, Math.ceil((expiresAt - now) / 1_000));
}

export const redisRoomInviteStoreDriver: RoomInviteStoreDriver = {
  get: (key) => redisCommand<string | null>(["GET", key]),
  async create(targetKey, targetBindingKey, raw, inviteRef, ttl) {
    const result = await redisCommand<number>([
      "EVAL",
      "if redis.call('EXISTS',KEYS[1])==1 or redis.call('EXISTS',KEYS[2])==1 then return 0 end; redis.call('SET',KEYS[1],ARGV[1],'EX',ARGV[3]); redis.call('SET',KEYS[2],ARGV[2],'EX',ARGV[3]); return 1",
      "2",
      targetKey,
      targetBindingKey,
      raw,
      inviteRef,
      String(ttl),
    ]);
    return result === 1;
  },
  async refresh(targetKey, targetBindingKey, expectedRaw, nextRaw, inviteRef, ttl) {
    const result = await redisCommand<number>([
      "EVAL",
      "local raw=redis.call('GET',KEYS[1]); local ref=redis.call('GET',KEYS[2]); if raw~=ARGV[1] or ref~=ARGV[3] then return 0 end; redis.call('SET',KEYS[1],ARGV[2],'EX',ARGV[4]); redis.call('SET',KEYS[2],ARGV[3],'EX',ARGV[4]); return 1",
      "2",
      targetKey,
      targetBindingKey,
      expectedRaw,
      nextRaw,
      inviteRef,
      String(ttl),
    ]);
    return result === 1;
  },
  async compareDelete(targetKey, targetBindingKey, expectedRaw, inviteRef) {
    const result = await redisCommand<number>([
      "EVAL",
      "local raw=redis.call('GET',KEYS[1]); local ref=redis.call('GET',KEYS[2]); if raw~=ARGV[1] or ref~=ARGV[2] then return 0 end; redis.call('DEL',KEYS[1]); redis.call('DEL',KEYS[2]); return 1",
      "2",
      targetKey,
      targetBindingKey,
      expectedRaw,
      inviteRef,
    ]);
    return result === 1;
  },
};

export type RoomInviteIssueInput = Omit<
  CanonicalRoomInviteTarget,
  "schemaVersion" | "inviteRef" | "issuedAt"
>;

export async function issueCanonicalRoomInvite(
  input: RoomInviteIssueInput,
  options: {
    driver?: RoomInviteStoreDriver;
    now?: () => number;
    createInviteRef?: () => string;
  } = {},
) {
  const driver = options.driver ?? redisRoomInviteStoreDriver;
  const now = options.now?.() ?? Date.now();
  if (!Number.isSafeInteger(input.expiresAt) || input.expiresAt <= now) {
    throw new Error("ROOM_INVITE_TARGET_EXPIRED");
  }
  const binding = canonicalRoomInvitePrimaryBinding({
    ...input,
    schemaVersion: roomInviteSchemaVersion,
    inviteRef: "00000000000000000000000000000000",
    issuedAt: now,
  });
  const targetBindingKey = bindingKey(binding);
  const existingRef = await driver.get(targetBindingKey);
  if (existingRef) {
    if (!roomInviteRefPattern.test(existingRef)) {
      throw new Error("ROOM_INVITE_INDEX_CONFLICT");
    }
    const targetKey = inviteKey(binding.environment, existingRef);
    const existingRaw = await driver.get(targetKey);
    let existing: CanonicalRoomInviteTarget | null = null;
    try {
      existing = existingRaw
        ? normalizeCanonicalRoomInviteTarget(JSON.parse(existingRaw))
        : null;
    } catch {
      existing = null;
    }
    const next = normalizeCanonicalRoomInviteTarget({
      ...input,
      schemaVersion: roomInviteSchemaVersion,
      inviteRef: existingRef,
      issuedAt: existing?.issuedAt ?? now,
    });
    if (
      !existingRaw
      || !existing
      || !next
      || canonicalRoomInviteTargetDigest(existing)
        !== canonicalRoomInviteTargetDigest(next)
    ) throw new Error("ROOM_INVITE_TARGET_CONFLICT");
    const nextRaw = JSON.stringify(next);
    const refreshed = await driver.refresh(
      targetKey,
      targetBindingKey,
      existingRaw,
      nextRaw,
      existingRef,
      ttlSeconds(next.expiresAt, now),
    );
    if (!refreshed) throw new Error("ROOM_INVITE_CONCURRENT_REPLACEMENT");
    return { target: next, created: false };
  }

  const generate = options.createInviteRef ?? createRoomInviteRef;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const inviteRef = generate();
    if (!roomInviteRefPattern.test(inviteRef)) {
      throw new Error("ROOM_INVITE_REF_INVALID");
    }
    const target = normalizeCanonicalRoomInviteTarget({
      ...input,
      schemaVersion: roomInviteSchemaVersion,
      inviteRef,
      issuedAt: now,
    });
    if (!target) throw new Error("ROOM_INVITE_TARGET_INVALID");
    const created = await driver.create(
      inviteKey(target.environment, inviteRef),
      targetBindingKey,
      JSON.stringify(target),
      inviteRef,
      ttlSeconds(target.expiresAt, now),
    );
    if (created) return { target, created: true };
    const winnerRef = await driver.get(targetBindingKey);
    if (winnerRef) {
      return issueCanonicalRoomInvite(input, { ...options, driver, now: () => now });
    }
  }
  throw new Error("ROOM_INVITE_REF_COLLISION");
}

export async function loadCanonicalRoomInvite(
  environment: string,
  inviteRef: string,
  options: { driver?: RoomInviteStoreDriver; now?: () => number } = {},
) {
  if (!roomInviteRefPattern.test(inviteRef)) return null;
  const driver = options.driver ?? redisRoomInviteStoreDriver;
  const raw = await driver.get(inviteKey(environment, inviteRef));
  if (!raw) return null;
  try {
    const target = normalizeCanonicalRoomInviteTarget(JSON.parse(raw));
    if (!target || target.environment !== environment) return null;
    if (target.expiresAt <= (options.now?.() ?? Date.now())) return null;
    return target;
  } catch {
    return null;
  }
}

export async function compareAndDeleteCanonicalRoomInvite(
  expected: CanonicalRoomInviteTarget,
  options: { driver?: RoomInviteStoreDriver } = {},
) {
  const driver = options.driver ?? redisRoomInviteStoreDriver;
  const targetKey = inviteKey(expected.environment, expected.inviteRef);
  const raw = await driver.get(targetKey);
  if (!raw) return false;
  let actual: CanonicalRoomInviteTarget | null = null;
  try {
    actual = normalizeCanonicalRoomInviteTarget(JSON.parse(raw));
  } catch {
    return false;
  }
  if (
    !actual
    || canonicalRoomInviteTargetDigest(actual)
      !== canonicalRoomInviteTargetDigest(expected)
  ) return false;
  return driver.compareDelete(
    targetKey,
    bindingKey(canonicalRoomInvitePrimaryBinding(expected)),
    raw,
    expected.inviteRef,
  );
}

export async function compareAndDeleteRoomInviteForPrimary(
  binding: CanonicalRoomInvitePrimaryBinding,
  options: { driver?: RoomInviteStoreDriver } = {},
) {
  const driver = options.driver ?? redisRoomInviteStoreDriver;
  const targetBindingKey = bindingKey(binding);
  const inviteRef = await driver.get(targetBindingKey);
  if (!inviteRef || !roomInviteRefPattern.test(inviteRef)) return false;
  const targetKey = inviteKey(binding.environment, inviteRef);
  const raw = await driver.get(targetKey);
  if (!raw) return false;
  let target: CanonicalRoomInviteTarget | null = null;
  try {
    target = normalizeCanonicalRoomInviteTarget(JSON.parse(raw));
  } catch {
    return false;
  }
  if (
    !target
    || canonicalRoomInvitePrimaryBindingDigest(
      canonicalRoomInvitePrimaryBinding(target),
    ) !== canonicalRoomInvitePrimaryBindingDigest(binding)
  ) return false;
  return driver.compareDelete(targetKey, targetBindingKey, raw, inviteRef);
}

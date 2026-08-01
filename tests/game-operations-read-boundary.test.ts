import assert from "node:assert/strict";
import test from "node:test";
import {
  migrateGameOperationsRedis,
  validateLegacyGameOperationsRaw,
} from "../lib/game-operations-legacy-migration.ts";
import { readGameOperationsFromRedis } from "../lib/game-operations-read.ts";

const validV2 = [{
  gameId: "wordwolf",
  publication: "public",
  maintenance: false,
  message: "",
  updatedAt: 1_700_000_000_000,
}];

const validV1 = [{
  gameId: "wordwolf",
  mode: "maintenance",
  message: "scheduled",
  updatedAt: 1_700_000_000_000,
}];

function redisFixture(values: Record<string, string | null>) {
  const commands: string[][] = [];
  return {
    commands,
    command: async (command: readonly string[]) => {
      commands.push([...command]);
      if (command[0] === "GET") return values[command[1]!] ?? null;
      if (command[0] === "TTL") return -1;
      if (command[0] === "SET") return "OK";
      throw new Error(`unexpected command: ${command.join(" ")}`);
    },
  };
}

test("public reads v3, v2 and v1 in order without mutation", async () => {
  for (const [values, expected] of [
    [{ "site-game-operations:v3:development": JSON.stringify(validV2) }, [["GET", "site-game-operations:v3:development"]]],
    [{ "site-game-operations:v2": JSON.stringify(validV2) }, [["GET", "site-game-operations:v3:development"], ["GET", "site-game-operations:v2"]]],
    [{ "site-game-operations:v1": JSON.stringify(validV1) }, [["GET", "site-game-operations:v3:development"], ["GET", "site-game-operations:v2"], ["GET", "site-game-operations:v1"]]],
  ] as const) {
    const redis = redisFixture(values);
    const operations = await readGameOperationsFromRedis({
      environment: "development",
      additionalGames: [{ id: "wordwolf" }],
      command: redis.command,
    });
    assert.equal(operations.find((item) => item.gameId === "wordwolf")?.maintenance, values["site-game-operations:v1"] !== undefined);
    assert.deepEqual(redis.commands, expected);
    assert.equal(redis.commands.some(([name]) => name !== "GET"), false);
  }
});

test("public malformed fallback stays tolerant and never repairs Redis", async () => {
  const redis = redisFixture({
    "site-game-operations:v2": JSON.stringify([{ ...validV2[0], publication: "bad", maintenance: "yes" }]),
  });
  const operations = await readGameOperationsFromRedis({
    environment: "development",
    additionalGames: [{ id: "wordwolf" }],
    command: redis.command,
  });
  assert.equal(operations.find((item) => item.gameId === "wordwolf")?.maintenance, false);
  assert.equal(redis.commands.some(([name]) => name !== "GET"), false);
});

test("migration raw validation rejects repairable and ambiguous legacy values", () => {
  const invalidV2 = [
    [{ ...validV2[0], publication: "draft" }],
    [{ ...validV2[0], maintenance: 1 }],
    [{ ...validV2[0], message: "x".repeat(121) }],
    [{ ...validV2[0], message: " not canonical " }],
    [{ ...validV2[0], updatedAt: "yesterday" }],
    [validV2[0], validV2[0]],
    [{ gameId: "wordwolf", publication: "public" }],
    [{ ...validV2[0], extra: true }],
  ];
  for (const raw of invalidV2) {
    assert.throws(() => validateLegacyGameOperationsRaw("v2", raw, {
      knownV1GameIds: ["wordwolf"],
    }), /GAME_OPERATIONS_MIGRATION_SOURCE_INVALID/);
  }
  for (const raw of [
    [{ ...validV1[0], mode: "private" }],
    [{ ...validV1[0], mode: 1 }],
    [{ ...validV1[0], gameId: "unknown-game" }],
  ]) {
    assert.throws(() => validateLegacyGameOperationsRaw("v1", raw, {
      knownV1GameIds: ["wordwolf"],
    }), /GAME_OPERATIONS_MIGRATION_SOURCE_INVALID/);
  }
});

test("every malformed migration source fails closed with zero Redis mutation", async () => {
  const malformed = [
    [{ ...validV2[0], publication: "draft" }],
    [{ ...validV2[0], maintenance: "false" }],
    [{ ...validV2[0], message: "x".repeat(121) }],
    [{ ...validV2[0], updatedAt: "yesterday" }],
    [validV2[0], validV2[0]],
    [{ gameId: "wordwolf", publication: "public" }],
  ];
  for (const value of malformed) {
    const redis = redisFixture({ "site-game-operations:v2": JSON.stringify(value) });
    await assert.rejects(migrateGameOperationsRedis({
      environment: "development",
      namespace: "site-game-operations",
      targetKey: "site-game-operations:v3:development",
      apply: true,
      knownV1GameIds: ["wordwolf"],
      command: redis.command,
    }), /GAME_OPERATIONS_MIGRATION_SOURCE_INVALID/);
    assert.equal(redis.commands.some(([name]) => name === "SET"), false);
  }
  for (const value of [
    [{ ...validV1[0], mode: "private" }],
    [{ ...validV1[0], mode: false }],
  ]) {
    const redis = redisFixture({ "site-game-operations:v1": JSON.stringify(value) });
    await assert.rejects(migrateGameOperationsRedis({
      environment: "development",
      namespace: "site-game-operations",
      targetKey: "site-game-operations:v3:development",
      apply: true,
      knownV1GameIds: ["wordwolf"],
      command: redis.command,
    }), /GAME_OPERATIONS_MIGRATION_SOURCE_INVALID/);
    assert.equal(redis.commands.some(([name]) => name === "SET"), false);
  }
});

test("migration refuses TTL changes, source conflicts and target overwrites", async () => {
  const ttlCommands: string[][] = [];
  await assert.rejects(migrateGameOperationsRedis({
    environment: "development",
    namespace: "site-game-operations",
    targetKey: "site-game-operations:v3:development",
    apply: true,
    knownV1GameIds: ["wordwolf"],
    command: async (command) => {
      ttlCommands.push([...command]);
      if (command[0] === "GET" && command[1] === "site-game-operations:v2") return JSON.stringify(validV2);
      if (command[0] === "GET") return null;
      if (command[0] === "TTL") return 60;
      throw new Error("mutation reached");
    },
  }), /GAME_OPERATIONS_MIGRATION_TTL_INVALID/);
  assert.equal(ttlCommands.some(([name]) => name === "SET"), false);

  const conflict = redisFixture({
    "site-game-operations:v2": JSON.stringify(validV2),
    "site-game-operations:v1": JSON.stringify(validV1),
  });
  await assert.rejects(migrateGameOperationsRedis({
    environment: "development",
    namespace: "site-game-operations",
    targetKey: "site-game-operations:v3:development",
    apply: true,
    knownV1GameIds: ["wordwolf"],
    command: conflict.command,
  }), /GAME_OPERATIONS_MIGRATION_SOURCE_CONFLICT/);
  assert.equal(conflict.commands.some(([name]) => name === "SET"), false);

  const differentTarget = [{ ...validV2[0], publication: "hidden" }];
  const target = redisFixture({
    "site-game-operations:v3:development": JSON.stringify(differentTarget),
    "site-game-operations:v2": JSON.stringify(validV2),
  });
  await assert.rejects(migrateGameOperationsRedis({
    environment: "development",
    namespace: "site-game-operations",
    targetKey: "site-game-operations:v3:development",
    apply: true,
    knownV1GameIds: ["wordwolf"],
    command: target.command,
  }), /GAME_OPERATIONS_MIGRATION_TARGET_CONFLICT/);
  assert.equal(target.commands.some(([name]) => name === "SET"), false);
});

test("valid v2 and v1 remain migratable; dry-run writes zero and apply uses NX", async () => {
  for (const [key, value, source] of [
    ["site-game-operations:v2", validV2, "v2"],
    ["site-game-operations:v1", validV1, "v1"],
  ] as const) {
    const dry = redisFixture({ [key]: JSON.stringify(value) });
    const planned = await migrateGameOperationsRedis({
      environment: "development",
      namespace: "site-game-operations",
      targetKey: "site-game-operations:v3:development",
      apply: false,
      knownV1GameIds: ["wordwolf"],
      command: dry.command,
    });
    assert.deepEqual(planned, { status: "ready", apply: false, source, created: 0 });
    assert.equal(dry.commands.some(([name]) => name === "SET"), false);

    const apply = redisFixture({ [key]: JSON.stringify(value) });
    const created = await migrateGameOperationsRedis({
      environment: "development",
      namespace: "site-game-operations",
      targetKey: "site-game-operations:v3:development",
      apply: true,
      knownV1GameIds: ["wordwolf"],
      command: apply.command,
    });
    assert.deepEqual(created, { status: "created", apply: true, source, created: 1 });
    const set = apply.commands.find(([name]) => name === "SET");
    assert.equal(set?.[1], "site-game-operations:v3:development");
    assert.equal(set?.at(-1), "NX");
  }
});

test("migration reapply and NX races are idempotent only for the identical fixed payload", async () => {
  const serialized = JSON.stringify(validV2);
  const reapply = redisFixture({
    "site-game-operations:v3:development": serialized,
    "site-game-operations:v2": serialized,
  });
  assert.deepEqual(await migrateGameOperationsRedis({
    environment: "development",
    namespace: "site-game-operations",
    targetKey: "site-game-operations:v3:development",
    apply: true,
    knownV1GameIds: ["wordwolf"],
    command: reapply.command,
  }), { status: "already-current", apply: true, source: "v2", created: 0 });
  assert.equal(reapply.commands.some(([name]) => name === "SET"), false);

  async function race(concurrentPayload: string) {
    const commands: string[][] = [];
    let targetReads = 0;
    const command = async (parts: readonly string[]) => {
      commands.push([...parts]);
      if (parts[0] === "TTL") return -1;
      if (parts[0] === "SET") return null;
      if (parts[0] === "GET" && parts[1] === "site-game-operations:v3:development") {
        return targetReads++ === 0 ? null : concurrentPayload;
      }
      if (parts[0] === "GET" && parts[1] === "site-game-operations:v2") return serialized;
      if (parts[0] === "GET") return null;
      throw new Error(`unexpected command: ${parts.join(" ")}`);
    };
    return { commands, command };
  }

  const same = await race(serialized);
  assert.deepEqual(await migrateGameOperationsRedis({
    environment: "development",
    namespace: "site-game-operations",
    targetKey: "site-game-operations:v3:development",
    apply: true,
    knownV1GameIds: ["wordwolf"],
    command: same.command,
  }), { status: "concurrent-created", apply: true, source: "v2", created: 0 });
  assert.equal(same.commands.filter(([name]) => name === "SET").length, 1);
  assert.deepEqual(same.commands.find(([name]) => name === "SET")?.slice(-1), ["NX"]);
  assert.equal(same.commands.some(([name]) => ["DEL", "EVAL", "EXPIRE", "PERSIST"].includes(name)), false);

  const different = await race(JSON.stringify([{ ...validV2[0], publication: "hidden" }]));
  await assert.rejects(migrateGameOperationsRedis({
    environment: "development",
    namespace: "site-game-operations",
    targetKey: "site-game-operations:v3:development",
    apply: true,
    knownV1GameIds: ["wordwolf"],
    command: different.command,
  }), /GAME_OPERATIONS_MIGRATION_NX_CONFLICT/);
  assert.equal(different.commands.filter(([name]) => name === "SET").length, 1);
  assert.deepEqual(different.commands.find(([name]) => name === "SET")?.slice(-1), ["NX"]);
  assert.equal(different.commands.some(([name]) => ["DEL", "EVAL", "EXPIRE", "PERSIST"].includes(name)), false);
});

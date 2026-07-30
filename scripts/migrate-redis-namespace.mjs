import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { createClient } from "redis";
import { classifyRedisConsolidationKey } from "./redis-consolidation-keys.mjs";

const expiryToleranceMs = 2_000;

function option(name, fallback = "") {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] ?? fallback : fallback;
}

function requiredEnvironment(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}

function endpointHost(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return "invalid";
  }
}

async function raw(client, command) {
  return await client.sendCommand(command.map(String));
}

function normalizeRaw(value) {
  if (Array.isArray(value)) return value.map(normalizeRaw);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)));
  }
  return value;
}

function digestSnapshot(snapshot) {
  return createHash("sha256").update(JSON.stringify(normalizeRaw(snapshot))).digest("hex");
}

function absoluteExpiry(now, pttl) {
  return pttl >= 0 ? now + pttl : null;
}

function expiriesMatch(left, right) {
  if (left === null || right === null) return left === right;
  return Math.abs(left - right) <= expiryToleranceMs;
}

export async function keySnapshot(client, key, type) {
  switch (type) {
    case "string": return await raw(client, ["GET", key]);
    case "hash": return await raw(client, ["HGETALL", key]);
    case "list": return await raw(client, ["LRANGE", key, "0", "-1"]);
    case "set": return [...await raw(client, ["SMEMBERS", key])].sort();
    case "zset": return await raw(client, ["ZRANGE", key, "0", "-1", "WITHSCORES"]);
    case "stream": return await raw(client, ["XRANGE", key, "-", "+"]);
    default: throw new Error(`REDIS_MIGRATION_TYPE_UNSUPPORTED:${type}`);
  }
}

export async function keyDigest(client, key, type) {
  return digestSnapshot(await keySnapshot(client, key, type));
}

async function inspectKeyWithSnapshot(client, key) {
  const inspectedAt = Date.now();
  const type = String(await raw(client, ["TYPE", key]));
  if (type === "none") throw new Error(`REDIS_MIGRATION_SOURCE_MISSING:${key}`);
  const pttl = Number(await raw(client, ["PTTL", key]));
  if (pttl === -2) throw new Error(`REDIS_MIGRATION_SOURCE_MISSING:${key}`);
  const snapshot = await keySnapshot(client, key, type);
  return {
    type,
    pttl,
    expiresAt: absoluteExpiry(inspectedAt, pttl),
    digest: digestSnapshot(snapshot),
    snapshot,
  };
}

export async function inspectKey(client, key) {
  const { snapshot: _snapshot, ...state } = await inspectKeyWithSnapshot(client, key);
  return state;
}

async function scanKeys(client) {
  const keys = [];
  let cursor = "0";
  do {
    const reply = await raw(client, ["SCAN", cursor, "COUNT", "200"]);
    cursor = String(reply[0]);
    keys.push(...reply[1].map(String));
  } while (cursor !== "0");
  return keys.sort();
}

function sourceMatchesPlan(current, planned) {
  return current.type === planned.type
    && current.digest === planned.digest
    && expiriesMatch(current.expiresAt, planned.expiresAt ?? null);
}

export async function createPlan(source, target, sourceUrl, targetUrl) {
  const entries = [];
  for (const sourceKey of await scanKeys(source)) {
    const classification = classifyRedisConsolidationKey(sourceKey);
    const sourceState = await inspectKey(source, sourceKey);
    const targetKey = classification.targetKey;
    const targetExists = targetKey ? Number(await raw(target, ["EXISTS", targetKey])) === 1 : false;
    let targetState = null;
    let collision = "none";
    if (targetExists && targetKey) {
      targetState = await inspectKey(target, targetKey);
      collision = targetState.type === sourceState.type
        && targetState.digest === sourceState.digest
        && expiriesMatch(targetState.expiresAt, sourceState.expiresAt)
        ? "identical"
        : "different";
    }
    const action = classification.disposition === "keep"
      ? "keep"
      : classification.disposition === "copy" && targetKey && !targetExists
        ? "copy"
        : "manual";
    entries.push({ sourceKey, targetKey, ...classification, sourceState, targetState, collision, action });
  }
  const sourceHost = endpointHost(sourceUrl);
  const targetHost = endpointHost(targetUrl);
  return {
    version: 2,
    createdAt: new Date().toISOString(),
    sourceHost,
    targetHost,
    sameEndpointHost: sourceHost === targetHost,
    entries,
  };
}

function flatPairs(value) {
  if (Array.isArray(value)) return value.map(String);
  if (value && typeof value === "object") return Object.entries(value).flatMap(([key, item]) => [key, String(item)]);
  return [];
}

async function writeSnapshot(target, targetKey, type, snapshot) {
  switch (type) {
    case "string":
      await raw(target, ["SET", targetKey, snapshot]);
      return;
    case "hash": {
      const pairs = flatPairs(snapshot);
      if (pairs.length === 0) throw new Error(`REDIS_MIGRATION_EMPTY_VALUE_UNSUPPORTED:${targetKey}`);
      await raw(target, ["HSET", targetKey, ...pairs]);
      return;
    }
    case "list":
      if (snapshot.length === 0) throw new Error(`REDIS_MIGRATION_EMPTY_VALUE_UNSUPPORTED:${targetKey}`);
      await raw(target, ["RPUSH", targetKey, ...snapshot]);
      return;
    case "set":
      if (snapshot.length === 0) throw new Error(`REDIS_MIGRATION_EMPTY_VALUE_UNSUPPORTED:${targetKey}`);
      await raw(target, ["SADD", targetKey, ...snapshot]);
      return;
    case "zset": {
      if (snapshot.length === 0) throw new Error(`REDIS_MIGRATION_EMPTY_VALUE_UNSUPPORTED:${targetKey}`);
      const scoreMembers = [];
      for (let index = 0; index + 1 < snapshot.length; index += 2) {
        scoreMembers.push(snapshot[index + 1], snapshot[index]);
      }
      await raw(target, ["ZADD", targetKey, ...scoreMembers]);
      return;
    }
    case "stream":
      if (snapshot.length === 0) throw new Error(`REDIS_MIGRATION_EMPTY_VALUE_UNSUPPORTED:${targetKey}`);
      for (const [id, fields] of snapshot) await raw(target, ["XADD", targetKey, id, ...flatPairs(fields)]);
      return;
    default:
      throw new Error(`REDIS_MIGRATION_TYPE_UNSUPPORTED:${type}`);
  }
}

export async function preflightCopyPlan(source, target, plan) {
  const copyEntries = plan.entries.filter((entry) => entry.action === "copy");
  const targetKeys = new Set();
  for (const entry of copyEntries) {
    const { sourceKey, targetKey } = entry;
    if (!targetKey) throw new Error(`REDIS_MIGRATION_TARGET_KEY_REQUIRED:${sourceKey}`);
    if (sourceKey === targetKey) throw new Error(`REDIS_MIGRATION_SAME_KEY_FORBIDDEN:${sourceKey}`);
    if (targetKeys.has(targetKey)) throw new Error(`REDIS_MIGRATION_DUPLICATE_TARGET:${targetKey}`);
    targetKeys.add(targetKey);
    if (Number(await raw(target, ["EXISTS", targetKey])) !== 0) {
      throw new Error(`REDIS_MIGRATION_TARGET_EXISTS:${targetKey}`);
    }
    const sourceState = await inspectKey(source, sourceKey);
    if (!sourceMatchesPlan(sourceState, entry.sourceState)) {
      throw new Error(`REDIS_MIGRATION_SOURCE_CHANGED:${sourceKey}`);
    }
  }
  return copyEntries;
}

export async function copyKey(source, target, entry) {
  const { sourceKey, targetKey } = entry;
  if (!targetKey) throw new Error(`REDIS_MIGRATION_TARGET_KEY_REQUIRED:${sourceKey}`);
  if (sourceKey === targetKey) throw new Error(`REDIS_MIGRATION_SAME_KEY_FORBIDDEN:${sourceKey}`);
  if (Number(await raw(target, ["EXISTS", targetKey])) !== 0) {
    throw new Error(`REDIS_MIGRATION_TARGET_EXISTS:${targetKey}`);
  }

  const sourceState = await inspectKeyWithSnapshot(source, sourceKey);
  if (!sourceMatchesPlan(sourceState, entry.sourceState)) {
    throw new Error(`REDIS_MIGRATION_SOURCE_CHANGED:${sourceKey}`);
  }

  try {
    await writeSnapshot(target, targetKey, sourceState.type, sourceState.snapshot);
    if (sourceState.expiresAt !== null) {
      await raw(target, ["PEXPIREAT", targetKey, String(sourceState.expiresAt)]);
    }
    const targetState = await inspectKey(target, targetKey);
    if (
      targetState.type !== sourceState.type
      || targetState.digest !== sourceState.digest
      || !expiriesMatch(targetState.expiresAt, sourceState.expiresAt)
    ) {
      throw new Error(`REDIS_MIGRATION_VERIFY_FAILED:${targetKey}`);
    }
    const sourceAfter = await inspectKey(source, sourceKey);
    if (!sourceMatchesPlan(sourceAfter, sourceState)) {
      throw new Error(`REDIS_MIGRATION_SOURCE_CHANGED_DURING_COPY:${sourceKey}`);
    }
    return {
      sourceKey,
      targetKey,
      type: sourceState.type,
      sourceExpiresAt: sourceState.expiresAt,
      targetExpiresAt: targetState.expiresAt,
    };
  } catch (error) {
    await raw(target, ["DEL", targetKey]).catch(() => undefined);
    throw error;
  }
}

export async function applyPlan(source, target, plan) {
  const copyEntries = await preflightCopyPlan(source, target, plan);
  const copied = [];
  const createdTargetKeys = [];
  try {
    for (const entry of copyEntries) {
      const result = await copyKey(source, target, entry);
      copied.push(result);
      createdTargetKeys.push(result.targetKey);
    }
    return copied;
  } catch (error) {
    for (const targetKey of createdTargetKeys.reverse()) {
      await raw(target, ["DEL", targetKey]).catch(() => undefined);
    }
    throw error;
  }
}

async function main() {
  const mode = process.argv[2];
  if (mode !== "plan" && mode !== "apply") throw new Error("USAGE: migrate-redis-namespace.mjs plan|apply");
  const sourceUrl = requiredEnvironment("SOURCE_REDIS_URL");
  const targetUrl = requiredEnvironment("TARGET_REDIS_URL");
  const source = createClient({ url: sourceUrl });
  const target = createClient({ url: targetUrl });
  await Promise.all([source.connect(), target.connect()]);
  try {
    if (mode === "plan") {
      const output = option("--output", "redis-migration-plan.json");
      const plan = await createPlan(source, target, sourceUrl, targetUrl);
      await writeFile(output, `${JSON.stringify(plan, null, 2)}\n`, { flag: "wx" });
      const classifications = plan.entries.reduce((result, entry) => {
        result[entry.classification] = (result[entry.classification] ?? 0) + 1;
        return result;
      }, {});
      const actions = plan.entries.reduce((result, entry) => {
        result[entry.action] = (result[entry.action] ?? 0) + 1;
        return result;
      }, {});
      console.log(JSON.stringify({
        output,
        sourceHost: plan.sourceHost,
        targetHost: plan.targetHost,
        sameEndpointHost: plan.sameEndpointHost,
        keyCount: plan.entries.length,
        classifications,
        actions,
      }));
      return;
    }

    if (!process.argv.includes("--confirm-no-overwrite")) throw new Error("REDIS_MIGRATION_CONFIRMATION_REQUIRED");
    const planPath = option("--plan");
    if (!planPath) throw new Error("REDIS_MIGRATION_PLAN_REQUIRED");
    const plan = JSON.parse(await readFile(planPath, "utf8"));
    const copied = await applyPlan(source, target, plan);
    const reportPath = option("--report", "redis-migration-report.json");
    await writeFile(reportPath, `${JSON.stringify({ completedAt: new Date().toISOString(), copied }, null, 2)}\n`, { flag: "wx" });
    console.log(JSON.stringify({ report: reportPath, copied: copied.length }));
  } finally {
    await Promise.all([source.close().catch(() => undefined), target.close().catch(() => undefined)]);
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (invokedPath === import.meta.url) await main();

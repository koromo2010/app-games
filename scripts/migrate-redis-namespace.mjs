import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { createClient } from "redis";
import { classifyRedisConsolidationKey } from "./redis-consolidation-keys.mjs";

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

async function keySnapshot(client, key, type) {
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

async function keyDigest(client, key, type) {
  const snapshot = normalizeRaw(await keySnapshot(client, key, type));
  return createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
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

async function inspectKey(client, key) {
  const type = String(await raw(client, ["TYPE", key]));
  const pttl = Number(await raw(client, ["PTTL", key]));
  return { type, pttl, digest: await keyDigest(client, key, type) };
}

async function createPlan(source, target, sourceUrl, targetUrl) {
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
      collision = targetState.type === sourceState.type && targetState.digest === sourceState.digest
        ? "identical"
        : "different";
    }
    const action = classification.automatic && targetKey && !targetExists ? "copy" : "manual";
    entries.push({ sourceKey, targetKey, ...classification, sourceState, targetState, collision, action });
  }
  return {
    version: 1,
    createdAt: new Date().toISOString(),
    sourceHost: endpointHost(sourceUrl),
    targetHost: endpointHost(targetUrl),
    entries,
  };
}

function flatPairs(value) {
  if (Array.isArray(value)) return value.map(String);
  if (value && typeof value === "object") return Object.entries(value).flatMap(([key, item]) => [key, String(item)]);
  return [];
}

async function copyKey(source, target, entry) {
  const { sourceKey, targetKey } = entry;
  if (!targetKey) throw new Error(`REDIS_MIGRATION_TARGET_KEY_REQUIRED:${sourceKey}`);
  if (Number(await raw(target, ["EXISTS", targetKey])) !== 0) {
    throw new Error(`REDIS_MIGRATION_TARGET_EXISTS:${targetKey}`);
  }

  const sourceState = await inspectKey(source, sourceKey);
  if (sourceState.type !== entry.sourceState.type || sourceState.digest !== entry.sourceState.digest) {
    throw new Error(`REDIS_MIGRATION_SOURCE_CHANGED:${sourceKey}`);
  }
  const expiresAt = sourceState.pttl >= 0 ? Date.now() + sourceState.pttl : null;
  const snapshot = await keySnapshot(source, sourceKey, sourceState.type);

  try {
    switch (sourceState.type) {
      case "string":
        await raw(target, ["SET", targetKey, snapshot]);
        break;
      case "hash": {
        const pairs = flatPairs(snapshot);
        if (pairs.length > 0) await raw(target, ["HSET", targetKey, ...pairs]);
        break;
      }
      case "list":
        if (snapshot.length > 0) await raw(target, ["RPUSH", targetKey, ...snapshot]);
        break;
      case "set":
        if (snapshot.length > 0) await raw(target, ["SADD", targetKey, ...snapshot]);
        break;
      case "zset": {
        const scoreMembers = [];
        for (let index = 0; index + 1 < snapshot.length; index += 2) {
          scoreMembers.push(snapshot[index + 1], snapshot[index]);
        }
        if (scoreMembers.length > 0) await raw(target, ["ZADD", targetKey, ...scoreMembers]);
        break;
      }
      case "stream":
        for (const [id, fields] of snapshot) await raw(target, ["XADD", targetKey, id, ...flatPairs(fields)]);
        break;
      default:
        throw new Error(`REDIS_MIGRATION_TYPE_UNSUPPORTED:${sourceState.type}`);
    }
    if (expiresAt !== null) await raw(target, ["PEXPIREAT", targetKey, String(expiresAt)]);
    const targetState = await inspectKey(target, targetKey);
    if (targetState.type !== sourceState.type || targetState.digest !== sourceState.digest) {
      throw new Error(`REDIS_MIGRATION_VERIFY_FAILED:${targetKey}`);
    }
    return { sourceKey, targetKey, type: sourceState.type, sourcePttl: sourceState.pttl, targetPttl: targetState.pttl };
  } catch (error) {
    await raw(target, ["DEL", targetKey]).catch(() => undefined);
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
      const counts = plan.entries.reduce((result, entry) => {
        result[entry.classification] = (result[entry.classification] ?? 0) + 1;
        return result;
      }, {});
      console.log(JSON.stringify({ output, sourceHost: plan.sourceHost, targetHost: plan.targetHost, keyCount: plan.entries.length, classifications: counts }));
      return;
    }

    if (!process.argv.includes("--confirm-no-overwrite")) throw new Error("REDIS_MIGRATION_CONFIRMATION_REQUIRED");
    const planPath = option("--plan");
    if (!planPath) throw new Error("REDIS_MIGRATION_PLAN_REQUIRED");
    const plan = JSON.parse(await readFile(planPath, "utf8"));
    const copied = [];
    for (const entry of plan.entries) {
      if (entry.action !== "copy") continue;
      copied.push(await copyKey(source, target, entry));
    }
    const reportPath = option("--report", "redis-migration-report.json");
    await writeFile(reportPath, `${JSON.stringify({ completedAt: new Date().toISOString(), copied }, null, 2)}\n`, { flag: "wx" });
    console.log(JSON.stringify({ report: reportPath, copied: copied.length }));
  } finally {
    await Promise.all([source.close().catch(() => undefined), target.close().catch(() => undefined)]);
  }
}

await main();

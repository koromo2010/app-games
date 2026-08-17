import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import {
  access,
  mkdir,
  open,
  readFile,
  rename,
  rm,
} from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";

const FORBIDDEN_KEYS = new Set([
  "accesskey",
  "accesstoken",
  "apikey",
  "authorization",
  "cookie",
  "environmentbinding",
  "password",
  "refreshtoken",
  "secret",
  "sessioncookie",
  "setcookie",
  "token",
]);

function normalizeKey(key) {
  return key.toLowerCase().replaceAll("-", "").replaceAll("_", "");
}

function findForbiddenPath(value, path = "$") {
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const found = findForbiddenPath(value[index], `${path}[${index}]`);
      if (found) return found;
    }
    return null;
  }

  if (!value || typeof value !== "object") return null;

  for (const [key, child] of Object.entries(value)) {
    const childPath = `${path}.${key}`;
    if (FORBIDDEN_KEYS.has(normalizeKey(key))) return childPath;
    const found = findForbiddenPath(child, childPath);
    if (found) return found;
  }
  return null;
}

async function assertDestinationAbsent(destination) {
  try {
    await access(destination, constants.F_OK);
  } catch (error) {
    if (error?.code === "ENOENT") return;
    throw error;
  }
  throw new Error(`IMMUTABLE_DESTINATION_EXISTS: ${destination}`);
}

async function syncDirectory(directory) {
  let handle;
  try {
    handle = await open(directory, "r");
    await handle.sync();
  } catch (error) {
    if (!["EINVAL", "ENOTSUP", "EISDIR", "EPERM"].includes(error?.code)) {
      throw error;
    }
  } finally {
    await handle?.close();
  }
}

export async function writeImmutableJson(destination, input) {
  if (!destination) throw new Error("DESTINATION_REQUIRED");

  const parsed = typeof input === "string" ? JSON.parse(input) : input;
  const forbiddenPath = findForbiddenPath(parsed);
  if (forbiddenPath) {
    throw new Error(`SENSITIVE_FIELD_PRESENT: ${forbiddenPath}`);
  }

  const absoluteDestination = resolve(destination);
  const directory = dirname(absoluteDestination);
  await mkdir(directory, { recursive: true });
  await assertDestinationAbsent(absoluteDestination);

  const serialized = `${JSON.stringify(parsed, null, 2)}\n`;
  const temporaryPath = `${absoluteDestination}.tmp-${process.pid}-${randomUUID()}`;
  let handle;

  try {
    handle = await open(temporaryPath, "wx", 0o600);
    await handle.writeFile(serialized, "utf8");
    await handle.sync();
    await handle.close();
    handle = undefined;

    await assertDestinationAbsent(absoluteDestination);
    await rename(temporaryPath, absoluteDestination);
    await syncDirectory(directory);
  } catch (error) {
    await handle?.close().catch(() => {});
    await rm(temporaryPath, { force: true }).catch(() => {});
    throw error;
  }

  const readBack = await readFile(absoluteDestination);
  const readBackParsed = JSON.parse(readBack.toString("utf8"));
  if (!isDeepStrictEqual(readBackParsed, parsed)) {
    throw new Error("READ_BACK_DEEP_EQUALITY_FAILED");
  }

  return {
    destination: absoluteDestination,
    bytes: readBack.length,
    sha256: createHash("sha256").update(readBack).digest("hex"),
  };
}

async function main() {
  const destination = process.argv[2];
  let input = "";
  for await (const chunk of process.stdin) input += chunk;
  const result = await writeImmutableJson(destination, input);
  process.stdout.write(`${JSON.stringify({ status: "PASS", ...result })}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}

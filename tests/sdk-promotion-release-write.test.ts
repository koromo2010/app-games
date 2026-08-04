import assert from "node:assert/strict";
import {
  readFileSync,
  readdirSync,
  type Dirent,
} from "node:fs";
import { join, relative, resolve } from "node:path";
import test from "node:test";
import {
  createGamePackagePromotionFailureEvent,
} from "../apps/sdk-portal/lib/game-package-promotion-observability.ts";
import {
  promotionErrorResponse,
} from "../apps/sdk-portal/lib/game-package-promotion.ts";

const root = resolve(import.meta.dirname, "..");
const migration004 = readFileSync(
  join(root, "db/sdk/004_app_release_history.sql"),
  "utf8",
);
const migration006 = readFileSync(
  join(root, "db/sdk/006_cross_environment_package_artifacts.sql"),
  "utf8",
);
const promotionServicePath = join(
  root,
  "apps/sdk-portal/lib/game-package-promotion-service.ts",
);
const promotionService = readFileSync(promotionServicePath, "utf8");

type ColumnDefinition = {
  name: string;
  requiredOnInsert: boolean;
};

type ReleaseInsert = {
  file: string;
  line: number;
  columns: string[];
};

class NotNullViolation extends Error {
  readonly code = "23502";
  readonly column: string;

  constructor(column: string) {
    super(`null value in column "${column}" violates not-null constraint`);
    this.column = column;
  }
}

function splitTopLevelSqlList(source: string) {
  const values: string[] = [];
  let current = "";
  let depth = 0;
  let quote: "'" | "\"" | null = null;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    const next = source[index + 1];
    if (quote) {
      current += character;
      if (character === quote) {
        if (next === quote) {
          current += next;
          index += 1;
        } else {
          quote = null;
        }
      }
      continue;
    }
    if (character === "'" || character === "\"") {
      quote = character;
      current += character;
      continue;
    }
    if (character === "(") depth += 1;
    if (character === ")") depth -= 1;
    if (character === "," && depth === 0) {
      values.push(current.trim());
      current = "";
      continue;
    }
    current += character;
  }
  if (current.trim()) values.push(current.trim());
  return values;
}

function releaseSchemaAtMigration004() {
  const table = migration004.match(
    /CREATE TABLE IF NOT EXISTS sdk_app_releases\s*\(([\s\S]*?)\n\);/i,
  );
  assert.ok(table, "migration 004 must create sdk_app_releases");
  return splitTopLevelSqlList(table[1]).flatMap((definition) => {
    const name = definition.match(/^([a-z_][a-z0-9_]*)\s+/i)?.[1];
    if (!name || /^(?:constraint|primary|foreign|unique|check)$/i.test(name)) {
      return [];
    }
    return [{
      name: name.toLowerCase(),
      requiredOnInsert: /\bNOT NULL\b/i.test(definition)
        && !/\bDEFAULT\b/i.test(definition),
    }];
  });
}

function releaseSchemaAfterMigration006() {
  const columns = releaseSchemaAtMigration004();
  const added = migration006.match(
    /ADD COLUMN IF NOT EXISTS\s+([a-z_][a-z0-9_]*)\s+/i,
  )?.[1];
  assert.equal(added, "source_revision");
  columns.push({ name: added, requiredOnInsert: false });
  for (
    const match of migration006.matchAll(
      /ALTER COLUMN\s+([a-z_][a-z0-9_]*)\s+SET NOT NULL/gi,
    )
  ) {
    const column = columns.find((item) => item.name === match[1].toLowerCase());
    assert.ok(column, `migration 006 alters known column ${match[1]}`);
    column.requiredOnInsert = true;
  }
  return columns;
}

function assertInsertMatchesSchema(
  columns: string[],
  schema: ColumnDefinition[],
) {
  const included = new Set(columns.map((column) => column.toLowerCase()));
  const missing = schema
    .filter((column) => column.requiredOnInsert && !included.has(column.name))
    .map((column) => column.name);
  if (missing.length > 0) throw new NotNullViolation(missing[0]);
}

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(
    (entry: Dirent) => {
      if (entry.name === "node_modules" || entry.name === ".next") return [];
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return sourceFiles(path);
      return /\.(?:ts|tsx|js|mjs)$/.test(entry.name) ? [path] : [];
    },
  );
}

function releaseInserts(source: string, file: string): ReleaseInsert[] {
  const pattern = /\b(?:INSERT|UPSERT)\s+INTO\s+sdk_app_releases\s*\(([\s\S]*?)\)\s*(?:SELECT|VALUES)\b/gi;
  return [...source.matchAll(pattern)].map((match) => ({
    file,
    line: source.slice(0, match.index ?? 0).split("\n").length,
    columns: splitTopLevelSqlList(match[1]).map((column) =>
      column.trim().toLowerCase()
    ),
  }));
}

function runtimeReleaseInserts() {
  return ["app", "apps", "lib", "packages", "scripts"].flatMap(
    (directory) => sourceFiles(join(root, directory)),
  ).flatMap((path) =>
    releaseInserts(readFileSync(path, "utf8"), relative(root, path))
  );
}

test("migration 006 makes source_revision mandatory and reproduces the old INSERT failure", () => {
  const schema004 = releaseSchemaAtMigration004();
  const schema006 = releaseSchemaAfterMigration006();
  const migrationInsert = releaseInserts(
    migration004,
    "db/sdk/004_app_release_history.sql",
  );
  assert.equal(migrationInsert.length, 1);
  assert.doesNotThrow(() =>
    assertInsertMatchesSchema(migrationInsert[0].columns, schema004)
  );

  const candidateInsert = runtimeReleaseInserts().find(
    (insert) =>
      insert.file === "apps/sdk-portal/lib/game-package-promotion-service.ts",
  );
  assert.ok(candidateInsert);
  const oldColumns = candidateInsert.columns.filter(
    (column) => column !== "source_revision",
  );
  assert.throws(
    () => assertInsertMatchesSchema(oldColumns, schema006),
    (error) =>
      error instanceof NotNullViolation
      && error.code === "23502"
      && error.column === "source_revision",
  );
});

test("every runtime sdk_app_releases INSERT satisfies the current mandatory schema", () => {
  const inserts = runtimeReleaseInserts();
  assert.deepEqual(
    inserts.map((insert) => insert.file).sort(),
    [
      "apps/sdk-portal/lib/app-release-store.ts",
      "apps/sdk-portal/lib/app-release-store.ts",
      "apps/sdk-portal/lib/game-package-promotion-service.ts",
    ],
  );
  for (const insert of inserts) {
    assert.doesNotThrow(
      () => assertInsertMatchesSchema(
        insert.columns,
        releaseSchemaAfterMigration006(),
      ),
      `${insert.file}:${insert.line}`,
    );
    assert.ok(
      insert.columns.includes("source_revision"),
      `${insert.file}:${insert.line} must preserve source revision lineage`,
    );
  }
});

test("manifest verification precedes one atomic release statement", () => {
  const promotionStart = promotionService.indexOf(
    "async function promoteGamePackageInner",
  );
  const verification = promotionService.indexOf("await verifyPortableManifest");
  const write = promotionService.indexOf(
    "const rows = await sdkSql()`",
    verification,
  );
  const statementEnd = promotionService.indexOf("`;", write);
  assert.ok(
    promotionStart >= 0
      && verification > promotionStart
      && write > verification
      && statementEnd > write,
  );
  assert.doesNotMatch(
    promotionService.slice(promotionStart, verification),
    /UPDATE sdk_games|INSERT INTO sdk_app_releases|INSERT INTO sdk_release_decisions/,
  );
  const statement = promotionService.slice(write, statementEnd);
  assert.match(statement, /WITH source AS/);
  assert.match(statement, /updated_game AS \([\s\S]*?UPDATE sdk_games/);
  assert.match(statement, /channel_history AS \([\s\S]*?INSERT INTO sdk_game_channel_history/);
  assert.match(statement, /previous_release AS \([\s\S]*?UPDATE sdk_app_releases/);
  assert.match(statement, /new_release AS \([\s\S]*?INSERT INTO sdk_app_releases/);
  assert.match(statement, /decision AS \([\s\S]*?INSERT INTO sdk_release_decisions/);
  assert.match(statement, /JOIN updated_game ON updated_game\.id = source\.id/);
  assert.equal((statement.match(/sdkSql\(\)/g) ?? []).length, 1);
});

test("a failed schema-checked atomic write leaves the stable pointer unchanged", () => {
  const schema = releaseSchemaAfterMigration006();
  const candidateInsert = runtimeReleaseInserts().find(
    (insert) =>
      insert.file === "apps/sdk-portal/lib/game-package-promotion-service.ts",
  );
  assert.ok(candidateInsert);
  const state = {
    stableRevision: null as string | null,
    releases: [] as string[],
  };
  const executeAtomicWrite = (columns: string[]) => {
    const transaction = structuredClone(state);
    transaction.stableRevision = "a".repeat(40);
    assertInsertMatchesSchema(columns, schema);
    transaction.releases.push("a".repeat(40));
    return transaction;
  };
  assert.throws(
    () => executeAtomicWrite(
      candidateInsert.columns.filter((column) => column !== "source_revision"),
    ),
    (error) =>
      error instanceof NotNullViolation
      && error.code === "23502",
  );
  assert.deepEqual(state, { stableRevision: null, releases: [] });
  assert.deepEqual(executeAtomicWrite(candidateInsert.columns), {
    stableRevision: "a".repeat(40),
    releases: ["a".repeat(40)],
  });
});

test("promotion failures expose only generic API errors and safe structured fields", async () => {
  const leaked = "postgres://user:secret@example.test/db?token=do-not-log";
  const databaseError = Object.assign(
    new Error(`INSERT failed for ${leaked}`),
    {
      code: "23502",
      sql: `INSERT INTO sdk_app_releases VALUES ('${leaked}')`,
      manifest: { token: leaked },
    },
  );
  const response = promotionErrorResponse(databaseError);
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: "promotion_failed" });

  const event = createGamePackagePromotionFailureEvent({
    stage: "release_write",
    targetEnvironment: "development",
    creatorSlug: "test-creator",
    gameId: "link-lines",
    sourceRevision: "a".repeat(40),
  }, databaseError, new Date("2026-07-30T00:00:00.000Z"));
  assert.equal(event.fields.stage, "release_write");
  assert.equal(event.fields.promotionRoute, "sdk-candidate");
  assert.equal(event.fields.packageId, "test-creator/link-lines");
  assert.equal(event.fields.sourceRevision, "a".repeat(40));
  assert.equal(event.fields.errorType, "database_error");
  assert.equal(event.fields.errorCode, "POSTGRES_23502");
  const serialized = JSON.stringify(event);
  assert.doesNotMatch(serialized, /do-not-log|postgres:\/\/|INSERT INTO|manifest/);
});

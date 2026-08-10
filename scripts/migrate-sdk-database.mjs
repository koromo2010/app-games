import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(import.meta.dirname, "..");
const migrationDirectory = join(root, "db/sdk");

const environmentContracts = Object.freeze({
  development: Object.freeze({
    project: "app-games-sdk-dev",
    branch: "develop",
  }),
  production: Object.freeze({
    project: "app-games-sdk",
    branch: "main",
  }),
});

function parseArgs(argv = process.argv.slice(2)) {
  if (argv.includes("--help") || argv.includes("-h")) {
    return { help: true };
  }
  if (argv.includes("--deploy")) {
    throw new Error(
      "--deploy was removed: Vercel builds never run migrations. "
      + "Run the explicit command with --environment development|production.",
    );
  }

  const environmentIndex = argv.indexOf("--environment");
  const environment = environmentIndex >= 0 ? argv[environmentIndex + 1] : undefined;
  const mode = argv.includes("--status")
    ? "status"
    : argv.includes("--check")
      ? "check"
      : "apply";

  if (!environment || !Object.hasOwn(environmentContracts, environment)) {
    throw new Error(
      "Migration target is required. Use --environment development or --environment production.",
    );
  }
  return { environment, mode };
}

function assertEnvironmentTarget(environment, env = process.env) {
  const contract = environmentContracts[environment];
  const configuredEnvironment = env.SDK_DATABASE_ENV?.trim();
  if (configuredEnvironment !== environment) {
    throw new Error(
      `SDK_DATABASE_ENV must be ${environment} for this migration target.`,
    );
  }

  const project = env.VERCEL_PROJECT_NAME?.trim();
  const branch = env.VERCEL_GIT_COMMIT_REF?.trim();
  if ((project || branch) && (project !== contract.project || branch !== contract.branch)) {
    throw new Error(
      `Migration target ${environment} is not allowed for ${project ?? "unknown"}/${branch ?? "unknown"}.`,
    );
  }
}

function databaseUrl(env = process.env) {
  const url = env.SDK_DATABASE_URL?.trim();
  if (!url) {
    throw new Error(
      "SDK PostgreSQL is not configured. Set the SDK_DATABASE_URL for the explicitly selected target.",
    );
  }
  return url;
}

function printHelp() {
  console.log(`SDK database migration (explicit operational command only)

Usage:
  SDK_DATABASE_ENV=development SDK_DATABASE_URL=<dev-url> \\
    npm run sdk:migrate -- --environment development
  SDK_DATABASE_ENV=production SDK_DATABASE_URL=<prod-url> \\
    npm run sdk:migrate -- --environment production

Optional read-only modes:
  --status   list applied and pending migrations
  --check    fail when any migration is pending

The build and Vercel prebuild paths do not invoke this command.`);
}

function canonicalJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  }
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
    .join(",")}}`;
}

function legacyPackageRoot(input) {
  return createHash("sha256")
    .update(canonicalJson({ legacy: true, ...input }))
    .digest("hex");
}

async function backfillImmutablePackages(sql) {
  const legacyRows = await sql`
    SELECT id,
           sdk_package_version AS "sdkPackageVersion",
           sdk_contract_version AS "sdkContractVersion",
           manifest,
           package_revision AS "packageRevision",
           package_root_sha256 AS "packageRootSha256",
           package_bundle_sha256 AS "packageBundleSha256",
           package_app_set_sha256 AS "packageAppSetSha256",
           development_revision AS "developmentRevision",
           development_root_sha256 AS "developmentRootSha256",
           development_bundle_sha256 AS "developmentBundleSha256",
           development_app_set_sha256 AS "developmentAppSetSha256",
           development_manifest AS "developmentManifest",
           stable_revision AS "stableRevision",
           stable_root_sha256 AS "stableRootSha256",
           stable_bundle_sha256 AS "stableBundleSha256",
           stable_app_set_sha256 AS "stableAppSetSha256",
           stable_manifest AS "stableManifest"
    FROM sdk_games
    WHERE (
      package_revision IS NOT NULL AND package_root_sha256 IS NULL
    ) OR (
      development_revision IS NOT NULL AND development_root_sha256 IS NULL
    ) OR (
      stable_revision IS NOT NULL AND stable_root_sha256 IS NULL
    )
  `;

  for (const row of legacyRows) {
    const variants = [
      {
        kind: "package",
        revision: row.packageRevision,
        root: row.packageRootSha256,
        bundle: row.packageBundleSha256,
        appSet: row.packageAppSetSha256,
        manifest: row.manifest,
      },
      {
        kind: "development",
        revision: row.developmentRevision,
        root: row.developmentRootSha256,
        bundle: row.developmentBundleSha256,
        appSet: row.developmentAppSetSha256,
        manifest: row.developmentManifest,
      },
      {
        kind: "stable",
        revision: row.stableRevision,
        root: row.stableRootSha256,
        bundle: row.stableBundleSha256,
        appSet: row.stableAppSetSha256,
        manifest: row.stableManifest,
      },
    ];
    for (const variant of variants) {
      if (
        variant.root
        || !variant.revision
        || !variant.bundle
        || !variant.appSet
        || !variant.manifest
      ) continue;
      const rootHash = legacyPackageRoot({
        revision: variant.revision,
        bundleSha256: variant.bundle,
        appSetSha256: variant.appSet,
        manifest: variant.manifest,
      });
      const manifestJson = JSON.stringify(variant.manifest);
      await sql`
        INSERT INTO sdk_game_package_revisions (
          game_id, revision, package_root_sha256, server_bundle_sha256,
          app_set_source_sha256, manifest, sdk_package_version,
          sdk_contract_version
        ) VALUES (
          ${row.id}, ${variant.revision}, ${rootHash}, ${variant.bundle},
          ${variant.appSet}, ${manifestJson}::jsonb,
          ${row.sdkPackageVersion}, ${row.sdkContractVersion}
        )
        ON CONFLICT (game_id, revision) DO NOTHING
      `;
      if (variant.kind === "package") {
        await sql`
          UPDATE sdk_games
          SET package_root_sha256 = ${rootHash}
          WHERE id = ${row.id} AND package_revision = ${variant.revision}
        `;
      } else if (variant.kind === "development") {
        await sql`
          UPDATE sdk_games
          SET development_root_sha256 = ${rootHash}
          WHERE id = ${row.id} AND development_revision = ${variant.revision}
        `;
      } else {
        await sql`
          UPDATE sdk_games
          SET stable_root_sha256 = ${rootHash}
          WHERE id = ${row.id} AND stable_revision = ${variant.revision}
        `;
      }
    }
  }

  await sql`
    INSERT INTO sdk_game_channel_history (
      game_id, channel, revision, package_root_sha256
    )
    SELECT id, 'development', development_revision, development_root_sha256
    FROM sdk_games
    WHERE development_revision IS NOT NULL
      AND development_root_sha256 IS NOT NULL
    ON CONFLICT (game_id, channel, revision) DO NOTHING
  `;
  await sql`
    INSERT INTO sdk_game_channel_history (
      game_id, channel, revision, package_root_sha256
    )
    SELECT id, 'stable', stable_revision, stable_root_sha256
    FROM sdk_games
    WHERE stable_revision IS NOT NULL
      AND stable_root_sha256 IS NOT NULL
    ON CONFLICT (game_id, channel, revision) DO NOTHING
  `;
}

const hooks = new Map([[3, backfillImmutablePackages]]);

// Production applied the cross-environment artifact migration as version 005
// before the development branch assigned 005 to release decisions and moved the
// artifact migration to 006. Keep that one known ledger entry readable while a
// forward-only reconciliation migration makes both databases structurally equal.
const acceptedLegacyMigrationEntries = new Map([
  [5, new Map([
    [
      "005_cross_environment_package_artifacts.sql",
      "ef3f71bcb5ef919b392aa69fdbd0577580dcb1fab16bfeaa6514225f4d7487e7",
    ],
  ])],
]);

export function normalizeMigrationSource(source) {
  return source.replace(/\r\n?/g, "\n");
}

export function migrationChecksum(sql, hookSource = "") {
  return createHash("sha256")
    .update(normalizeMigrationSource(sql))
    .update("\0")
    .update(normalizeMigrationSource(hookSource))
    .digest("hex");
}

function loadMigrations() {
  const migrations = readdirSync(migrationDirectory)
    .filter((name) => /^\d{3}_[a-z0-9_]+\.sql$/.test(name))
    .sort()
    .map((name) => {
      const version = Number(name.slice(0, 3));
      const sql = normalizeMigrationSource(
        readFileSync(join(migrationDirectory, name), "utf8"),
      );
      const hook = hooks.get(version);
      const checksum = migrationChecksum(sql, hook ? hook.toString() : "");
      return { version, name, sql, checksum, hook };
    });
  migrations.forEach((migration, index) => {
    if (migration.version !== index + 1) {
      throw new Error(
        `SDK migrations must be consecutive from 001; found ${migration.name}.`,
      );
    }
  });
  return migrations;
}

function migrationQueries(sql, source) {
  return source
    .split(";")
    .map((statement) => statement.trim())
    .filter(Boolean)
    .map((statement) => sql.query(statement));
}

async function readAppliedMigrations(sql) {
  const tableRows = await sql`
    SELECT to_regclass('public.sdk_schema_migrations') AS "tableName"
  `;
  if (!tableRows[0]?.tableName) return [];
  return sql`
    SELECT version, name, checksum, applied_at AS "appliedAt"
    FROM sdk_schema_migrations
    ORDER BY version
  `;
}

const migrations = loadMigrations();

export function verifyAppliedChecksums(applied) {
  for (const row of applied) {
    const migration = migrations.find((candidate) => candidate.version === row.version);
    if (!migration) {
      throw new Error(
        `Database has unknown SDK migration ${row.version} (${row.name}).`,
      );
    }
    const isCanonical = migration.name === row.name
      && migration.checksum === row.checksum;
    const isAcceptedLegacy = acceptedLegacyMigrationEntries
      .get(row.version)
      ?.get(row.name) === row.checksum;
    if (!isCanonical && !isAcceptedLegacy) {
      throw new Error(
        `SDK migration ${row.version} checksum does not match ${migration.name}.`,
      );
    }
  }
}

export async function runMigration({ environment, mode = "apply", env = process.env }) {
  assertEnvironmentTarget(environment, env);
  const url = databaseUrl(env);
  const { neon } = await import("@neondatabase/serverless");
  const sql = neon(url);
  let applied = await readAppliedMigrations(sql);
  verifyAppliedChecksums(applied);
  const appliedVersions = new Set(applied.map((row) => row.version));
  const pending = migrations.filter((migration) => !appliedVersions.has(migration.version));

  if (mode === "status" || mode === "check") {
    for (const migration of migrations) {
      const state = appliedVersions.has(migration.version) ? "applied" : "pending";
      console.log(`[sdk-migration] ${state} ${migration.name}`);
    }
    if (mode === "check" && pending.length > 0) {
      throw new Error(
        `SDK database has ${pending.length} pending migration(s); latest required version is `
        + `${migrations.at(-1)?.version ?? 0}.`,
      );
    }
    return;
  }

  await sql`
    CREATE TABLE IF NOT EXISTS sdk_schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      checksum CHAR(64) NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  for (const migration of pending) {
    await sql.transaction(migrationQueries(sql, migration.sql));
    if (migration.hook) await migration.hook(sql);
    await sql`
      INSERT INTO sdk_schema_migrations (version, name, checksum)
      VALUES (${migration.version}, ${migration.name}, ${migration.checksum})
      ON CONFLICT (version) DO NOTHING
    `;
    console.log(`[sdk-migration] applied ${migration.name}`);
  }

  applied = await readAppliedMigrations(sql);
  verifyAppliedChecksums(applied);
  const latestVersion = migrations.at(-1)?.version ?? 0;
  if (applied.at(-1)?.version !== latestVersion) {
    throw new Error(`SDK database migration stopped before version ${latestVersion}.`);
  }
  console.log(`[sdk-migration] database is current at version ${latestVersion}`);
}

async function main() {
  const parsed = parseArgs();
  if (parsed.help) {
    printHelp();
    return;
  }
  await runMigration(parsed);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`[sdk-migration] ${error.message}`);
    process.exitCode = 1;
  });
}

import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const migrationDirectory = join(root, "db/sdk");
const migrations = readdirSync(migrationDirectory)
  .filter((name) => /^\d{3}_[a-z0-9_]+\.sql$/.test(name))
  .sort();
const failures = [];

migrations.forEach((name, index) => {
  const version = Number(name.slice(0, 3));
  if (version !== index + 1) {
    failures.push(`SDK migrations must be consecutive from 001; found ${name}.`);
  }
  const source = readFileSync(join(migrationDirectory, name), "utf8");
  for (const unsafePattern of [
    /\bDROP\s+(?:TABLE|COLUMN|SCHEMA|DATABASE)\b/i,
    /\bTRUNCATE\b/i,
    /\bDELETE\s+FROM\b/i,
  ]) {
    if (unsafePattern.test(source)) {
      failures.push(`${name} contains a destructive statement and requires a separate reviewed migration path.`);
    }
  }
});

const postgresSource = readFileSync(
  join(root, "apps/sdk-portal/lib/sdk-postgres.ts"),
  "utf8",
);
const versionMatch = postgresSource.match(
  /SDK_SCHEMA_VERSION\s*=\s*(\d+)/,
);
const expectedVersion = migrations.length;
if (Number(versionMatch?.[1]) !== expectedVersion) {
  failures.push(
    `SDK_SCHEMA_VERSION must match latest migration ${expectedVersion}.`,
  );
}

const ensureBody = postgresSource.slice(
  postgresSource.indexOf("export async function ensureSdkSchema"),
);
if (/\b(?:CREATE|ALTER|DROP|TRUNCATE)\s+(?:TABLE|INDEX|SCHEMA)\b/i.test(ensureBody)) {
  failures.push("ensureSdkSchema must validate the migration version without applying DDL.");
}

const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
if (!packageJson.scripts?.["sdk:migrate"]?.includes("migrate-sdk-database.mjs")) {
  failures.push("package.json must expose the SDK migration runner as sdk:migrate.");
}

const portalPackageJson = JSON.parse(readFileSync(
  join(root, "apps/sdk-portal/package.json"),
  "utf8",
));
const portalPrebuild = portalPackageJson.scripts?.prebuild ?? "";
if (/migrate-sdk-database|--deploy/.test(portalPrebuild)) {
  failures.push("SDK Portal prebuild must not invoke the migration runner.");
}

const migrationRunner = readFileSync(
  join(root, "scripts/migrate-sdk-database.mjs"),
  "utf8",
);
if (!migrationRunner.includes("--environment development")
  || !migrationRunner.includes("--environment production")) {
  failures.push("SDK migration runner must require an explicit environment target.");
}
if (!migrationRunner.includes("SDK_DATABASE_ENV")
  || !migrationRunner.includes("SDK_DATABASE_URL")) {
  failures.push("SDK migration runner must use explicit SDK environment and URL variables.");
}
if (/process\.env\.(?:POSTGRES_PRISMA_URL|DATABASE_URL)/.test(migrationRunner)) {
  failures.push("SDK migration runner must not fall back to generic database URLs.");
}
if (/VERCEL_PROJECT_NAME.*skip|skipped deploy migration/.test(migrationRunner)) {
  failures.push("SDK migration runner must not silently skip an implicit Vercel deploy mode.");
}

if (failures.length > 0) {
  console.error("\n[sdk-migrations] Contract check failed:\n");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(
  `[sdk-migrations] ${migrations.length} ordered migrations; Runtime requires version ${expectedVersion}.`,
);

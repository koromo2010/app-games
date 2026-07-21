export type AppEnvironment = "production" | "development" | "test";

function normalizeAppEnvironment(value: string | undefined): AppEnvironment | null {
  if (value === "production" || value === "development" || value === "test") return value;
  return null;
}

export function expectedAppEnvironment(
  vercelEnvironment = process.env.VERCEL_ENV,
  nodeEnvironment = process.env.NODE_ENV,
  gitCommitRef = process.env.VERCEL_GIT_COMMIT_REF,
): AppEnvironment {
  const branch = gitCommitRef?.trim();
  if (branch === "main") return "production";
  if (branch === "develop") return "development";
  if (vercelEnvironment === "production") return "production";
  if (vercelEnvironment === "preview" || vercelEnvironment === "development") return "development";
  return nodeEnvironment === "test" ? "test" : nodeEnvironment === "production" ? "production" : "development";
}

export function assertRuntimeEnvironmentAgreement() {
  const expected = expectedAppEnvironment();
  const configured = normalizeAppEnvironment(process.env.APP_ENV);
  if (!configured) throw new Error("APP_ENV_MISSING_OR_INVALID");
  if (configured !== expected && !(configured === "development" && expected === "test")) {
    throw new Error("APP_ENV_VERCEL_ENV_MISMATCH");
  }
  return configured;
}

function assertResourceEnvironment(resource: "APP_DATABASE" | "REDIS" | "BLOB", configured: string | undefined) {
  const appEnvironment = assertRuntimeEnvironmentAgreement();
  if (appEnvironment === "test") return;
  const resourceEnvironment = normalizeAppEnvironment(configured);
  if (!resourceEnvironment || resourceEnvironment === "test") {
    throw new Error(`${resource}_ENV_MISSING_OR_INVALID`);
  }
  if (resourceEnvironment !== appEnvironment) throw new Error(`${resource}_ENV_MISMATCH`);
}

export function assertAppDatabaseEnvironment(configName: string) {
  // APP_DATABASE_URL always opts into strict guarding. During migration, an
  // APP_DATABASE_ENV marker also enables the same guard for a legacy URL so a
  // Sensitive DATABASE_URL does not need to be copied or renamed in Vercel.
  if (configName === "APP_DATABASE_URL" || process.env.APP_DATABASE_ENV?.trim()) {
    assertResourceEnvironment("APP_DATABASE", process.env.APP_DATABASE_ENV);
  }
}

export function assertRedisEnvironment() {
  if (process.env.REDIS_ENV) assertResourceEnvironment("REDIS", process.env.REDIS_ENV);
}

export function assertBlobEnvironment() {
  if (process.env.BLOB_ENV) assertResourceEnvironment("BLOB", process.env.BLOB_ENV);
}

export function canWriteVocabularyDrafts() {
  const environment = assertRuntimeEnvironmentAgreement();
  return environment === "development" || environment === "test";
}

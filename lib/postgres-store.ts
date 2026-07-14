import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

const postgresUrlEnvironmentNames = [
  "DATABASE_URL",
  "database_DATABASE_URL",
  "database_POSTGRES_URL",
  "POSTGRES_URL",
] as const;

let client: NeonQueryFunction<boolean, boolean> | null = null;
let clientUrl = "";

export function getPostgresConfig() {
  for (const name of postgresUrlEnvironmentNames) {
    const url = process.env[name]?.trim();
    if (url) return { name, url };
  }
  return null;
}

export function isPostgresConfigured() {
  return Boolean(getPostgresConfig());
}

export function getPostgresClient() {
  const config = getPostgresConfig();
  if (!config) throw new Error("POSTGRES_STORE_NOT_CONFIGURED");
  if (!client || clientUrl !== config.url) {
    client = neon(config.url);
    clientUrl = config.url;
  }
  return client;
}

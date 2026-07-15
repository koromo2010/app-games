import { ensureWordMasterSchema } from "../lib/word-master-schema.ts";
import { closePostgresClient, getPostgresConfig } from "../lib/postgres-store.ts";

const config = getPostgresConfig();
if (!config) throw new Error("DATABASE_URL or another supported PostgreSQL URL is required");

try {
  await ensureWordMasterSchema();
  console.log("Shared word master schema is ready via " + config.name + ".");
} finally {
  await closePostgresClient();
}

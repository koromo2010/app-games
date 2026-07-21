import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

let client: NeonQueryFunction<boolean, boolean> | null = null;
let initialized: Promise<void> | null = null;

function databaseUrl() {
  const url = process.env.SDK_DATABASE_URL
    ?? process.env.POSTGRES_PRISMA_URL
    ?? process.env.DATABASE_URL;
  if (!url) throw new Error("SDK PostgreSQL is not configured.");
  return url;
}

export function sdkSql() {
  if (!client) client = neon(databaseUrl());
  return client;
}

export async function ensureSdkSchema() {
  if (!initialized) {
    initialized = (async () => {
      const sql = sdkSql();
      await sql`
        CREATE TABLE IF NOT EXISTS sdk_creators (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          slug VARCHAR(32) NOT NULL UNIQUE,
          display_name VARCHAR(80) NOT NULL,
          management_token_hash CHAR(64) NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `;
      await sql`
        CREATE TABLE IF NOT EXISTS sdk_games (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          creator_id UUID NOT NULL REFERENCES sdk_creators(id) ON DELETE CASCADE,
          game_id VARCHAR(64) NOT NULL,
          title VARCHAR(120) NOT NULL,
          description VARCHAR(500) NOT NULL DEFAULT '',
          manifest JSONB NOT NULL,
          sdk_package_version VARCHAR(32) NOT NULL,
          sdk_contract_version INTEGER NOT NULL,
          status VARCHAR(24) NOT NULL DEFAULT 'draft',
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          UNIQUE (creator_id, game_id)
        )
      `;
      await sql`CREATE INDEX IF NOT EXISTS sdk_games_creator_updated_idx ON sdk_games (creator_id, updated_at DESC)`;
    })().catch((error) => {
      initialized = null;
      throw error;
    });
  }
  return initialized;
}

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
          module_policy JSONB NOT NULL DEFAULT '{}'::jsonb,
          sdk_package_version VARCHAR(32) NOT NULL,
          sdk_contract_version INTEGER NOT NULL,
          mock_revision CHAR(40),
          status VARCHAR(24) NOT NULL DEFAULT 'draft',
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          UNIQUE (creator_id, game_id)
        )
      `;
      await sql`ALTER TABLE sdk_games ADD COLUMN IF NOT EXISTS mock_revision CHAR(40)`;
      await sql`ALTER TABLE sdk_games ADD COLUMN IF NOT EXISTS module_policy JSONB NOT NULL DEFAULT '{}'::jsonb`;
      await sql`ALTER TABLE sdk_creators ADD COLUMN IF NOT EXISTS owner_player_id VARCHAR(120)`;
      await sql`CREATE UNIQUE INDEX IF NOT EXISTS sdk_creators_owner_slug_idx ON sdk_creators (owner_player_id, slug) WHERE owner_player_id IS NOT NULL`;
      await sql`CREATE INDEX IF NOT EXISTS sdk_games_creator_updated_idx ON sdk_games (creator_id, updated_at DESC)`;
      await sql`
        CREATE TABLE IF NOT EXISTS sdk_oauth_clients (
          client_id VARCHAR(96) PRIMARY KEY,
          client_name VARCHAR(120) NOT NULL,
          redirect_uris JSONB NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `;
      await sql`
        CREATE TABLE IF NOT EXISTS sdk_oauth_codes (
          code_hash CHAR(64) PRIMARY KEY,
          client_id VARCHAR(96) NOT NULL REFERENCES sdk_oauth_clients(client_id) ON DELETE CASCADE,
          redirect_uri TEXT NOT NULL,
          player_id VARCHAR(120) NOT NULL,
          scope TEXT NOT NULL,
          audience TEXT NOT NULL,
          code_challenge VARCHAR(128) NOT NULL,
          expires_at TIMESTAMPTZ NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `;
      await sql`
        CREATE TABLE IF NOT EXISTS sdk_oauth_grants (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          access_token_hash CHAR(64) NOT NULL UNIQUE,
          refresh_token_hash CHAR(64) NOT NULL UNIQUE,
          client_id VARCHAR(96) NOT NULL REFERENCES sdk_oauth_clients(client_id) ON DELETE CASCADE,
          player_id VARCHAR(120) NOT NULL,
          scope TEXT NOT NULL,
          audience TEXT NOT NULL,
          access_expires_at TIMESTAMPTZ NOT NULL,
          refresh_expires_at TIMESTAMPTZ NOT NULL,
          revoked_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `;
      await sql`CREATE INDEX IF NOT EXISTS sdk_oauth_grants_access_idx ON sdk_oauth_grants (access_token_hash) WHERE revoked_at IS NULL`;
      await sql`ALTER TABLE sdk_oauth_codes ADD COLUMN IF NOT EXISTS audience TEXT NOT NULL DEFAULT ''`;
      await sql`ALTER TABLE sdk_oauth_grants ADD COLUMN IF NOT EXISTS audience TEXT NOT NULL DEFAULT ''`;
    })().catch((error) => {
      initialized = null;
      throw error;
    });
  }
  return initialized;
}

CREATE TABLE IF NOT EXISTS sdk_app_releases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lineage_id VARCHAR(160) NOT NULL,
  public_game_id VARCHAR(64) NOT NULL,
  source_creator_slug VARCHAR(32) NOT NULL,
  source_game_id VARCHAR(64) NOT NULL,
  title VARCHAR(120) NOT NULL,
  description VARCHAR(500) NOT NULL DEFAULT '',
  revision CHAR(40) NOT NULL,
  package_root_sha256 CHAR(64) NOT NULL,
  server_bundle_sha256 CHAR(64) NOT NULL,
  app_set_source_sha256 CHAR(64) NOT NULL,
  manifest JSONB NOT NULL,
  module_policy JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_environment VARCHAR(16) NOT NULL
    CHECK (source_environment IN ('development', 'main', 'legacy')),
  release_kind VARCHAR(16) NOT NULL DEFAULT 'promotion'
    CHECK (release_kind IN ('promotion', 'rollback', 'legacy')),
  restored_from UUID REFERENCES sdk_app_releases(id),
  is_current BOOLEAN NOT NULL DEFAULT TRUE,
  released_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS sdk_app_releases_current_lineage_idx
  ON sdk_app_releases (lineage_id)
  WHERE is_current;
CREATE UNIQUE INDEX IF NOT EXISTS sdk_app_releases_current_public_game_idx
  ON sdk_app_releases (public_game_id)
  WHERE is_current;
CREATE INDEX IF NOT EXISTS sdk_app_releases_history_idx
  ON sdk_app_releases (lineage_id, released_at DESC);

INSERT INTO sdk_app_releases (
  lineage_id, public_game_id, source_creator_slug, source_game_id,
  title, description, revision, package_root_sha256,
  server_bundle_sha256, app_set_source_sha256, manifest, module_policy,
  source_environment, release_kind
)
SELECT
  c.slug || '/' || g.game_id, g.public_game_id, c.slug, g.game_id,
  g.title, g.description, g.stable_revision, g.stable_root_sha256,
  g.stable_bundle_sha256, g.stable_app_set_sha256, g.stable_manifest,
  g.module_policy,
  'legacy',
  'legacy'
FROM sdk_games g
JOIN sdk_creators c ON c.id = g.creator_id
WHERE g.public_game_id IS NOT NULL
  AND g.stable_revision IS NOT NULL
  AND g.stable_root_sha256 IS NOT NULL
  AND g.stable_bundle_sha256 IS NOT NULL
  AND g.stable_app_set_sha256 IS NOT NULL
  AND g.stable_manifest IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM sdk_app_releases r
    WHERE r.lineage_id = c.slug || '/' || g.game_id AND r.is_current
  );

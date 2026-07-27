CREATE TABLE IF NOT EXISTS sdk_release_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lineage_id VARCHAR(160) NOT NULL,
  public_game_id VARCHAR(64),
  route VARCHAR(32) NOT NULL
    CHECK (route IN ('sdk-candidate', 'dev-app')),
  action VARCHAR(16) NOT NULL
    CHECK (action IN ('approve', 'reject', 'rollback')),
  source_environment VARCHAR(16) NOT NULL
    CHECK (source_environment IN ('development', 'main')),
  target_environment VARCHAR(16) NOT NULL
    CHECK (target_environment IN ('development', 'main')),
  revision CHAR(40) NOT NULL,
  package_root_sha256 CHAR(64) NOT NULL,
  server_bundle_sha256 CHAR(64) NOT NULL,
  app_set_source_sha256 CHAR(64) NOT NULL,
  reason VARCHAR(500) NOT NULL,
  actor_ref VARCHAR(320) NOT NULL,
  release_id UUID REFERENCES sdk_app_releases(id),
  decided_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS sdk_release_decisions_lineage_idx
  ON sdk_release_decisions (lineage_id, decided_at DESC);
CREATE INDEX IF NOT EXISTS sdk_release_decisions_revision_idx
  ON sdk_release_decisions (lineage_id, revision, decided_at DESC);
CREATE INDEX IF NOT EXISTS sdk_release_decisions_release_idx
  ON sdk_release_decisions (release_id)
  WHERE release_id IS NOT NULL;

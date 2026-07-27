ALTER TABLE sdk_app_releases
  ADD COLUMN IF NOT EXISTS source_revision CHAR(40);

UPDATE sdk_app_releases
SET source_revision = revision
WHERE source_revision IS NULL;

ALTER TABLE sdk_app_releases
  ALTER COLUMN source_revision SET NOT NULL;

#!/usr/bin/env python3
"""Publish the locally curated shared word catalog to a target PostgreSQL DB.

Only the compact game-facing projection is copied. Raw dictionaries, adapter
CSV files, local classification details, and database dumps never leave the
local workspace through this script.
"""

from __future__ import annotations

import argparse
import os
import sys
import uuid
from typing import Any, Iterable

import psycopg

CATALOG_POLICY_VERSION = "shared-word-catalog-v2"
CATALOG_LOCK_ID = 7_361_128_221_904_771

CANDIDATE_QUERY = """
SELECT id, surface, reading, COALESCE(zipf_frequency, zipf_fallback) AS effective_zipf
FROM words
WHERE active
  AND COALESCE(zipf_frequency, zipf_fallback) IS NOT NULL
  AND form_status <> 'inflected'
  AND NOT is_name_fragment
  AND surface_quality_status = 'clean'
  AND content_safety_status <> 'exclude'
ORDER BY id
"""

CREATE_SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS shared_word_catalog (
  word_master_id BIGINT PRIMARY KEY CHECK (word_master_id > 0),
  surface TEXT NOT NULL,
  reading TEXT NOT NULL DEFAULT '',
  zipf_frequency REAL NOT NULL CHECK (zipf_frequency >= 0),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  catalog_policy_version TEXT NOT NULL,
  last_seen_sync_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE shared_word_catalog
  ADD COLUMN IF NOT EXISTS last_seen_sync_id TEXT;
UPDATE shared_word_catalog
SET last_seen_sync_id = 'legacy'
WHERE last_seen_sync_id IS NULL;
ALTER TABLE shared_word_catalog
  ALTER COLUMN last_seen_sync_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS shared_word_catalog_active_zipf_idx
  ON shared_word_catalog (zipf_frequency, word_master_id)
  WHERE active;

CREATE TABLE IF NOT EXISTS shared_word_game_evaluations (
  word_master_id BIGINT NOT NULL REFERENCES shared_word_catalog(word_master_id) ON DELETE RESTRICT,
  game_type TEXT NOT NULL CHECK (game_type IN ('wordwolf', 'nigoichi', 'tahoiya')),
  usage_penalty REAL NOT NULL DEFAULT 0 CHECK (usage_penalty IN (0, 0.5, 1, 1.5)),
  game_penalty REAL NOT NULL DEFAULT 0 CHECK (game_penalty IN (0, 0.5, 1, 1.5)),
  feedback_adjustment REAL NOT NULL DEFAULT 0 CHECK (feedback_adjustment BETWEEN -0.5 AND 0.5),
  status TEXT NOT NULL DEFAULT 'unreviewed'
    CHECK (status IN ('unreviewed', 'accepted', 'disabled', 'excluded')),
  reason_code TEXT NOT NULL DEFAULT '',
  safety_flags TEXT[] NOT NULL DEFAULT '{}',
  prompt_version TEXT NOT NULL DEFAULT '',
  generation_model TEXT NOT NULL DEFAULT '',
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (word_master_id, game_type)
);

CREATE INDEX IF NOT EXISTS shared_word_game_evaluations_select_idx
  ON shared_word_game_evaluations (game_type, status, word_master_id);

CREATE TABLE IF NOT EXISTS shared_wordwolf_pairs (
  id BIGSERIAL PRIMARY KEY,
  anchor_word_master_id BIGINT NOT NULL REFERENCES shared_word_catalog(word_master_id) ON DELETE RESTRICT,
  partner_word_master_id BIGINT REFERENCES shared_word_catalog(word_master_id) ON DELETE RESTRICT,
  partner_text TEXT NOT NULL CHECK (char_length(partner_text) BETWEEN 1 AND 40),
  common_effective_zipf REAL NOT NULL,
  wordwolf_effective_zipf REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'approved' CHECK (status IN ('approved', 'review', 'disabled')),
  reason_code TEXT NOT NULL DEFAULT '',
  pair_reason TEXT NOT NULL DEFAULT '',
  prompt_version TEXT NOT NULL DEFAULT '',
  generation_model TEXT NOT NULL DEFAULT '',
  play_count INTEGER NOT NULL DEFAULT 0 CHECK (play_count >= 0),
  positive_count INTEGER NOT NULL DEFAULT 0 CHECK (positive_count >= 0),
  negative_count INTEGER NOT NULL DEFAULT 0 CHECK (negative_count >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (anchor_word_master_id, partner_text)
);

CREATE INDEX IF NOT EXISTS shared_wordwolf_pairs_select_idx
  ON shared_wordwolf_pairs (status, wordwolf_effective_zipf, id)
  WHERE status = 'approved';

CREATE OR REPLACE FUNCTION prevent_shared_word_catalog_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'shared_word_catalog rows are immutable; set active=false instead';
END;
$$;

DROP TRIGGER IF EXISTS shared_word_catalog_no_delete ON shared_word_catalog;
CREATE TRIGGER shared_word_catalog_no_delete
BEFORE DELETE ON shared_word_catalog
FOR EACH ROW EXECUTE FUNCTION prevent_shared_word_catalog_delete();
"""


def project_catalog_row(row: Iterable[Any]) -> tuple[int, str, str, float]:
    word_master_id, surface, reading, zipf_frequency = row
    return (
        int(word_master_id),
        str(surface),
        "" if reading is None else str(reading),
        float(zipf_frequency),
    )


def inspect_target(target_url: str) -> dict[str, Any]:
    with psycopg.connect(target_url) as target:
        database, size_bytes = target.execute(
            "SELECT current_database(), pg_database_size(current_database())"
        ).fetchone()
        public_tables = [
            row[0]
            for row in target.execute(
                """
                SELECT tablename
                FROM pg_tables
                WHERE schemaname = 'public'
                ORDER BY tablename
                """
            ).fetchall()
        ]
        catalog_exists = target.execute(
            "SELECT to_regclass('public.shared_word_catalog') IS NOT NULL"
        ).fetchone()[0]

    return {
        "database": str(database),
        "size_bytes": int(size_bytes),
        "public_table_count": len(public_tables),
        "public_tables": public_tables,
        "shared_word_catalog_exists": bool(catalog_exists),
    }


def count_candidates(source_url: str) -> int:
    with psycopg.connect(source_url) as source:
        row = source.execute(f"SELECT COUNT(*) FROM ({CANDIDATE_QUERY}) candidates").fetchone()
        return int(row[0]) if row else 0


def publish(source_url: str, target_url: str) -> dict[str, int]:
    if source_url.strip() == target_url.strip():
        raise ValueError("Source and target database URLs must be different")

    sync_id = str(uuid.uuid4())
    with psycopg.connect(source_url) as source, psycopg.connect(target_url) as target:
        target.execute("SELECT pg_advisory_xact_lock(%s)", (CATALOG_LOCK_ID,))
        target.execute(CREATE_SCHEMA_SQL)
        target.execute(
            """
            CREATE TEMP TABLE shared_word_catalog_stage (
              word_master_id BIGINT PRIMARY KEY,
              surface TEXT NOT NULL,
              reading TEXT NOT NULL,
              zipf_frequency REAL NOT NULL
            ) ON COMMIT DROP
            """
        )

        staged = 0
        with source.cursor(name="shared_word_catalog_source") as source_cursor:
            source_cursor.itersize = 10_000
            source_cursor.execute(CANDIDATE_QUERY)
            with target.cursor().copy(
                """
                COPY shared_word_catalog_stage (
                  word_master_id, surface, reading, zipf_frequency
                ) FROM STDIN
                """
            ) as copy:
                for row in source_cursor:
                    copy.write_row(project_catalog_row(row))
                    staged += 1

        target.execute(
            """
            INSERT INTO shared_word_catalog (
              word_master_id, surface, reading, zipf_frequency,
              active, catalog_policy_version, last_seen_sync_id
            )
            SELECT
              word_master_id, surface, reading, zipf_frequency,
              TRUE, %s, %s
            FROM shared_word_catalog_stage
            ON CONFLICT (word_master_id) DO UPDATE SET
              surface = EXCLUDED.surface,
              reading = EXCLUDED.reading,
              zipf_frequency = EXCLUDED.zipf_frequency,
              active = TRUE,
              catalog_policy_version = EXCLUDED.catalog_policy_version,
              last_seen_sync_id = EXCLUDED.last_seen_sync_id,
              updated_at = NOW()
            """,
            (CATALOG_POLICY_VERSION, sync_id),
        )
        upserted = target.execute("SELECT COUNT(*) FROM shared_word_catalog_stage").fetchone()[0]

        deactivated_rows = target.execute(
            """
            UPDATE shared_word_catalog catalog
            SET active = FALSE,
                catalog_policy_version = %s,
                updated_at = NOW()
            WHERE catalog.active
              AND NOT EXISTS (
                SELECT 1
                FROM shared_word_catalog_stage stage
                WHERE stage.word_master_id = catalog.word_master_id
              )
            RETURNING catalog.word_master_id
            """,
            (CATALOG_POLICY_VERSION,),
        ).fetchall()
        active = target.execute(
            "SELECT COUNT(*) FROM shared_word_catalog WHERE active"
        ).fetchone()[0]
        total = target.execute("SELECT COUNT(*) FROM shared_word_catalog").fetchone()[0]
        target.commit()

    return {
        "staged": int(staged),
        "upserted": int(upserted),
        "deactivated": len(deactivated_rows),
        "active": int(active),
        "total": int(total),
    }


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--source-database-url",
        default=os.getenv("WORD_DB_SOURCE_URL"),
        help="Local word-master PostgreSQL URL; defaults to WORD_DB_SOURCE_URL",
    )
    parser.add_argument(
        "--target-database-url",
        default=os.getenv("DATABASE_URL"),
        help="Target PostgreSQL URL; defaults to DATABASE_URL",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Count local candidates without connecting to or changing the target DB",
    )
    parser.add_argument(
        "--inspect-target",
        action="store_true",
        help="Read target DB metadata without changing it",
    )
    return parser


def main() -> int:
    args = build_parser().parse_args()
    if args.inspect_target:
        if not args.target_database_url:
            print("DATABASE_URL or --target-database-url is required", file=sys.stderr)
            return 2
        for key, value in inspect_target(args.target_database_url).items():
            print(f"{key}: {value}")
        return 0

    if not args.source_database_url:
        print("WORD_DB_SOURCE_URL or --source-database-url is required", file=sys.stderr)
        return 2

    if args.dry_run:
        print(f"shared-word catalog dry run: {count_candidates(args.source_database_url)} candidates")
        return 0

    if not args.target_database_url:
        print("DATABASE_URL or --target-database-url is required", file=sys.stderr)
        return 2

    counts = publish(args.source_database_url, args.target_database_url)
    print("shared-word catalog publish completed")
    for key, value in counts.items():
        print(f"{key}: {value}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

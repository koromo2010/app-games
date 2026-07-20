#!/usr/bin/env python3
"""Publish selected local word pools without replacing the full production catalog."""

from __future__ import annotations

import argparse
import os
import uuid
from dataclasses import dataclass
from typing import Any, Iterable

import psycopg


CATALOG_POLICY_VERSION = "shared-word-selected-pools-v1"
STANDARD_POOL_KEY = "standard-game"
STANDARD_POLICY_VERSION = "standard-game-ichi1-safe-v3"
YOJI_POOL_KEY = "yojijukugo"
YOJI_POLICY_VERSION = "jmdict-yojijukugo-v1"
PUBLISH_LOCK_ID = 7_361_128_221_904_772
YOJI_MARKERS = ("yojijukugo", "four-character idiomatic compound")

QUALITY_FILTER = """
  word.active
  AND word.form_status <> 'inflected'
  AND NOT word.is_name_fragment
  AND word.surface_quality_status = 'clean'
  AND word.content_safety_status <> 'exclude'
"""

STANDARD_POOL_QUERY = f"""
SELECT
  word.id,
  word.surface,
  word.reading,
  COALESCE(
    word.zipf_frequency,
    word.zipf_fallback,
    (evaluation.evidence->>'display_zipf')::REAL,
    0
  ) AS effective_zipf,
  evaluation.eligibility_flags,
  evaluation.policy_version,
  evaluation.evidence->>'difficulty_tier' AS difficulty_tier
FROM words word
JOIN word_pool_evaluations evaluation ON evaluation.word_id = word.id
WHERE {QUALITY_FILTER}
  AND evaluation.pool_key = '{STANDARD_POOL_KEY}'
  AND evaluation.active
  AND evaluation.eligibility_status = 'eligible'
  AND evaluation.policy_version = '{STANDARD_POLICY_VERSION}'
ORDER BY word.id
"""

YOJI_POOL_QUERY = f"""
SELECT DISTINCT
  word.id,
  word.surface,
  word.normalized_form,
  word.reading,
  COALESCE(word.zipf_frequency, word.zipf_fallback, 0) AS effective_zipf
FROM words word
JOIN word_source_entry_links link ON link.word_id = word.id
JOIN word_source_entries entry
  ON entry.id = link.source_entry_row_id AND entry.active
CROSS JOIN LATERAL jsonb_array_elements(
  COALESCE(entry.entry_payload->'sense', '[]'::jsonb)
) sense
WHERE {QUALITY_FILTER}
  AND COALESCE(sense->'misc', '[]'::jsonb) ?| %s
ORDER BY word.id
"""

CREATE_SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS shared_word_pool_evaluations (
  word_master_id BIGINT NOT NULL
    REFERENCES shared_word_catalog(word_master_id) ON DELETE RESTRICT,
  pool_key TEXT NOT NULL,
  eligibility_status TEXT NOT NULL DEFAULT 'eligible'
    CHECK (eligibility_status IN ('eligible', 'review', 'exclude')),
  difficulty_tier TEXT
    CHECK (difficulty_tier IS NULL OR difficulty_tier IN ('easy', 'normal', 'hard')),
  evaluation_flags TEXT[] NOT NULL DEFAULT '{}',
  policy_version TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (word_master_id, pool_key)
);

CREATE INDEX IF NOT EXISTS shared_word_pool_evaluations_select_idx
  ON shared_word_pool_evaluations (
    pool_key, active, eligibility_status, difficulty_tier, word_master_id
  );
"""


@dataclass(frozen=True)
class CatalogRow:
    word_master_id: int
    surface: str
    reading: str
    zipf_frequency: float


@dataclass(frozen=True)
class PoolRow:
    word_master_id: int
    pool_key: str
    difficulty_tier: str | None
    evaluation_flags: tuple[str, ...]
    policy_version: str


def is_kanji(character: str) -> bool:
    codepoint = ord(character)
    return (
        character == "々"
        or 0x3400 <= codepoint <= 0x4DBF
        or 0x4E00 <= codepoint <= 0x9FFF
        or 0xF900 <= codepoint <= 0xFAFF
        or 0x20000 <= codepoint <= 0x3134F
    )


def is_four_kanji(surface: str) -> bool:
    return len(surface) == 4 and all(is_kanji(character) for character in surface)


def project_catalog_row(row: Iterable[Any]) -> CatalogRow:
    word_master_id, surface, reading, zipf_frequency = row
    return CatalogRow(
        word_master_id=int(word_master_id),
        surface=str(surface),
        reading="" if reading is None else str(reading),
        zipf_frequency=float(zipf_frequency),
    )


def load_selected_rows(source_url: str) -> tuple[list[CatalogRow], list[PoolRow]]:
    catalog_by_id: dict[int, CatalogRow] = {}
    pool_rows: list[PoolRow] = []
    with psycopg.connect(source_url) as source:
        for row in source.execute(STANDARD_POOL_QUERY):
            catalog = project_catalog_row(row[:4])
            flags = tuple(sorted(str(flag) for flag in row[4]))
            difficulty_tier = str(row[6]) if row[6] is not None else None
            expected_flag = f"difficulty_{difficulty_tier}"
            if difficulty_tier not in {"easy", "normal", "hard"}:
                raise ValueError(f"invalid difficulty tier for {catalog.word_master_id}")
            if "general_game_pool" not in flags or expected_flag not in flags:
                raise ValueError(f"missing general-pool flags for {catalog.word_master_id}")
            catalog_by_id[catalog.word_master_id] = catalog
            pool_rows.append(
                PoolRow(
                    word_master_id=catalog.word_master_id,
                    pool_key=STANDARD_POOL_KEY,
                    difficulty_tier=difficulty_tier,
                    evaluation_flags=flags,
                    policy_version=str(row[5]),
                )
            )

        for row in source.execute(YOJI_POOL_QUERY, (list(YOJI_MARKERS),)):
            if not is_four_kanji(str(row[2])):
                continue
            catalog = project_catalog_row((row[0], row[1], row[3], row[4]))
            catalog_by_id[catalog.word_master_id] = catalog
            pool_rows.append(
                PoolRow(
                    word_master_id=catalog.word_master_id,
                    pool_key=YOJI_POOL_KEY,
                    difficulty_tier=None,
                    evaluation_flags=("yojijukugo",),
                    policy_version=YOJI_POLICY_VERSION,
                )
            )

    return sorted(catalog_by_id.values(), key=lambda row: row.word_master_id), pool_rows


def publish_selected(source_url: str, target_url: str) -> dict[str, int]:
    if source_url.strip() == target_url.strip():
        raise ValueError("Source and target database URLs must be different")
    catalog_rows, pool_rows = load_selected_rows(source_url)
    sync_id = str(uuid.uuid4())

    with psycopg.connect(target_url) as target:
        target.execute("SELECT pg_advisory_xact_lock(%s)", (PUBLISH_LOCK_ID,))
        if not target.execute(
            "SELECT to_regclass('public.shared_word_catalog') IS NOT NULL"
        ).fetchone()[0]:
            raise ValueError("target shared_word_catalog does not exist")
        target.execute(CREATE_SCHEMA_SQL)

        with target.cursor() as cursor:
            cursor.executemany(
                """
                INSERT INTO shared_word_catalog (
                  word_master_id, surface, reading, zipf_frequency,
                  active, catalog_policy_version, last_seen_sync_id
                )
                VALUES (%s, %s, %s, %s, TRUE, %s, %s)
                ON CONFLICT (word_master_id) DO UPDATE SET
                  surface = EXCLUDED.surface,
                  reading = EXCLUDED.reading,
                  zipf_frequency = EXCLUDED.zipf_frequency,
                  active = TRUE,
                  catalog_policy_version = EXCLUDED.catalog_policy_version,
                  last_seen_sync_id = EXCLUDED.last_seen_sync_id,
                  updated_at = NOW()
                """,
                [
                    (
                        row.word_master_id,
                        row.surface,
                        row.reading,
                        row.zipf_frequency,
                        CATALOG_POLICY_VERSION,
                        sync_id,
                    )
                    for row in catalog_rows
                ],
            )
            cursor.executemany(
                """
                INSERT INTO shared_word_pool_evaluations (
                  word_master_id, pool_key, eligibility_status,
                  difficulty_tier, evaluation_flags, policy_version, active
                )
                VALUES (%s, %s, 'eligible', %s, %s, %s, TRUE)
                ON CONFLICT (word_master_id, pool_key) DO UPDATE SET
                  eligibility_status = EXCLUDED.eligibility_status,
                  difficulty_tier = EXCLUDED.difficulty_tier,
                  evaluation_flags = EXCLUDED.evaluation_flags,
                  policy_version = EXCLUDED.policy_version,
                  active = TRUE,
                  updated_at = NOW()
                """,
                [
                    (
                        row.word_master_id,
                        row.pool_key,
                        row.difficulty_tier,
                        list(row.evaluation_flags),
                        row.policy_version,
                    )
                    for row in pool_rows
                ],
            )

        for pool_key in (STANDARD_POOL_KEY, YOJI_POOL_KEY):
            active_ids = [row.word_master_id for row in pool_rows if row.pool_key == pool_key]
            target.execute(
                """
                UPDATE shared_word_pool_evaluations
                SET active = FALSE, updated_at = NOW()
                WHERE pool_key = %s
                  AND active
                  AND NOT (word_master_id = ANY(%s))
                """,
                (pool_key, active_ids),
            )
        target.commit()

    standard_count = sum(row.pool_key == STANDARD_POOL_KEY for row in pool_rows)
    yoji_count = sum(row.pool_key == YOJI_POOL_KEY for row in pool_rows)
    return {
        "catalog_upserted": len(catalog_rows),
        "standard_game": standard_count,
        "difficulty_easy": sum(
            row.difficulty_tier == "easy" for row in pool_rows
        ),
        "difficulty_normal": sum(
            row.difficulty_tier == "normal" for row in pool_rows
        ),
        "difficulty_hard": sum(
            row.difficulty_tier == "hard" for row in pool_rows
        ),
        "yojijukugo": yoji_count,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-database-url", default=os.getenv("WORD_DB_SOURCE_URL"))
    parser.add_argument("--target-database-url", default=os.getenv("DATABASE_URL"))
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    if not args.source_database_url:
        parser.error("WORD_DB_SOURCE_URL or --source-database-url is required")
    if args.dry_run:
        catalog_rows, pool_rows = load_selected_rows(args.source_database_url)
        print(f"catalog_upserted: {len(catalog_rows)}")
        for pool_key in (STANDARD_POOL_KEY, YOJI_POOL_KEY):
            print(f"{pool_key}: {sum(row.pool_key == pool_key for row in pool_rows)}")
        for tier in ("easy", "normal", "hard"):
            print(f"difficulty_{tier}: {sum(row.difficulty_tier == tier for row in pool_rows)}")
        print("mode: dry-run")
        return 0
    if not args.target_database_url:
        parser.error("DATABASE_URL or --target-database-url is required")
    counts = publish_selected(args.source_database_url, args.target_database_url)
    print("selected word pools publish completed")
    for key, value in counts.items():
        print(f"{key}: {value}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

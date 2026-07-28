#!/usr/bin/env python3
"""Publish reviewed AI general words as a differential production pool."""

from __future__ import annotations

import argparse
import os
import uuid
from dataclasses import dataclass
from typing import Any, Iterable

import psycopg


CATALOG_POLICY_VERSION = "shared-word-ai-general-v1"
POOL_KEY = "ai-general"
POOL_POLICY_VERSION = "ai-general-reviewed-v1"
PUBLISH_LOCK_ID = 7_361_128_221_904_773
DIFFICULTY_ZIPF = {"easy": 6.0, "normal": 5.0, "hard": 4.0}

AI_GENERAL_POOL_QUERY = """
SELECT
  word.id,
  word.surface,
  word.reading,
  word.zipf_frequency,
  candidate.difficulty
FROM ai_word_candidates candidate
JOIN words word ON word.id = candidate.promoted_word_id
WHERE candidate.review_status = 'promoted'
  AND candidate.quality_status = 'approved'
  AND candidate.content_safety_status = 'clean'
  AND candidate.difficulty IS NOT NULL
  AND word.active
  AND word.form_status <> 'inflected'
  AND NOT word.is_name_fragment
  AND word.surface_quality_status = 'clean'
  AND word.content_safety_status NOT IN ('review', 'exclude')
ORDER BY word.id
"""

CREATE_POOL_SCHEMA_SQL = """
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
class AiGeneralPoolRow:
    word_master_id: int
    surface: str
    reading: str
    zipf_frequency: float
    difficulty_tier: str
    evaluation_flags: tuple[str, ...]


def project_ai_general_row(row: Iterable[Any]) -> AiGeneralPoolRow:
    word_master_id, surface, reading, measured_zipf, difficulty = row
    difficulty_tier = str(difficulty)
    if difficulty_tier not in DIFFICULTY_ZIPF:
        raise ValueError(f"invalid difficulty tier for {word_master_id}: {difficulty_tier}")
    projected = measured_zipf is None
    zipf_frequency = (
        DIFFICULTY_ZIPF[difficulty_tier]
        if projected
        else float(measured_zipf)
    )
    return AiGeneralPoolRow(
        word_master_id=int(word_master_id),
        surface=str(surface),
        reading="" if reading is None else str(reading),
        zipf_frequency=zipf_frequency,
        difficulty_tier=difficulty_tier,
        evaluation_flags=(
            "ai_generated",
            "reviewed",
            f"difficulty_{difficulty_tier}",
            "zipf_projected" if projected else "zipf_measured",
        ),
    )


def load_ai_general_rows(source_url: str) -> list[AiGeneralPoolRow]:
    with psycopg.connect(source_url) as source:
        rows = [
            project_ai_general_row(row)
            for row in source.execute(AI_GENERAL_POOL_QUERY)
        ]
    ids = [row.word_master_id for row in rows]
    if len(ids) != len(set(ids)):
        raise ValueError("AI general pool contains duplicate permanent word IDs")
    return rows


def inspect_target(target_url: str) -> dict[str, Any]:
    with psycopg.connect(target_url) as target:
        catalog_exists = bool(
            target.execute(
                "SELECT to_regclass('public.shared_word_catalog') IS NOT NULL"
            ).fetchone()[0]
        )
        pool_exists = bool(
            target.execute(
                "SELECT to_regclass('public.shared_word_pool_evaluations') IS NOT NULL"
            ).fetchone()[0]
        )
        if catalog_exists:
            active_catalog, total_catalog = target.execute(
                """
                SELECT
                  COUNT(*) FILTER (WHERE active),
                  COUNT(*)
                FROM shared_word_catalog
                """
            ).fetchone()
        else:
            active_catalog, total_catalog = 0, 0
        difficulty: dict[str, int] = {}
        active_pool = 0
        if pool_exists:
            for tier, count in target.execute(
                """
                SELECT difficulty_tier, COUNT(*)
                FROM shared_word_pool_evaluations
                WHERE pool_key = %s
                  AND active
                  AND eligibility_status = 'eligible'
                GROUP BY difficulty_tier
                ORDER BY difficulty_tier
                """,
                (POOL_KEY,),
            ):
                difficulty[str(tier)] = int(count)
                active_pool += int(count)
        database, size_bytes = target.execute(
            "SELECT current_database(), pg_database_size(current_database())"
        ).fetchone()
    return {
        "database": str(database),
        "size_bytes": int(size_bytes),
        "catalog_exists": catalog_exists,
        "active_catalog": int(active_catalog),
        "total_catalog": int(total_catalog),
        "pool_exists": pool_exists,
        "active_ai_general_pool": active_pool,
        "difficulty": difficulty,
    }


def publish_ai_general(source_url: str, target_url: str) -> dict[str, int]:
    if source_url.strip() == target_url.strip():
        raise ValueError("Source and target database URLs must be different")
    rows = load_ai_general_rows(source_url)
    sync_id = str(uuid.uuid4())

    with psycopg.connect(target_url) as target:
        target.execute("SELECT pg_advisory_xact_lock(%s)", (PUBLISH_LOCK_ID,))
        if not target.execute(
            "SELECT to_regclass('public.shared_word_catalog') IS NOT NULL"
        ).fetchone()[0]:
            raise ValueError("target shared_word_catalog does not exist")
        target.execute(CREATE_POOL_SCHEMA_SQL)
        target.execute(
            """
            CREATE TEMP TABLE shared_ai_general_stage (
              word_master_id BIGINT PRIMARY KEY,
              surface TEXT NOT NULL,
              reading TEXT NOT NULL,
              zipf_frequency REAL NOT NULL,
              difficulty_tier TEXT NOT NULL,
              evaluation_flags TEXT[] NOT NULL
            ) ON COMMIT DROP
            """
        )
        with target.cursor().copy(
            """
            COPY shared_ai_general_stage (
              word_master_id, surface, reading, zipf_frequency,
              difficulty_tier, evaluation_flags
            ) FROM STDIN
            """
        ) as copy:
            for row in rows:
                copy.write_row(
                    (
                        row.word_master_id,
                        row.surface,
                        row.reading,
                        row.zipf_frequency,
                        row.difficulty_tier,
                        list(row.evaluation_flags),
                    )
                )

        target.execute(
            """
            INSERT INTO shared_word_catalog (
              word_master_id, surface, reading, zipf_frequency,
              active, catalog_policy_version, last_seen_sync_id
            )
            SELECT
              word_master_id, surface, reading, zipf_frequency,
              TRUE, %s, %s
            FROM shared_ai_general_stage
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
        target.execute(
            """
            INSERT INTO shared_word_pool_evaluations (
              word_master_id, pool_key, eligibility_status,
              difficulty_tier, evaluation_flags, policy_version, active
            )
            SELECT
              word_master_id, %s, 'eligible',
              difficulty_tier, evaluation_flags, %s, TRUE
            FROM shared_ai_general_stage
            ON CONFLICT (word_master_id, pool_key) DO UPDATE SET
              eligibility_status = 'eligible',
              difficulty_tier = EXCLUDED.difficulty_tier,
              evaluation_flags = EXCLUDED.evaluation_flags,
              policy_version = EXCLUDED.policy_version,
              active = TRUE,
              updated_at = NOW()
            """,
            (POOL_KEY, POOL_POLICY_VERSION),
        )
        deactivated = target.execute(
            """
            UPDATE shared_word_pool_evaluations evaluation
            SET active = FALSE,
                updated_at = NOW()
            WHERE evaluation.pool_key = %s
              AND evaluation.active
              AND NOT EXISTS (
                SELECT 1
                FROM shared_ai_general_stage stage
                WHERE stage.word_master_id = evaluation.word_master_id
              )
            RETURNING evaluation.word_master_id
            """,
            (POOL_KEY,),
        ).fetchall()
        active_pool = int(
            target.execute(
                """
                SELECT COUNT(*)
                FROM shared_word_pool_evaluations
                WHERE pool_key = %s
                  AND active
                  AND eligibility_status = 'eligible'
                """,
                (POOL_KEY,),
            ).fetchone()[0]
        )
        active_catalog = int(
            target.execute(
                "SELECT COUNT(*) FROM shared_word_catalog WHERE active"
            ).fetchone()[0]
        )
        target.commit()

    return {
        "catalog_upserted": len(rows),
        "pool_deactivated": len(deactivated),
        "active_ai_general_pool": active_pool,
        "active_catalog": active_catalog,
        "difficulty_easy": sum(row.difficulty_tier == "easy" for row in rows),
        "difficulty_normal": sum(row.difficulty_tier == "normal" for row in rows),
        "difficulty_hard": sum(row.difficulty_tier == "hard" for row in rows),
        "zipf_measured": sum("zipf_measured" in row.evaluation_flags for row in rows),
        "zipf_projected": sum("zipf_projected" in row.evaluation_flags for row in rows),
    }


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--source-database-url",
        default=os.getenv("WORD_DB_SOURCE_URL"),
    )
    parser.add_argument(
        "--target-database-url",
        default=os.getenv("DATABASE_URL"),
    )
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--inspect-target", action="store_true")
    return parser


def main() -> int:
    args = build_parser().parse_args()
    if args.inspect_target:
        if not args.target_database_url:
            raise SystemExit("DATABASE_URL or --target-database-url is required")
        print(inspect_target(args.target_database_url))
        return 0
    if not args.source_database_url:
        raise SystemExit("WORD_DB_SOURCE_URL or --source-database-url is required")
    if args.dry_run:
        rows = load_ai_general_rows(args.source_database_url)
        print(f"catalog_upserted: {len(rows)}")
        for tier in ("easy", "normal", "hard"):
            print(
                f"difficulty_{tier}: "
                f"{sum(row.difficulty_tier == tier for row in rows)}"
            )
        print(
            "zipf_measured: "
            f"{sum('zipf_measured' in row.evaluation_flags for row in rows)}"
        )
        print(
            "zipf_projected: "
            f"{sum('zipf_projected' in row.evaluation_flags for row in rows)}"
        )
        print("mode: dry-run")
        return 0
    if not args.target_database_url:
        raise SystemExit("DATABASE_URL or --target-database-url is required")
    counts = publish_ai_general(
        args.source_database_url,
        args.target_database_url,
    )
    print("AI general word pool publish completed")
    for key, value in counts.items():
        print(f"{key}: {value}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

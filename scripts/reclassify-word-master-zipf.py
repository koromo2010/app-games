#!/usr/bin/env python3
"""Recalculate measured and fallback Zipf values in the local word master."""

from __future__ import annotations

import argparse
import os
import sys
from collections import Counter
from typing import Any

import psycopg

from word_zipf import measure_zipf


POLICY_KEY = "zipf-measurement-v1"
POLICY_VALUE = (
    '{"version":1,"measured":"wordfreq whole-token score greater than zero",'
    '"split_or_unseen":"null","effective":"coalesce(zipf_frequency, zipf_fallback)",'
    '"tahoiya_max_exclusive":3,"jmdict_yoji_fallback":2.9}'
)


def ensure_schema(connection: psycopg.Connection[Any]) -> None:
    connection.execute("ALTER TABLE words ADD COLUMN IF NOT EXISTS zipf_fallback REAL")
    connection.execute(
        """
        INSERT INTO word_db_policies (policy_key, policy_value)
        VALUES (%s, %s::jsonb)
        ON CONFLICT (policy_key) DO UPDATE SET
          policy_value = EXCLUDED.policy_value,
          updated_at = NOW()
        """,
        (POLICY_KEY, POLICY_VALUE),
    )
    connection.commit()


def reclassified_values(
    surface: str,
    source_key: str,
    jmdict_fallback: float,
) -> tuple[float | None, float | None, str]:
    measured, status = measure_zipf(surface)
    fallback = jmdict_fallback if measured is None and source_key == "jmdict-yoji" else None
    return measured, fallback, status


def scan(database_url: str, *, apply: bool, jmdict_fallback: float) -> Counter[str]:
    counts: Counter[str] = Counter()
    writer: psycopg.Connection[Any] | None = None
    try:
        if apply:
            writer = psycopg.connect(database_url)
            ensure_schema(writer)
            writer.execute(
                """
                CREATE TEMP TABLE zipf_reclass_stage (
                  word_id BIGINT PRIMARY KEY,
                  zipf_frequency REAL,
                  zipf_fallback REAL
                ) ON COMMIT DROP
                """
            )
            copy_context = writer.cursor().copy(
                "COPY zipf_reclass_stage (word_id, zipf_frequency, zipf_fallback) FROM STDIN"
            )
        else:
            copy_context = None

        with psycopg.connect(database_url) as reader:
            with reader.cursor(name="zipf_reclass_source") as cursor:
                cursor.itersize = 10_000
                cursor.execute(
                    """
                    SELECT words.id, words.surface, words.zipf_frequency, sources.source_key
                    FROM words
                    JOIN word_sources sources ON sources.id = words.source_id
                    WHERE words.active
                    ORDER BY words.id
                    """
                )
                if copy_context is not None:
                    with copy_context as copy:
                        for word_id, surface, previous, source_key in cursor:
                            measured, fallback, status = reclassified_values(
                                str(surface), str(source_key), jmdict_fallback
                            )
                            copy.write_row((int(word_id), measured, fallback))
                            counts["rows"] += 1
                            counts[status] += 1
                            if fallback is not None:
                                counts["fallback"] += 1
                            if previous != measured:
                                counts["changed_measurement"] += 1
                            if counts["rows"] % 100_000 == 0:
                                print(f"Zipf scanned: {counts['rows']}", file=sys.stderr, flush=True)
                else:
                    for _word_id, surface, previous, source_key in cursor:
                        measured, fallback, status = reclassified_values(
                            str(surface), str(source_key), jmdict_fallback
                        )
                        counts["rows"] += 1
                        counts[status] += 1
                        if fallback is not None:
                            counts["fallback"] += 1
                        if previous != measured:
                            counts["changed_measurement"] += 1
                        if counts["rows"] % 100_000 == 0:
                            print(f"Zipf scanned: {counts['rows']}", file=sys.stderr, flush=True)

        if writer is not None:
            updated = writer.execute(
                """
                UPDATE words
                SET zipf_frequency = stage.zipf_frequency,
                    zipf_fallback = stage.zipf_fallback,
                    updated_at = NOW()
                FROM zipf_reclass_stage stage
                WHERE words.id = stage.word_id
                  AND (
                    words.zipf_frequency IS DISTINCT FROM stage.zipf_frequency
                    OR words.zipf_fallback IS DISTINCT FROM stage.zipf_fallback
                  )
                """
            ).rowcount
            counts["updated"] = int(updated)
            writer.commit()
    finally:
        if writer is not None:
            writer.close()
    return counts


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--database-url", default=os.getenv("DATABASE_URL"))
    parser.add_argument("--apply", action="store_true", help="Write changes; default is a dry run")
    parser.add_argument("--jmdict-fallback", type=float, default=2.9)
    args = parser.parse_args()
    if not args.database_url:
        print("DATABASE_URL or --database-url is required", file=sys.stderr)
        return 2
    if args.jmdict_fallback <= 0:
        print("--jmdict-fallback must be greater than zero", file=sys.stderr)
        return 2

    counts = scan(
        args.database_url,
        apply=args.apply,
        jmdict_fallback=args.jmdict_fallback,
    )
    print("word-master Zipf reclassification completed" if args.apply else "word-master Zipf dry run completed")
    for key in sorted(counts):
        print(f"{key}: {counts[key]}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

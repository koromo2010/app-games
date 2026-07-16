#!/usr/bin/env python3
"""Apply deterministic content-safety exclusions to an existing word DB."""

from __future__ import annotations

import argparse
import os
import sys

import psycopg

from word_content_safety_classifier import (
    CONTENT_SAFETY_POLICY_VERSION,
    EXACT_EXCLUDE_FLAGS,
)


def apply_policy(database_url: str) -> dict[str, int]:
    updated_word_ids: set[int] = set()
    with psycopg.connect(database_url) as connection:
        with connection.cursor() as cur:
            for surface, flags in EXACT_EXCLUDE_FLAGS.items():
                cur.execute(
                    """
                    UPDATE words
                    SET content_safety_status = 'exclude',
                        content_safety_flags = %s,
                        content_safety_policy_version = %s,
                        updated_at = NOW()
                    WHERE active
                      AND (surface = %s OR normalized_form = %s)
                      AND (
                        content_safety_status <> 'exclude'
                        OR content_safety_flags <> %s
                        OR content_safety_policy_version <> %s
                      )
                    RETURNING id
                    """,
                    (
                        list(flags),
                        CONTENT_SAFETY_POLICY_VERSION,
                        surface,
                        surface,
                        list(flags),
                        CONTENT_SAFETY_POLICY_VERSION,
                    ),
                )
                updated_word_ids.update(int(row[0]) for row in cur.fetchall())

            if updated_word_ids:
                ids = sorted(updated_word_ids)
                cur.execute(
                    """
                    INSERT INTO word_classification_history (
                      word_id, game_type,
                      previous_difficulty, new_difficulty,
                      previous_usable, new_usable,
                      reason, feedback_snapshot
                    )
                    SELECT
                      setting.word_id, setting.game_type,
                      setting.difficulty, setting.difficulty,
                      setting.usable, FALSE,
                      %s,
                      jsonb_build_object(
                        'content_safety_flags', words.content_safety_flags
                      )
                    FROM game_word_settings setting
                    JOIN words ON words.id = setting.word_id
                    WHERE setting.word_id = ANY(%s)
                      AND (setting.usable OR setting.review_status <> 'disabled')
                    """,
                    (CONTENT_SAFETY_POLICY_VERSION, ids),
                )
                history_rows = cur.rowcount
                cur.execute(
                    """
                    UPDATE game_word_settings
                    SET usable = FALSE,
                        review_status = 'disabled',
                        updated_at = NOW()
                    WHERE word_id = ANY(%s)
                      AND (usable OR review_status <> 'disabled')
                    """,
                    (ids,),
                )
                setting_rows = cur.rowcount
            else:
                history_rows = 0
                setting_rows = 0
        connection.commit()
    return {
        "words_updated": len(updated_word_ids),
        "settings_disabled": setting_rows,
        "history_rows": history_rows,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--database-url", default=os.getenv("DATABASE_URL"))
    args = parser.parse_args()
    if not args.database_url:
        print("DATABASE_URL or --database-url is required", file=sys.stderr)
        return 2
    try:
        counts = apply_policy(args.database_url)
    except Exception as error:
        print(f"content-safety policy failed: {error}", file=sys.stderr)
        return 1
    print("word content-safety policy completed")
    for key in sorted(counts):
        print(f"{key}: {counts[key]}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

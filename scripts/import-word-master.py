#!/usr/bin/env python3
"""Import a normalized lexical source into the shared Game Fields word master.

This script intentionally receives a source-adapter CSV rather than embedding a
specific dictionary's raw format.  The adapter is responsible for preserving the
upstream licence, source version and stable entry ID.  The importer calculates
Japanese wordfreq Zipf values locally and creates initial per-game settings.

Required CSV columns:
  source_entry_id,surface,reading,primary_part_of_speech
Optional CSV columns:
  normalized_form,part_of_speech_details,proper_noun_status,proper_noun_type

Example:
  python scripts/import-word-master.py \
    --database-url "$DATABASE_URL" \
    --source-key sudachidict-core \
    --source-name "SudachiDict Core" \
    --source-version 20260101 \
    --source-url "https://github.com/WorksApplications/SudachiDict" \
    --license "Apache-2.0" \
    --attribution "Works Applications Co., Ltd." \
    --input /path/to/sudachi-core.normalized.csv
"""

from __future__ import annotations

import argparse
import csv
import os
import random
import sys
import unicodedata
from collections import Counter
from pathlib import Path
from typing import Any

import psycopg
from wordfreq import zipf_frequency
from wordfreq.tokens import lossy_tokenize
from word_form_classifier import classify_word_form
from word_content_safety_classifier import classify_content_safety
from word_person_classifier import classify_person_name
from word_surface_quality_classifier import classify_surface_quality

GAME_TYPES = ("wordwolf", "nigoichi", "tahoiya")
VALID_PROPER_STATUS = {"common", "proper", "ambiguous"}
VALID_PROPER_TYPES = {"person", "place", "organization", "other"}


def normalize(value: str) -> str:
    return unicodedata.normalize("NFKC", value).strip().lower()


def split_details(value: str) -> list[str]:
    return [part.strip() for part in value.split("|") if part.strip()]


def get_initial_settings(zipf: float) -> dict[str, tuple[bool, str | None, str]]:
    """Return usable, difficulty and review status without changing Zipf itself."""
    if zipf >= 4.5:
        return {
            "wordwolf": (True, "easy", "auto"),
            "nigoichi": (True, "easy", "auto"),
            "tahoiya": (False, None, "auto"),
        }
    if zipf >= 3.5:
        return {
            "wordwolf": (True, "normal", "auto"),
            "nigoichi": (True, "normal", "auto"),
            "tahoiya": (False, None, "auto"),
        }
    if zipf >= 2.5:
        return {
            "wordwolf": (True, "hard", "auto"),
            "nigoichi": (True, "hard", "auto"),
            "tahoiya": (True, "easy", "auto"),
        }
    if zipf >= 1.0:
        return {
            "wordwolf": (False, None, "unreviewed"),
            "nigoichi": (False, None, "unreviewed"),
            "tahoiya": (True, "normal", "auto"),
        }
    # Zipf 0 can mean "not present in wordfreq"; it remains a hard candidate
    # but cannot be played until a verified definition is attached later.
    return {
        "wordwolf": (False, None, "unreviewed"),
        "nigoichi": (False, None, "unreviewed"),
        "tahoiya": (False, "hard", "unreviewed"),
    }


def parse_row(row: dict[str, str], line_number: int) -> dict[str, Any] | None:
    source_entry_id = row.get("source_entry_id", "").strip()
    surface = row.get("surface", "").strip()
    pos = row.get("primary_part_of_speech", "").strip()
    if not source_entry_id or not surface or not pos:
        return None

    status = row.get("proper_noun_status", "ambiguous").strip().lower() or "ambiguous"
    if status not in VALID_PROPER_STATUS:
        status = "ambiguous"
    proper_type = row.get("proper_noun_type", "").strip().lower() or None
    if proper_type not in VALID_PROPER_TYPES:
        proper_type = None

    normalized_form = normalize(row.get("normalized_form", "") or surface)
    reading = normalize(row.get("reading", ""))
    if not normalized_form:
        return None
    details = split_details(row.get("part_of_speech_details", ""))
    form_status, form_reason, form_policy_version = classify_word_form(pos, details)
    person_name_status, is_name_fragment, person_name_policy_version = (
        classify_person_name(status, proper_type, details)
    )
    surface_quality_status, surface_quality_flags, surface_quality_policy_version = (
        classify_surface_quality(
            surface,
            pos,
            status,
            proper_type,
            len(lossy_tokenize(surface, "ja")),
        )
    )
    content_safety_status, content_safety_flags, content_safety_policy_version = (
        classify_content_safety(surface, normalized_form)
    )

    return {
        "source_entry_id": source_entry_id,
        "surface": surface,
        "normalized_form": normalized_form,
        "reading": reading,
        "primary_part_of_speech": pos,
        "part_of_speech_details": details,
        "form_status": form_status,
        "form_classification_reason": form_reason,
        "form_policy_version": form_policy_version,
        "proper_noun_status": status,
        "proper_noun_type": proper_type,
        "person_name_status": person_name_status,
        "is_name_fragment": is_name_fragment,
        "person_name_policy_version": person_name_policy_version,
        "surface_quality_status": surface_quality_status,
        "surface_quality_flags": surface_quality_flags,
        "surface_quality_policy_version": surface_quality_policy_version,
        "content_safety_status": content_safety_status,
        "content_safety_flags": content_safety_flags,
        "content_safety_policy_version": content_safety_policy_version,
        "zipf_frequency": float(zipf_frequency(surface, "ja")),
        "random_key": random.random(),
        "line_number": line_number,
    }


def ensure_source(cur: psycopg.Cursor[Any], args: argparse.Namespace) -> int:
    cur.execute(
        """
        INSERT INTO word_sources (
          source_key, display_name, source_version, license, attribution, source_url, import_notes
        ) VALUES (%s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT (source_key) DO UPDATE SET
          display_name = EXCLUDED.display_name,
          source_version = EXCLUDED.source_version,
          license = EXCLUDED.license,
          attribution = EXCLUDED.attribution,
          source_url = EXCLUDED.source_url,
          import_notes = EXCLUDED.import_notes,
          updated_at = NOW()
        RETURNING id
        """,
        (
            args.source_key,
            args.source_name,
            args.source_version,
            args.license,
            args.attribution,
            args.source_url,
            args.import_notes,
        ),
    )
    return int(cur.fetchone()[0])



def import_rows(connection: psycopg.Connection[Any], args: argparse.Namespace) -> Counter[str]:
    """Calculate Zipf values, then use PostgreSQL COPY and set-based inserts."""
    counts: Counter[str] = Counter()
    with connection.cursor() as cur:
        source_id = ensure_source(cur, args)
        cur.execute("""
            CREATE TEMP TABLE word_import_stage (
              source_entry_id TEXT NOT NULL,
              surface TEXT NOT NULL,
              normalized_form TEXT NOT NULL,
              reading TEXT NOT NULL,
              primary_part_of_speech TEXT NOT NULL,
              part_of_speech_details TEXT[] NOT NULL,
              form_status TEXT NOT NULL,
              form_classification_reason TEXT NOT NULL,
              form_policy_version TEXT NOT NULL,
              proper_noun_status TEXT NOT NULL,
              proper_noun_type TEXT,
              person_name_status TEXT NOT NULL,
              is_name_fragment BOOLEAN NOT NULL,
              person_name_policy_version TEXT NOT NULL,
              surface_quality_status TEXT NOT NULL,
              surface_quality_flags TEXT[] NOT NULL,
              surface_quality_policy_version TEXT NOT NULL,
              content_safety_status TEXT NOT NULL,
              content_safety_flags TEXT[] NOT NULL,
              content_safety_policy_version TEXT NOT NULL,
              zipf_frequency REAL NOT NULL,
              random_key DOUBLE PRECISION NOT NULL
            ) ON COMMIT DROP
        """)

        with args.input.open("r", encoding="utf-8-sig", newline="") as stream:
            reader = csv.DictReader(stream, delimiter=args.delimiter)
            required = {"source_entry_id", "surface", "primary_part_of_speech"}
            missing = required - set(reader.fieldnames or [])
            if missing:
                raise ValueError(f"input is missing required columns: {', '.join(sorted(missing))}")

            copy_sql = """
                COPY word_import_stage (
                  source_entry_id, surface, normalized_form, reading,
                  primary_part_of_speech, part_of_speech_details,
                  form_status, form_classification_reason, form_policy_version,
                  proper_noun_status, proper_noun_type,
                  person_name_status, is_name_fragment, person_name_policy_version,
                  surface_quality_status, surface_quality_flags, surface_quality_policy_version,
                  content_safety_status, content_safety_flags, content_safety_policy_version,
                  zipf_frequency, random_key
                ) FROM STDIN
            """
            with cur.copy(copy_sql) as copy:
                for line_number, row in enumerate(reader, start=2):
                    if args.max_rows is not None and counts["staged"] >= args.max_rows:
                        break

                    parsed = parse_row(row, line_number)
                    if parsed is None:
                        counts["skipped_invalid"] += 1
                        continue

                    copy.write_row(
                        (
                            parsed["source_entry_id"],
                            parsed["surface"],
                            parsed["normalized_form"],
                            parsed["reading"],
                            parsed["primary_part_of_speech"],
                            parsed["part_of_speech_details"],
                            parsed["form_status"],
                            parsed["form_classification_reason"],
                            parsed["form_policy_version"],
                            parsed["proper_noun_status"],
                            parsed["proper_noun_type"],
                            parsed["person_name_status"],
                            parsed["is_name_fragment"],
                            parsed["person_name_policy_version"],
                            parsed["surface_quality_status"],
                            parsed["surface_quality_flags"],
                            parsed["surface_quality_policy_version"],
                            parsed["content_safety_status"],
                            parsed["content_safety_flags"],
                            parsed["content_safety_policy_version"],
                            parsed["zipf_frequency"],
                            parsed["random_key"],
                        )
                    )
                    counts["staged"] += 1
                    if counts["staged"] % 100_000 == 0:
                        print(f"Zipf calculated: {counts['staged']}", file=sys.stderr, flush=True)

        cur.execute("ANALYZE word_import_stage")
        cur.execute("""
            SELECT source_entry_id
            FROM word_import_stage
            GROUP BY source_entry_id
            HAVING COUNT(*) > 1
            LIMIT 1
        """)
        duplicate_source_entry = cur.fetchone()
        if duplicate_source_entry:
            raise ValueError(f"duplicate source_entry_id: {duplicate_source_entry[0]}")

        cur.execute("""
            SELECT normalized_form, reading, primary_part_of_speech
            FROM word_import_stage
            GROUP BY normalized_form, reading, primary_part_of_speech
            HAVING COUNT(*) > 1
            LIMIT 1
        """)
        duplicate_identity = cur.fetchone()
        if duplicate_identity:
            raise ValueError(f"duplicate normalized identity: {duplicate_identity}")

        cur.execute("""
            SELECT COUNT(*)
            FROM word_import_stage AS stage
            JOIN words
              ON words.source_id = %s
             AND words.source_entry_id = stage.source_entry_id
        """, (source_id,))
        counts["updated"] = int(cur.fetchone()[0])
        counts["inserted"] = counts["staged"] - counts["updated"]

        cur.execute("""
            INSERT INTO words (
              surface, normalized_form, reading, primary_part_of_speech,
              part_of_speech_details, proper_noun_status, proper_noun_type,
              form_status, form_classification_reason, form_policy_version,
              person_name_status, is_name_fragment, person_name_policy_version,
              surface_quality_status, surface_quality_flags, surface_quality_policy_version,
              content_safety_status, content_safety_flags, content_safety_policy_version,
              zipf_frequency, random_key, source_id, source_entry_id, source_version
            )
            SELECT
              surface, normalized_form, reading, primary_part_of_speech,
              part_of_speech_details, proper_noun_status, proper_noun_type,
              form_status, form_classification_reason, form_policy_version,
              person_name_status, is_name_fragment, person_name_policy_version,
              surface_quality_status, surface_quality_flags, surface_quality_policy_version,
              content_safety_status, content_safety_flags, content_safety_policy_version,
              zipf_frequency, random_key, %s, source_entry_id, %s
            FROM word_import_stage
            ON CONFLICT (source_id, source_entry_id) DO UPDATE SET
              surface = EXCLUDED.surface,
              normalized_form = EXCLUDED.normalized_form,
              reading = EXCLUDED.reading,
              primary_part_of_speech = EXCLUDED.primary_part_of_speech,
              part_of_speech_details = EXCLUDED.part_of_speech_details,
              form_status = EXCLUDED.form_status,
              form_classification_reason = EXCLUDED.form_classification_reason,
              form_policy_version = EXCLUDED.form_policy_version,
              proper_noun_status = EXCLUDED.proper_noun_status,
              proper_noun_type = EXCLUDED.proper_noun_type,
              person_name_status = CASE
                WHEN words.person_name_policy_version LIKE 'wikidata-%%'
                  THEN words.person_name_status
                ELSE EXCLUDED.person_name_status
              END,
              is_name_fragment = CASE
                WHEN words.person_name_policy_version LIKE 'wikidata-%%'
                  THEN words.is_name_fragment
                ELSE EXCLUDED.is_name_fragment
              END,
              person_name_policy_version = CASE
                WHEN words.person_name_policy_version LIKE 'wikidata-%%'
                  THEN words.person_name_policy_version
                ELSE EXCLUDED.person_name_policy_version
              END,
              surface_quality_status = EXCLUDED.surface_quality_status,
              surface_quality_flags = EXCLUDED.surface_quality_flags,
              surface_quality_policy_version = EXCLUDED.surface_quality_policy_version,
              content_safety_status = CASE
                WHEN EXCLUDED.content_safety_status = 'exclude'
                  THEN EXCLUDED.content_safety_status
                WHEN words.content_safety_policy_version LIKE 'llm-%%'
                  THEN words.content_safety_status
                ELSE EXCLUDED.content_safety_status
              END,
              content_safety_flags = CASE
                WHEN EXCLUDED.content_safety_status = 'exclude'
                  THEN EXCLUDED.content_safety_flags
                WHEN words.content_safety_policy_version LIKE 'llm-%%'
                  THEN words.content_safety_flags
                ELSE EXCLUDED.content_safety_flags
              END,
              content_safety_policy_version = CASE
                WHEN EXCLUDED.content_safety_status = 'exclude'
                  THEN EXCLUDED.content_safety_policy_version
                WHEN words.content_safety_policy_version LIKE 'llm-%%'
                  THEN words.content_safety_policy_version
                ELSE EXCLUDED.content_safety_policy_version
              END,
              zipf_frequency = EXCLUDED.zipf_frequency,
              source_version = EXCLUDED.source_version,
              active = TRUE,
              updated_at = NOW()
        """, (source_id, args.source_version))

        cur.execute("""
            INSERT INTO game_word_settings (
              word_id, game_type, usable, difficulty, review_status
            )
            SELECT
              words.id,
              game.game_type,
              CASE
                WHEN stage.content_safety_status = 'exclude' THEN FALSE
                WHEN game.game_type IN ('wordwolf', 'nigoichi') THEN stage.zipf_frequency >= 2.5
                ELSE stage.zipf_frequency >= 1.0 AND stage.zipf_frequency < 3.5
              END,
              CASE
                WHEN game.game_type IN ('wordwolf', 'nigoichi') THEN
                  CASE
                    WHEN stage.zipf_frequency >= 4.5 THEN 'easy'
                    WHEN stage.zipf_frequency >= 3.5 THEN 'normal'
                    WHEN stage.zipf_frequency >= 2.5 THEN 'hard'
                    ELSE NULL
                  END
                ELSE
                  CASE
                    WHEN stage.zipf_frequency >= 3.5 THEN NULL
                    WHEN stage.zipf_frequency >= 2.5 THEN 'easy'
                    WHEN stage.zipf_frequency >= 1.0 THEN 'normal'
                    ELSE 'hard'
                  END
              END,
              CASE
                WHEN stage.content_safety_status = 'exclude' THEN 'disabled'
                WHEN game.game_type = 'tahoiya' AND stage.zipf_frequency >= 1.0 THEN 'auto'
                WHEN game.game_type IN ('wordwolf', 'nigoichi') AND stage.zipf_frequency >= 2.5 THEN 'auto'
                ELSE 'unreviewed'
              END
            FROM word_import_stage AS stage
            JOIN words
              ON words.source_id = %s
             AND words.source_entry_id = stage.source_entry_id
            CROSS JOIN (VALUES ('wordwolf'), ('nigoichi'), ('tahoiya')) AS game(game_type)
            ON CONFLICT (word_id, game_type) DO UPDATE SET
              usable = FALSE,
              review_status = 'disabled',
              updated_at = NOW()
            WHERE EXCLUDED.review_status = 'disabled'
        """, (source_id,))
        counts["game_settings_inserted"] = cur.rowcount

        connection.commit()
    return counts



def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--database-url", default=os.getenv("DATABASE_URL"), help="PostgreSQL URL; defaults to DATABASE_URL")
    parser.add_argument("--input", type=Path, required=True, help="Normalized CSV exported by a licensed source adapter")
    parser.add_argument("--delimiter", default=",", help="CSV delimiter (default: comma)")
    parser.add_argument("--source-key", required=True, help="Stable internal source key, e.g. sudachidict-core")
    parser.add_argument("--source-name", required=True)
    parser.add_argument("--source-version", required=True)
    parser.add_argument("--source-url", required=True)
    parser.add_argument("--license", required=True)
    parser.add_argument("--attribution", required=True)
    parser.add_argument("--import-notes", default="")
    parser.add_argument("--max-rows", type=int, help="Process at most this many valid rows (smoke tests)")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if not args.database_url:
        print("DATABASE_URL or --database-url is required", file=sys.stderr)
        return 2
    if not args.input.is_file():
        print(f"input not found: {args.input}", file=sys.stderr)
        return 2

    try:
        with psycopg.connect(args.database_url) as connection:
            counts = import_rows(connection, args)
    except Exception as error:
        print(f"word-master import failed: {error}", file=sys.stderr)
        return 1

    print("word-master import completed")
    for name in sorted(counts):
        print(f"{name}: {counts[name]}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

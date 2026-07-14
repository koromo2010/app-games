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

    return {
        "source_entry_id": source_entry_id,
        "surface": surface,
        "normalized_form": normalized_form,
        "reading": reading,
        "primary_part_of_speech": pos,
        "part_of_speech_details": split_details(row.get("part_of_speech_details", "")),
        "proper_noun_status": status,
        "proper_noun_type": proper_type,
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
    counts: Counter[str] = Counter()
    with connection.cursor() as cur:
        source_id = ensure_source(cur, args)
        with args.input.open("r", encoding="utf-8-sig", newline="") as stream:
            reader = csv.DictReader(stream, delimiter=args.delimiter)
            required = {"source_entry_id", "surface", "primary_part_of_speech"}
            missing = required - set(reader.fieldnames or [])
            if missing:
                raise ValueError(f"input is missing required columns: {', '.join(sorted(missing))}")

            for line_number, row in enumerate(reader, start=2):
                parsed = parse_row(row, line_number)
                if parsed is None:
                    counts["skipped_invalid"] += 1
                    continue

                cur.execute(
                    """
                    INSERT INTO words (
                      surface, normalized_form, reading, primary_part_of_speech,
                      part_of_speech_details, proper_noun_status, proper_noun_type,
                      zipf_frequency, random_key, source_id, source_entry_id, source_version
                    ) VALUES (
                      %(surface)s, %(normalized_form)s, %(reading)s, %(primary_part_of_speech)s,
                      %(part_of_speech_details)s, %(proper_noun_status)s, %(proper_noun_type)s,
                      %(zipf_frequency)s, %(random_key)s, %(source_id)s, %(source_entry_id)s, %(source_version)s
                    )
                    ON CONFLICT (source_id, source_entry_id) DO UPDATE SET
                      surface = EXCLUDED.surface,
                      normalized_form = EXCLUDED.normalized_form,
                      reading = EXCLUDED.reading,
                      primary_part_of_speech = EXCLUDED.primary_part_of_speech,
                      part_of_speech_details = EXCLUDED.part_of_speech_details,
                      proper_noun_status = EXCLUDED.proper_noun_status,
                      proper_noun_type = EXCLUDED.proper_noun_type,
                      zipf_frequency = EXCLUDED.zipf_frequency,
                      source_version = EXCLUDED.source_version,
                      active = TRUE,
                      updated_at = NOW()
                    RETURNING id, (xmax = 0) AS inserted
                    """,
                    {**parsed, "source_id": source_id, "source_version": args.source_version},
                )
                word_id, inserted = cur.fetchone()
                counts["inserted" if inserted else "updated"] += 1

                for game_type, (usable, difficulty, review_status) in get_initial_settings(parsed["zipf_frequency"]).items():
                    cur.execute(
                        """
                        INSERT INTO game_word_settings (
                          word_id, game_type, usable, difficulty, review_status
                        ) VALUES (%s, %s, %s, %s, %s)
                        ON CONFLICT (word_id, game_type) DO NOTHING
                        """,
                        (word_id, game_type, usable, difficulty, review_status),
                    )
                    counts[f"{game_type}_settings"] += 1
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

#!/usr/bin/env python3
"""Preserve complete JMdict yojijukugo entries and link them to master words."""

from __future__ import annotations

import argparse
import gzip
import hashlib
import os
import xml.etree.ElementTree as ET
from collections import Counter
from pathlib import Path
from typing import Any, Iterator


YOJI_MARKERS = {"yojijukugo", "four-character idiomatic compound"}
XML_NAMESPACE = "http://www.w3.org/XML/1998/namespace"


def xml_name(name: str) -> str:
    if name.startswith(f"{{{XML_NAMESPACE}}}"):
        return f"xml:{name.split('}', 1)[1]}"
    return name


def element_payload(element: ET.Element) -> Any:
    """Convert an XML element without dropping child tags or attributes."""
    children = list(element)
    attributes = {xml_name(key): value for key, value in element.attrib.items()}
    text = (element.text or "").strip()
    if not children and not attributes:
        return text

    payload: dict[str, Any] = {}
    for child in children:
        payload.setdefault(xml_name(child.tag), []).append(element_payload(child))
    if attributes:
        payload["@attributes"] = attributes
    if text:
        payload["#text"] = text
    return payload


def entry_payload(entry: ET.Element) -> dict[str, Any]:
    payload = element_payload(entry)
    if not isinstance(payload, dict):
        raise ValueError("JMdict entry payload must be an object")
    return payload


def is_yojijukugo(entry: ET.Element) -> bool:
    return any(
        (misc.text or "").strip() in YOJI_MARKERS
        for misc in entry.findall("./sense/misc")
    )


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


def entry_links(entry: ET.Element) -> set[tuple[str, str]]:
    surfaces = {
        text
        for element in entry.findall("k_ele")
        if (text := (element.findtext("keb") or "").strip())
        and is_four_kanji(text)
    }
    links: set[tuple[str, str]] = set()
    for reading_element in entry.findall("r_ele"):
        if reading_element.find("re_nokanji") is not None:
            continue
        reading = (reading_element.findtext("reb") or "").strip()
        if not reading:
            continue
        restrictions = {
            (element.text or "").strip()
            for element in reading_element.findall("re_restr")
            if (element.text or "").strip()
        }
        for surface in surfaces:
            if not restrictions or surface in restrictions:
                links.add((surface, reading))
    return links


def iter_entries(path: Path) -> Iterator[ET.Element]:
    opener = gzip.open if path.suffix.lower() == ".gz" else open
    with opener(path, "rb") as stream:
        for _event, element in ET.iterparse(stream, events=("end",)):
            if element.tag == "entry":
                yield element
                element.clear()


def load_source(
    path: Path,
) -> tuple[dict[str, dict[str, Any]], set[tuple[str, str, str]], Counter[str]]:
    entries: dict[str, dict[str, Any]] = {}
    links: set[tuple[str, str, str]] = set()
    counts: Counter[str] = Counter()
    for entry in iter_entries(path):
        counts["source_entries"] += 1
        if not is_yojijukugo(entry):
            continue
        source_entry_id = (entry.findtext("ent_seq") or "").strip()
        if not source_entry_id:
            raise ValueError("yojijukugo entry is missing ent_seq")
        if source_entry_id in entries:
            raise ValueError(f"duplicate JMdict ent_seq: {source_entry_id}")
        entries[source_entry_id] = entry_payload(entry)
        for surface, reading in entry_links(entry):
            links.add((source_entry_id, surface, reading))
        counts["yojijukugo_entries"] += 1
    counts["word_links"] = len(links)
    return entries, links, counts


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest().upper()


def ensure_source_entry_schema(cursor: Any) -> None:
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS word_source_entries (
          id BIGSERIAL PRIMARY KEY,
          source_id BIGINT NOT NULL REFERENCES word_sources(id) ON DELETE RESTRICT,
          source_entry_id TEXT NOT NULL,
          source_version TEXT NOT NULL,
          entry_payload JSONB NOT NULL
            CHECK (jsonb_typeof(entry_payload) = 'object'),
          active BOOLEAN NOT NULL DEFAULT TRUE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          UNIQUE (source_id, source_entry_id)
        )
        """
    )
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS word_source_entry_links (
          word_id BIGINT NOT NULL REFERENCES words(id) ON DELETE RESTRICT,
          source_entry_row_id BIGINT NOT NULL
            REFERENCES word_source_entries(id) ON DELETE RESTRICT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          PRIMARY KEY (word_id, source_entry_row_id)
        )
        """
    )
    cursor.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_word_source_entries_source_active
        ON word_source_entries(source_id, active, source_entry_id)
        """
    )
    cursor.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_word_source_entry_links_entry
        ON word_source_entry_links(source_entry_row_id, word_id)
        """
    )


def import_source(
    database_url: str,
    source_key: str,
    entries: dict[str, dict[str, Any]],
    links: set[tuple[str, str, str]],
) -> Counter[str]:
    import psycopg
    from psycopg.types.json import Jsonb

    counts: Counter[str] = Counter()
    with psycopg.connect(database_url) as connection:
        with connection.cursor() as cursor:
            ensure_source_entry_schema(cursor)
            cursor.execute(
                "SELECT id, source_version FROM word_sources WHERE source_key = %s",
                (source_key,),
            )
            source = cursor.fetchone()
            if source is None:
                raise ValueError(
                    f"word source {source_key!r} is not registered; import its words first"
                )
            source_id, source_version = source

            cursor.execute(
                """
                CREATE TEMP TABLE staged_source_entries (
                  source_entry_id TEXT PRIMARY KEY,
                  entry_payload JSONB NOT NULL
                ) ON COMMIT DROP
                """
            )
            cursor.executemany(
                "INSERT INTO staged_source_entries VALUES (%s, %s)",
                ((key, Jsonb(payload)) for key, payload in entries.items()),
            )
            cursor.execute(
                """
                CREATE TEMP TABLE staged_source_links (
                  source_entry_id TEXT NOT NULL,
                  surface TEXT NOT NULL,
                  reading TEXT NOT NULL,
                  PRIMARY KEY (source_entry_id, surface, reading)
                ) ON COMMIT DROP
                """
            )
            cursor.executemany(
                "INSERT INTO staged_source_links VALUES (%s, %s, %s)",
                sorted(links),
            )

            cursor.execute(
                """
                SELECT COUNT(*)
                FROM word_source_entries existing
                JOIN staged_source_entries staged
                  ON staged.source_entry_id = existing.source_entry_id
                WHERE existing.source_id = %s
                """,
                (source_id,),
            )
            counts["updated_entries"] = cursor.fetchone()[0]
            counts["inserted_entries"] = len(entries) - counts["updated_entries"]

            cursor.execute(
                """
                INSERT INTO word_source_entries (
                  source_id, source_entry_id, source_version, entry_payload, active
                )
                SELECT %s, source_entry_id, %s, entry_payload, TRUE
                FROM staged_source_entries
                ON CONFLICT (source_id, source_entry_id) DO UPDATE SET
                  source_version = EXCLUDED.source_version,
                  entry_payload = EXCLUDED.entry_payload,
                  active = TRUE,
                  updated_at = NOW()
                """,
                (source_id, source_version),
            )
            cursor.execute(
                """
                UPDATE word_source_entries existing
                SET active = FALSE, updated_at = NOW()
                WHERE existing.source_id = %s
                  AND existing.active
                  AND NOT EXISTS (
                    SELECT 1
                    FROM staged_source_entries staged
                    WHERE staged.source_entry_id = existing.source_entry_id
                  )
                """,
                (source_id,),
            )
            counts["deactivated_entries"] = cursor.rowcount

            cursor.execute(
                """
                SELECT COUNT(*)
                FROM staged_source_links staged
                LEFT JOIN words word
                  ON word.source_id = %s
                 AND word.surface = staged.surface
                 AND word.reading = staged.reading
                 AND word.active
                WHERE word.id IS NULL
                """,
                (source_id,),
            )
            counts["unmatched_links"] = cursor.fetchone()[0]
            cursor.execute(
                """
                INSERT INTO word_source_entry_links (word_id, source_entry_row_id)
                SELECT word.id, source_entry.id
                FROM staged_source_links staged
                JOIN words word
                  ON word.source_id = %s
                 AND word.surface = staged.surface
                 AND word.reading = staged.reading
                 AND word.active
                JOIN word_source_entries source_entry
                  ON source_entry.source_id = %s
                 AND source_entry.source_entry_id = staged.source_entry_id
                ON CONFLICT DO NOTHING
                """,
                (source_id, source_id),
            )
            counts["inserted_links"] = cursor.rowcount
            cursor.execute(
                """
                SELECT COUNT(*)
                FROM word_source_entry_links link
                JOIN word_source_entries source_entry
                  ON source_entry.id = link.source_entry_row_id
                WHERE source_entry.source_id = %s AND source_entry.active
                """,
                (source_id,),
            )
            counts["active_links"] = cursor.fetchone()[0]
        connection.commit()
    return counts


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--database-url", default=os.environ.get("DATABASE_URL", ""))
    parser.add_argument("--source-key", default="jmdict-yoji")
    parser.add_argument("--expected-sha256", default="")
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Write source entries and links; without this flag only validate and count",
    )
    args = parser.parse_args()
    if not args.input.is_file():
        parser.error(f"input not found: {args.input}")

    checksum = sha256_file(args.input)
    if args.expected_sha256 and checksum != args.expected_sha256.strip().upper():
        parser.error(
            f"SHA-256 mismatch: expected {args.expected_sha256}, actual {checksum}"
        )
    entries, links, source_counts = load_source(args.input)
    print(f"sha256: {checksum}")
    for key in sorted(source_counts):
        print(f"{key}: {source_counts[key]}")

    if not args.apply:
        print("mode: dry-run")
        return 0
    if not args.database_url:
        parser.error("--database-url or DATABASE_URL is required with --apply")
    result = import_source(args.database_url, args.source_key, entries, links)
    for key in sorted(result):
        print(f"{key}: {result[key]}")
    print("mode: applied")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

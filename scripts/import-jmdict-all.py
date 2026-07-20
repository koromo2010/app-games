#!/usr/bin/env python3
"""Import complete JMdict entries and merge their surfaces into the word master."""

from __future__ import annotations

import argparse
import hashlib
import importlib.util
import os
import sys
import unicodedata
import xml.etree.ElementTree as ET
from collections import Counter
from pathlib import Path
from typing import Any, Iterator


SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))
SOURCE_HELPER_PATH = SCRIPT_DIR / "import-jmdict-source.py"
SOURCE_HELPER_SPEC = importlib.util.spec_from_file_location(
    "import_jmdict_source", SOURCE_HELPER_PATH
)
assert SOURCE_HELPER_SPEC and SOURCE_HELPER_SPEC.loader
source_helper = importlib.util.module_from_spec(SOURCE_HELPER_SPEC)
SOURCE_HELPER_SPEC.loader.exec_module(source_helper)

DEFAULT_SOURCE_KEY = "jmdict"
DEFAULT_SOURCE_NAME = "JMdict Japanese-English Dictionary"
DEFAULT_SOURCE_VERSION = "20260718"
DEFAULT_SOURCE_URL = "https://www.edrdg.org/jmdict/j_jmdict.html"
DEFAULT_LICENSE = "CC BY-SA 4.0"
DEFAULT_ATTRIBUTION = "Electronic Dictionary Research and Development Group"
FORM_POLICY_VERSION = "jmdict-lemma-v1"


def normalize_surface(value: str) -> str:
    return unicodedata.normalize("NFKC", value).strip().lower()


def stable_surface_entry_id(normalized_form: str) -> str:
    digest = hashlib.sha256(normalized_form.encode("utf-8")).hexdigest()[:32]
    return f"jmdict-surface:{digest}"


def unique_text(elements: list[ET.Element]) -> list[str]:
    values: list[str] = []
    seen: set[str] = set()
    for element in elements:
        value = (element.text or "").strip()
        if value and value not in seen:
            values.append(value)
            seen.add(value)
    return values


def map_primary_part_of_speech(values: list[str]) -> str:
    lowered = [value.lower() for value in values]
    if any("proper noun" in value for value in lowered):
        return "名詞"
    if any("adverb" in value for value in lowered):
        return "副詞"
    if any("auxiliary verb" in value for value in lowered):
        return "助動詞"
    if any("verb" in value for value in lowered):
        return "動詞"
    if any("adjective" in value for value in lowered):
        return "形容詞"
    if any("interjection" in value for value in lowered):
        return "感動詞"
    if any("conjunction" in value for value in lowered):
        return "接続詞"
    if any("particle" in value for value in lowered):
        return "助詞"
    if any("pronoun" in value for value in lowered):
        return "代名詞"
    if any("prefix" in value for value in lowered):
        return "接頭辞"
    if any("suffix" in value for value in lowered):
        return "接尾辞"
    if any("expression" in value for value in lowered):
        return "表現"
    return "名詞"


def classify_proper_noun(
    part_of_speech: list[str], misc: list[str]
) -> tuple[str, str | None]:
    values = [value.lower() for value in (*part_of_speech, *misc)]
    is_proper = any(
        marker in value
        for value in values
        for marker in (
            "proper noun",
            "organization name",
            "company name",
            "place name",
            "person name",
            "product name",
            "work of art",
        )
    )
    if not is_proper:
        return "common", None
    if any("organization name" in value or "company name" in value for value in values):
        return "proper", "organization"
    if any("place name" in value for value in values):
        return "proper", "place"
    if any("person name" in value for value in values):
        return "proper", "person"
    return "proper", "other"


def entry_form_rows(entry: ET.Element) -> list[tuple[Any, ...]]:
    """Project every JMdict spelling to compatible readings without losing the entry."""
    source_entry_id = (entry.findtext("ent_seq") or "").strip()
    if not source_entry_id:
        raise ValueError("JMdict entry is missing ent_seq")
    part_of_speech = unique_text(entry.findall("./sense/pos"))
    misc = unique_text(entry.findall("./sense/misc"))
    primary_pos = map_primary_part_of_speech(part_of_speech)
    proper_status, proper_type = classify_proper_noun(part_of_speech, misc)
    details = ["JMdict", f"ent_seq={source_entry_id}", *part_of_speech, *misc]

    reading_elements = entry.findall("r_ele")
    kanji_elements = entry.findall("k_ele")
    rows: list[tuple[Any, ...]] = []
    for spelling_order, spelling_element in enumerate(kanji_elements):
        surface = (spelling_element.findtext("keb") or "").strip()
        if not surface:
            continue
        spelling_rank = 0 if spelling_element.findall("ke_pri") else 1
        compatible: list[tuple[int, str]] = []
        for reading_order, reading_element in enumerate(reading_elements):
            if reading_element.find("re_nokanji") is not None:
                continue
            reading = (reading_element.findtext("reb") or "").strip()
            restrictions = {
                (item.text or "").strip()
                for item in reading_element.findall("re_restr")
                if (item.text or "").strip()
            }
            if reading and (not restrictions or surface in restrictions):
                reading_rank = 0 if reading_element.findall("re_pri") else 1
                compatible.append((reading_rank * 100000 + reading_order, reading))
        if not compatible:
            compatible.append((999999, ""))
        for reading_rank, reading in compatible:
            rows.append(
                (
                    source_entry_id,
                    surface,
                    normalize_surface(surface),
                    reading,
                    primary_pos,
                    details,
                    proper_status,
                    proper_type,
                    spelling_rank * 10000000 + spelling_order * 100000 + reading_rank,
                )
            )

    standalone_readings = (
        reading_elements
        if not kanji_elements
        else [
            reading
            for reading in reading_elements
            if reading.find("re_nokanji") is not None
        ]
    )
    for reading_order, reading_element in enumerate(standalone_readings):
        reading = (reading_element.findtext("reb") or "").strip()
        if not reading:
            continue
        reading_rank = 0 if reading_element.findall("re_pri") else 1
        rows.append(
            (
                source_entry_id,
                reading,
                normalize_surface(reading),
                reading,
                primary_pos,
                details,
                proper_status,
                proper_type,
                reading_rank * 10000000 + reading_order,
            )
        )
    return rows


def analyze_source(path: Path) -> Counter[str]:
    counts: Counter[str] = Counter()
    surfaces: set[str] = set()
    entry_ids: set[str] = set()
    for entry in source_helper.iter_entries(path):
        source_entry_id = (entry.findtext("ent_seq") or "").strip()
        if not source_entry_id or source_entry_id in entry_ids:
            raise ValueError(f"invalid or duplicate ent_seq: {source_entry_id!r}")
        entry_ids.add(source_entry_id)
        rows = entry_form_rows(entry)
        counts["source_entries"] += 1
        counts["form_reading_rows"] += len(rows)
        surfaces.update(row[2] for row in rows)
    counts["unique_surfaces"] = len(surfaces)
    return counts


def ensure_source(
    cursor: Any,
    source_key: str,
    source_name: str,
    source_version: str,
    source_url: str,
    license_name: str,
    attribution: str,
    import_notes: str,
) -> int:
    cursor.execute(
        """
        INSERT INTO word_sources (
          source_key, display_name, source_version, license, attribution,
          source_url, import_notes, active
        ) VALUES (%s, %s, %s, %s, %s, %s, %s, TRUE)
        ON CONFLICT (source_key) DO UPDATE SET
          display_name = EXCLUDED.display_name,
          source_version = EXCLUDED.source_version,
          license = EXCLUDED.license,
          attribution = EXCLUDED.attribution,
          source_url = EXCLUDED.source_url,
          import_notes = EXCLUDED.import_notes,
          active = TRUE,
          updated_at = NOW()
        RETURNING id
        """,
        (
            source_key,
            source_name,
            source_version,
            license_name,
            attribution,
            source_url,
            import_notes,
        ),
    )
    return cursor.fetchone()[0]


def create_staging_tables(cursor: Any) -> None:
    cursor.execute(
        """
        CREATE TEMP TABLE staged_jmdict_entries (
          source_entry_id TEXT PRIMARY KEY,
          entry_payload JSONB NOT NULL
        ) ON COMMIT DROP
        """
    )
    cursor.execute(
        """
        CREATE TEMP TABLE staged_jmdict_forms (
          source_entry_id TEXT NOT NULL,
          surface TEXT NOT NULL,
          normalized_form TEXT NOT NULL,
          reading TEXT NOT NULL,
          primary_part_of_speech TEXT NOT NULL,
          part_of_speech_details TEXT[] NOT NULL,
          proper_noun_status TEXT NOT NULL,
          proper_noun_type TEXT,
          selection_rank INTEGER NOT NULL
        ) ON COMMIT DROP
        """
    )


def stage_source(path: Path, cursor: Any, Jsonb: Any) -> Counter[str]:
    counts: Counter[str] = Counter()
    with cursor.copy(
        "COPY staged_jmdict_entries (source_entry_id, entry_payload) FROM STDIN"
    ) as copy:
        for entry in source_helper.iter_entries(path):
            source_entry_id = (entry.findtext("ent_seq") or "").strip()
            if not source_entry_id:
                raise ValueError("JMdict entry is missing ent_seq")
            copy.write_row((source_entry_id, Jsonb(source_helper.entry_payload(entry))))
            counts["source_entries"] += 1

    with cursor.copy(
        """
        COPY staged_jmdict_forms (
          source_entry_id, surface, normalized_form, reading,
          primary_part_of_speech, part_of_speech_details,
          proper_noun_status, proper_noun_type, selection_rank
        ) FROM STDIN
        """
    ) as copy:
        for entry in source_helper.iter_entries(path):
            for row in entry_form_rows(entry):
                copy.write_row(row)
                counts["form_reading_rows"] += 1
    cursor.execute(
        "CREATE INDEX staged_jmdict_forms_normalized_idx ON staged_jmdict_forms(normalized_form)"
    )
    cursor.execute(
        "CREATE INDEX staged_jmdict_forms_entry_idx ON staged_jmdict_forms(source_entry_id)"
    )
    cursor.execute("SELECT COUNT(DISTINCT normalized_form) FROM staged_jmdict_forms")
    counts["unique_surfaces"] = cursor.fetchone()[0]
    return counts


def create_surface_targets(cursor: Any) -> None:
    cursor.execute(
        """
        CREATE TEMP TABLE staged_surface_targets AS
        WITH surfaces AS (
          SELECT DISTINCT normalized_form
          FROM staged_jmdict_forms
        )
        SELECT
          surface.normalized_form,
          existing.id AS word_id
        FROM surfaces surface
        LEFT JOIN LATERAL (
          SELECT word.id
          FROM words word
          JOIN word_sources source ON source.id = word.source_id
          WHERE word.normalized_form = surface.normalized_form
            AND word.active
          ORDER BY
            CASE
              WHEN source.source_key = 'sudachidict-core' THEN 0
              WHEN source.source_key = 'jmdict-yoji' THEN 2
              ELSE 1
            END,
            word.id
          LIMIT 1
        ) existing ON TRUE
        """
    )
    cursor.execute(
        "CREATE UNIQUE INDEX staged_surface_targets_normalized_idx ON staged_surface_targets(normalized_form)"
    )


def iter_new_word_rows(candidates: list[tuple[Any, ...]], counts: Counter[str]) -> Iterator[tuple[Any, ...]]:
    from word_content_safety_classifier import classify_content_safety
    from word_surface_quality_classifier import classify_surface_quality
    from word_zipf import measure_zipf
    from wordfreq.tokens import lossy_tokenize

    for (
        source_entry_id,
        surface,
        normalized_form,
        reading,
        primary_pos,
        details,
        proper_status,
        proper_type,
    ) in candidates:
        zipf, measurement = measure_zipf(surface)
        counts[f"new_{measurement}"] += 1
        if primary_pos in {"動詞", "形容詞", "助動詞"}:
            form_status = "dictionary"
            form_reason = "jmdict-lemma"
        else:
            form_status = "non_inflecting"
            form_reason = f"non-inflecting-pos:{primary_pos}"
        if proper_type == "person":
            person_status = "general_person"
        else:
            person_status = "not_person"
        quality_status, quality_flags, quality_policy = classify_surface_quality(
            surface,
            primary_pos,
            proper_status,
            proper_type,
            len(lossy_tokenize(surface, "ja")),
        )
        safety_status, safety_flags, safety_policy = classify_content_safety(
            surface, normalized_form
        )
        yield (
            stable_surface_entry_id(normalized_form),
            surface,
            normalized_form,
            reading,
            primary_pos,
            details,
            form_status,
            form_reason,
            FORM_POLICY_VERSION,
            proper_status,
            proper_type,
            person_status,
            False,
            "jmdict-person-v1",
            quality_status,
            quality_flags,
            quality_policy,
            safety_status,
            safety_flags,
            safety_policy,
            zipf,
            None,
            source_entry_id,
        )


def stage_new_words(cursor: Any, counts: Counter[str]) -> None:
    cursor.execute(
        """
        CREATE TEMP TABLE staged_new_words (
          synthetic_source_entry_id TEXT PRIMARY KEY,
          surface TEXT NOT NULL,
          normalized_form TEXT NOT NULL UNIQUE,
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
          zipf_frequency REAL,
          zipf_fallback REAL,
          original_source_entry_id TEXT NOT NULL
        ) ON COMMIT DROP
        """
    )
    cursor.execute(
        """
        SELECT DISTINCT ON (form.normalized_form)
          form.source_entry_id, form.surface, form.normalized_form, form.reading,
          form.primary_part_of_speech, form.part_of_speech_details,
          form.proper_noun_status, form.proper_noun_type
        FROM staged_jmdict_forms form
        JOIN staged_surface_targets target
          ON target.normalized_form = form.normalized_form
        WHERE target.word_id IS NULL
        ORDER BY
          form.normalized_form, form.selection_rank,
          form.source_entry_id, form.reading, form.surface
        """
    )
    candidates = cursor.fetchall()
    counts["new_words"] = len(candidates)
    with cursor.copy(
        """
        COPY staged_new_words (
          synthetic_source_entry_id, surface, normalized_form, reading,
          primary_part_of_speech, part_of_speech_details,
          form_status, form_classification_reason, form_policy_version,
          proper_noun_status, proper_noun_type, person_name_status,
          is_name_fragment, person_name_policy_version,
          surface_quality_status, surface_quality_flags, surface_quality_policy_version,
          content_safety_status, content_safety_flags, content_safety_policy_version,
          zipf_frequency, zipf_fallback, original_source_entry_id
        ) FROM STDIN
        """
    ) as copy:
        for row in iter_new_word_rows(candidates, counts):
            copy.write_row(row)


def import_all(
    args: argparse.Namespace,
    checksum: str,
) -> Counter[str]:
    import psycopg
    from psycopg.types.json import Jsonb

    counts: Counter[str] = Counter()
    with psycopg.connect(args.database_url) as connection:
        with connection.cursor() as cursor:
            source_helper.ensure_source_entry_schema(cursor)
            source_id = ensure_source(
                cursor,
                args.source_key,
                args.source_name,
                args.source_version,
                args.source_url,
                args.license,
                args.attribution,
                f"Complete JMdict_e.gz import; SHA-256 {checksum}; source fields preserved as JSONB",
            )
            cursor.execute("SELECT COALESCE(MAX(id), 0) FROM words")
            counts["word_id_before_max"] = cursor.fetchone()[0]
            create_staging_tables(cursor)
            counts.update(stage_source(args.input, cursor, Jsonb))

            cursor.execute(
                """
                SELECT COUNT(*)
                FROM word_source_entries existing
                JOIN staged_jmdict_entries staged
                  ON staged.source_entry_id = existing.source_entry_id
                WHERE existing.source_id = %s
                """,
                (source_id,),
            )
            counts["updated_entries"] = cursor.fetchone()[0]
            counts["inserted_entries"] = counts["source_entries"] - counts["updated_entries"]
            cursor.execute(
                """
                INSERT INTO word_source_entries (
                  source_id, source_entry_id, source_version, entry_payload, active
                )
                SELECT %s, source_entry_id, %s, entry_payload, TRUE
                FROM staged_jmdict_entries
                ON CONFLICT (source_id, source_entry_id) DO UPDATE SET
                  source_version = EXCLUDED.source_version,
                  entry_payload = EXCLUDED.entry_payload,
                  active = TRUE,
                  updated_at = NOW()
                """,
                (source_id, args.source_version),
            )
            cursor.execute(
                """
                UPDATE word_source_entries existing
                SET active = FALSE, updated_at = NOW()
                WHERE existing.source_id = %s
                  AND existing.active
                  AND NOT EXISTS (
                    SELECT 1 FROM staged_jmdict_entries staged
                    WHERE staged.source_entry_id = existing.source_entry_id
                  )
                """,
                (source_id,),
            )
            counts["deactivated_entries"] = cursor.rowcount

            create_surface_targets(cursor)
            cursor.execute(
                "SELECT COUNT(*) FROM staged_surface_targets WHERE word_id IS NOT NULL"
            )
            counts["matched_surfaces"] = cursor.fetchone()[0]
            stage_new_words(cursor, counts)
            cursor.execute(
                """
                INSERT INTO words (
                  source_entry_id, surface, normalized_form, reading,
                  primary_part_of_speech, part_of_speech_details,
                  form_status, form_classification_reason, form_policy_version,
                  proper_noun_status, proper_noun_type,
                  person_name_status, is_name_fragment, person_name_policy_version,
                  surface_quality_status, surface_quality_flags, surface_quality_policy_version,
                  content_safety_status, content_safety_flags, content_safety_policy_version,
                  zipf_frequency, zipf_fallback,
                  source_id, source_version, active
                )
                SELECT
                  synthetic_source_entry_id, surface, normalized_form, reading,
                  primary_part_of_speech, part_of_speech_details,
                  form_status, form_classification_reason, form_policy_version,
                  proper_noun_status, proper_noun_type,
                  person_name_status, is_name_fragment, person_name_policy_version,
                  surface_quality_status, surface_quality_flags, surface_quality_policy_version,
                  content_safety_status, content_safety_flags, content_safety_policy_version,
                  zipf_frequency, zipf_fallback,
                  %s, %s, TRUE
                FROM staged_new_words
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
                  person_name_status = EXCLUDED.person_name_status,
                  person_name_policy_version = EXCLUDED.person_name_policy_version,
                  surface_quality_status = EXCLUDED.surface_quality_status,
                  surface_quality_flags = EXCLUDED.surface_quality_flags,
                  surface_quality_policy_version = EXCLUDED.surface_quality_policy_version,
                  content_safety_status = EXCLUDED.content_safety_status,
                  content_safety_flags = EXCLUDED.content_safety_flags,
                  content_safety_policy_version = EXCLUDED.content_safety_policy_version,
                  zipf_frequency = EXCLUDED.zipf_frequency,
                  zipf_fallback = EXCLUDED.zipf_fallback,
                  source_version = EXCLUDED.source_version,
                  active = TRUE,
                  updated_at = NOW()
                """,
                (source_id, args.source_version),
            )
            cursor.execute(
                """
                UPDATE staged_surface_targets target
                SET word_id = word.id
                FROM words word
                WHERE target.word_id IS NULL
                  AND word.source_id = %s
                  AND word.normalized_form = target.normalized_form
                  AND word.active
                """,
                (source_id,),
            )
            cursor.execute(
                "SELECT COUNT(*) FROM staged_surface_targets WHERE word_id IS NULL"
            )
            counts["unresolved_surfaces"] = cursor.fetchone()[0]

            cursor.execute(
                """
                INSERT INTO word_source_entry_links (word_id, source_entry_row_id)
                SELECT DISTINCT target.word_id, source_entry.id
                FROM staged_jmdict_forms form
                JOIN staged_surface_targets target
                  ON target.normalized_form = form.normalized_form
                JOIN word_source_entries source_entry
                  ON source_entry.source_id = %s
                 AND source_entry.source_entry_id = form.source_entry_id
                WHERE target.word_id IS NOT NULL
                ON CONFLICT DO NOTHING
                """,
                (source_id,),
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
            cursor.execute(
                """
                SELECT COUNT(*)
                FROM word_source_entries source_entry
                WHERE source_entry.source_id = %s
                  AND source_entry.active
                  AND NOT EXISTS (
                    SELECT 1 FROM word_source_entry_links link
                    WHERE link.source_entry_row_id = source_entry.id
                  )
                """,
                (source_id,),
            )
            counts["unlinked_entries"] = cursor.fetchone()[0]

            cursor.execute(
                """
                UPDATE words provisional
                SET active = FALSE, updated_at = NOW()
                FROM word_sources provisional_source, staged_surface_targets target
                WHERE provisional.source_id = provisional_source.id
                  AND provisional_source.source_key = 'jmdict-yoji'
                  AND provisional.normalized_form = target.normalized_form
                  AND target.word_id IS NOT NULL
                  AND provisional.id <> target.word_id
                  AND provisional.active
                """
            )
            counts["deactivated_provisional_words"] = cursor.rowcount
            cursor.execute("SELECT COALESCE(MAX(id), 0) FROM words")
            counts["word_id_after_max"] = cursor.fetchone()[0]
        connection.commit()
    return counts


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--database-url", default=os.environ.get("DATABASE_URL", ""))
    parser.add_argument("--source-key", default=DEFAULT_SOURCE_KEY)
    parser.add_argument("--source-name", default=DEFAULT_SOURCE_NAME)
    parser.add_argument("--source-version", default=DEFAULT_SOURCE_VERSION)
    parser.add_argument("--source-url", default=DEFAULT_SOURCE_URL)
    parser.add_argument("--license", default=DEFAULT_LICENSE)
    parser.add_argument("--attribution", default=DEFAULT_ATTRIBUTION)
    parser.add_argument("--expected-sha256", default="")
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    if not args.input.is_file():
        parser.error(f"input not found: {args.input}")
    checksum = source_helper.sha256_file(args.input)
    if args.expected_sha256 and checksum != args.expected_sha256.strip().upper():
        parser.error(
            f"SHA-256 mismatch: expected {args.expected_sha256}, actual {checksum}"
        )
    print(f"sha256: {checksum}")
    if not args.apply:
        for key, value in sorted(analyze_source(args.input).items()):
            print(f"{key}: {value}")
        print("mode: dry-run")
        return 0
    if not args.database_url:
        parser.error("--database-url or DATABASE_URL is required with --apply")
    for key, value in sorted(import_all(args, checksum).items()):
        print(f"{key}: {value}")
    print("mode: applied")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

#!/usr/bin/env python3
"""Enrich foreign person-name fragments with Wikidata canonical people.

The script only excludes a standalone name after two independent conditions are
met: Wikidata classifies the exact text as a family/given name, and a Japanese
Wikipedia human with the same label or alias supplies a different full name.
Responses are cached under .word-master-local so interrupted runs can resume.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import Any, Iterable

POLICY_VERSION = "wikidata-person-name-v2"
SUPPORTED_CACHE_VERSIONS = frozenset({"wikidata-person-name-v1", POLICY_VERSION})
WIKIDATA_SOURCE_KEY = "wikidata-person-ja"
WIKIDATA_ENDPOINT = "https://query.wikidata.org/sparql"
DEFAULT_USER_AGENT = "GameFieldsWordMasterBot/0.1 (https://github.com/koromo2010/app-games)"
SEPARATOR_PATTERN = re.compile(r"[・･＝=\s]+")
KATAKANA_PATTERN = re.compile(r"^[ァ-ヶー]+$")
FOREIGN_CANDIDATE_PATTERN = re.compile(r"^[ァ-ヶー]+$")
QID_PATTERN = re.compile(r"^Q[1-9][0-9]*$")

FAMILY_NAME_CLASSES = frozenset({"Q101352"})
GIVEN_NAME_CLASSES = frozenset({"Q202444", "Q12308941", "Q11879590", "Q3409032"})
ALL_NAME_CLASSES = tuple(sorted(FAMILY_NAME_CLASSES | GIVEN_NAME_CLASSES))


@dataclass(frozen=True)
class HumanMatch:
    qid: str
    canonical_name: str
    description: str
    wikipedia_url: str
    sitelink_count: int


def normalize(value: str) -> str:
    return unicodedata.normalize("NFKC", value).strip().lower()


def extract_qid(uri: str) -> str:
    qid = uri.rsplit("/", 1)[-1]
    return qid if QID_PATTERN.fullmatch(qid) else ""


def sparql_literal(value: str) -> str:
    escaped = value.replace("\\", "\\\\").replace('"', '\\"').replace("\n", " ")
    return f'"{escaped}"@ja'


def build_role_query(surfaces: Iterable[str]) -> str:
    values = " ".join(sparql_literal(surface) for surface in surfaces)
    classes = " ".join(
        f"<http://www.wikidata.org/entity/{qid}>" for qid in ALL_NAME_CLASSES
    )
    return f"""
SELECT DISTINCT ?input ?name ?kind WHERE {{
  VALUES ?input {{ {values} }}
  {{ ?name <http://www.w3.org/2000/01/rdf-schema#label> ?input }}
  UNION
  {{ ?name <http://www.w3.org/2004/02/skos/core#altLabel> ?input }}
  ?name <http://www.wikidata.org/prop/direct/P31> ?kind .
  VALUES ?kind {{ {classes} }}
}}
""".strip()


def build_human_query(surfaces: Iterable[str]) -> str:
    values = " ".join(sparql_literal(surface) for surface in surfaces)
    return f"""
SELECT DISTINCT ?input ?person ?personLabel ?description ?article ?sitelinks WHERE {{
  VALUES ?input {{ {values} }}
  ?person <http://www.wikidata.org/prop/direct/P31> <http://www.wikidata.org/entity/Q5> ;
          <http://wikiba.se/ontology#sitelinks> ?sitelinks ;
          <http://www.w3.org/2000/01/rdf-schema#label> ?personLabel .
  {{ ?person <http://www.w3.org/2000/01/rdf-schema#label> ?input }}
  UNION
  {{ ?person <http://www.w3.org/2004/02/skos/core#altLabel> ?input }}
  FILTER(LANG(?personLabel) = 'ja')
  ?article <http://schema.org/about> ?person ;
           <http://schema.org/isPartOf> <https://ja.wikipedia.org/> .
  OPTIONAL {{
    ?person <http://schema.org/description> ?description .
    FILTER(LANG(?description) = 'ja')
  }}
}}
ORDER BY ?input DESC(?sitelinks)
""".strip()


def binding_value(binding: dict[str, Any], key: str) -> str:
    return str(binding.get(key, {}).get("value", ""))


def parse_role_bindings(bindings: Iterable[dict[str, Any]]) -> dict[str, set[str]]:
    roles: dict[str, set[str]] = defaultdict(set)
    for binding in bindings:
        surface = binding_value(binding, "input")
        kind = extract_qid(binding_value(binding, "kind"))
        if surface and kind in FAMILY_NAME_CLASSES:
            roles[surface].add("surname")
        if surface and kind in GIVEN_NAME_CLASSES:
            roles[surface].add("given_name")
    return roles


def parse_human_bindings(bindings: Iterable[dict[str, Any]]) -> dict[str, list[HumanMatch]]:
    humans: dict[str, dict[str, HumanMatch]] = defaultdict(dict)
    for binding in bindings:
        surface = binding_value(binding, "input")
        qid = extract_qid(binding_value(binding, "person"))
        canonical_name = binding_value(binding, "personLabel")
        if not surface or not qid or not canonical_name:
            continue
        try:
            sitelink_count = int(binding_value(binding, "sitelinks") or 0)
        except ValueError:
            sitelink_count = 0
        humans[surface][qid] = HumanMatch(
            qid=qid,
            canonical_name=canonical_name,
            description=binding_value(binding, "description"),
            wikipedia_url=binding_value(binding, "article"),
            sitelink_count=sitelink_count,
        )
    return {
        surface: sorted(items.values(), key=lambda item: (-item.sitelink_count, item.qid))
        for surface, items in humans.items()
    }


def status_for_roles(roles: set[str]) -> tuple[str, str]:
    if roles == {"surname"}:
        return "surname_only", "surname"
    if roles == {"given_name"}:
        return "given_name_only", "given_name"
    return "name_only", "name_fragment"


def human_expands_surface(surface: str, human: HumanMatch) -> bool:
    surface_key = normalize(surface)
    parts = [part for part in SEPARATOR_PATTERN.split(human.canonical_name) if part]
    part_keys = [normalize(part) for part in parts]
    return len(part_keys) >= 2 and surface_key in part_keys


def infer_roles_from_humans(surface: str, humans: Iterable[HumanMatch]) -> set[str]:
    """Infer a fragment role only when an exact human alias expands to a full name."""
    surface_key = normalize(surface)
    roles: set[str] = set()
    for human in humans:
        parts = [part for part in SEPARATOR_PATTERN.split(human.canonical_name) if part]
        part_keys = [normalize(part) for part in parts]
        if not human_expands_surface(surface, human):
            continue
        if surface_key == part_keys[-1]:
            roles.add("surname")
        else:
            # Name order varies across languages, so non-final components are
            # excluded as a generic name fragment rather than guessed as given names.
            roles.add("name_fragment")
    return roles


def guess_reading(label: str) -> str:
    compact = SEPARATOR_PATTERN.sub("", unicodedata.normalize("NFKC", label))
    return compact if KATAKANA_PATTERN.fullmatch(compact) else ""


def looks_like_foreign_candidate(surface: str) -> bool:
    return bool(
        surface
        and not SEPARATOR_PATTERN.search(surface)
        and FOREIGN_CANDIDATE_PATTERN.fullmatch(surface)
    )


class WikidataClient:
    def __init__(self, user_agent: str, delay_seconds: float) -> None:
        self.user_agent = user_agent
        self.delay_seconds = delay_seconds
        self.last_request_at = 0.0

    def query(self, sparql: str) -> list[dict[str, Any]]:
        elapsed = time.monotonic() - self.last_request_at
        if elapsed < self.delay_seconds:
            time.sleep(self.delay_seconds - elapsed)
        body = urllib.parse.urlencode({"query": sparql}).encode("utf-8")
        request = urllib.request.Request(
            WIKIDATA_ENDPOINT,
            data=body,
            headers={
                "User-Agent": self.user_agent,
                "Accept": "application/sparql-results+json",
                "Content-Type": "application/x-www-form-urlencoded; charset=utf-8",
            },
            method="POST",
        )
        for attempt in range(4):
            try:
                with urllib.request.urlopen(request, timeout=70) as response:
                    payload = json.load(response)
                self.last_request_at = time.monotonic()
                return list(payload.get("results", {}).get("bindings", []))
            except urllib.error.HTTPError as error:
                if error.code not in {429, 500, 502, 503, 504} or attempt == 3:
                    raise
                retry_after = error.headers.get("Retry-After")
                wait = float(retry_after) if retry_after and retry_after.isdigit() else 2**attempt
                time.sleep(max(1.0, wait))
            except urllib.error.URLError:
                if attempt == 3:
                    raise
                time.sleep(2**attempt)
        return []


class JsonlCache:
    def __init__(self, path: Path) -> None:
        self.path = path
        self.entries: dict[str, dict[str, Any]] = {}
        if path.is_file():
            with path.open("r", encoding="utf-8") as stream:
                for line in stream:
                    try:
                        entry = json.loads(line)
                    except json.JSONDecodeError:
                        continue
                    if entry.get("policy_version") in SUPPORTED_CACHE_VERSIONS and entry.get("surface"):
                        self.entries[str(entry["surface"])] = entry

    def append(self, entry: dict[str, Any]) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self.path.open("a", encoding="utf-8") as stream:
            stream.write(json.dumps(entry, ensure_ascii=False, sort_keys=True) + "\n")
        self.entries[str(entry["surface"])] = entry


def fetch_batch(
    client: WikidataClient,
    cache: JsonlCache,
    surfaces: list[str],
    refresh: bool,
) -> dict[str, dict[str, Any]]:
    pending = [surface for surface in surfaces if refresh or surface not in cache.entries]
    if pending:
        role_map = parse_role_bindings(client.query(build_role_query(pending)))
        human_map = parse_human_bindings(client.query(build_human_query(pending)))
        retrieved_at = date.today().isoformat()
        for surface in pending:
            entry = {
                "surface": surface,
                "roles": sorted(role_map.get(surface, set())),
                "humans": [human.__dict__ for human in human_map.get(surface, [])],
                "policy_version": POLICY_VERSION,
                "retrieved_at": retrieved_at,
            }
            cache.append(entry)
    return {surface: cache.entries[surface] for surface in surfaces}


def ensure_source(cur: psycopg.Cursor[Any], source_version: str) -> int:
    cur.execute(
        """
        INSERT INTO word_sources (
          source_key, display_name, source_version, license, attribution, source_url, import_notes
        ) VALUES (%s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT (source_key) DO UPDATE SET
          source_version = EXCLUDED.source_version,
          license = EXCLUDED.license,
          attribution = EXCLUDED.attribution,
          source_url = EXCLUDED.source_url,
          import_notes = EXCLUDED.import_notes,
          updated_at = NOW()
        RETURNING id
        """,
        (
            WIKIDATA_SOURCE_KEY,
            "Wikidata Japanese person labels",
            source_version,
            "CC0-1.0",
            "Wikidata contributors",
            "https://www.wikidata.org/",
            "Japanese labels and entity links fetched through the Wikidata Query Service",
        ),
    )
    return int(cur.fetchone()[0])


def upsert_person_entity(
    cur: psycopg.Cursor[Any], human: HumanMatch, source_version: str
) -> int:
    cur.execute(
        """
        INSERT INTO person_entities (
          wikidata_entity_id, canonical_name, description, wikipedia_url,
          sitelink_count, source_version
        ) VALUES (%s, %s, %s, %s, %s, %s)
        ON CONFLICT (wikidata_entity_id) DO UPDATE SET
          canonical_name = EXCLUDED.canonical_name,
          description = EXCLUDED.description,
          wikipedia_url = EXCLUDED.wikipedia_url,
          sitelink_count = EXCLUDED.sitelink_count,
          source_version = EXCLUDED.source_version,
          active = TRUE,
          updated_at = NOW()
        RETURNING id
        """,
        (
            human.qid,
            human.canonical_name,
            human.description,
            human.wikipedia_url,
            human.sitelink_count,
            source_version,
        ),
    )
    return int(cur.fetchone()[0])


def ensure_full_name_word(
    cur: psycopg.Cursor[Any], source_id: int, human: HumanMatch, source_version: str
) -> tuple[int, bool]:
    from wordfreq import zipf_frequency

    normalized = normalize(human.canonical_name)
    cur.execute(
        """
        SELECT id
        FROM words
        WHERE normalized_form = %s
          AND proper_noun_type = 'person'
          AND NOT is_name_fragment
          AND active
        ORDER BY CASE WHEN reading <> '' THEN 0 ELSE 1 END, id
        LIMIT 1
        """,
        (normalized,),
    )
    existing = cur.fetchone()
    if existing:
        return int(existing[0]), False

    reading = guess_reading(human.canonical_name)
    zipf = float(zipf_frequency(human.canonical_name, "ja"))
    cur.execute(
        """
        INSERT INTO words (
          surface, normalized_form, reading, primary_part_of_speech,
          part_of_speech_details, form_status, form_classification_reason,
          form_policy_version, proper_noun_status, proper_noun_type,
          person_name_status, is_name_fragment, person_name_policy_version,
          surface_quality_status, surface_quality_flags, surface_quality_policy_version,
          zipf_frequency, source_id, source_entry_id, source_version
        ) VALUES (
          %s, %s, %s, '名詞', ARRAY['固有名詞', '人名', '一般'],
          'non_inflecting', 'non-inflecting-pos:名詞', 'jp-conjugation-form-v1',
          'proper', 'person', 'general_person', FALSE, %s,
          'clean', ARRAY[]::TEXT[], 'surface-quality-v1',
          %s, %s, %s, %s
        )
        ON CONFLICT (source_id, source_entry_id) DO UPDATE SET
          surface = EXCLUDED.surface,
          normalized_form = EXCLUDED.normalized_form,
          reading = EXCLUDED.reading,
          surface_quality_status = EXCLUDED.surface_quality_status,
          surface_quality_flags = EXCLUDED.surface_quality_flags,
          surface_quality_policy_version = EXCLUDED.surface_quality_policy_version,
          source_version = EXCLUDED.source_version,
          active = TRUE,
          updated_at = NOW()
        RETURNING id
        """,
        (
            human.canonical_name,
            normalized,
            reading,
            POLICY_VERSION,
            zipf,
            source_id,
            human.qid,
            source_version,
        ),
    )
    word_id = int(cur.fetchone()[0])
    cur.execute(
        """
        INSERT INTO game_word_settings (word_id, game_type, usable, difficulty, review_status)
        VALUES
          (%s, 'wordwolf', FALSE, NULL, 'unreviewed'),
          (%s, 'nigoichi', FALSE, NULL, 'unreviewed'),
          (%s, 'tahoiya', FALSE, 'hard', 'unreviewed')
        ON CONFLICT (word_id, game_type) DO NOTHING
        """,
        (word_id, word_id, word_id),
    )
    return word_id, True


def upsert_link(
    cur: psycopg.Cursor[Any],
    word_id: int,
    entity_id: int,
    role: str,
    match_method: str,
    source_version: str,
) -> None:
    cur.execute(
        """
        INSERT INTO word_person_entity_links (
          word_id, person_entity_id, name_role, confidence, match_method, source_version
        ) VALUES (%s, %s, %s, 1.0, %s, %s)
        ON CONFLICT (word_id, person_entity_id, name_role) DO UPDATE SET
          confidence = EXCLUDED.confidence,
          match_method = EXCLUDED.match_method,
          source_version = EXCLUDED.source_version,
          active = TRUE,
          updated_at = NOW()
        """,
        (word_id, entity_id, role, match_method, source_version),
    )



def reset_legacy_match(cur: psycopg.Cursor[Any], word_id: int) -> bool:
    """Undo v1 matches that fail the stricter canonical-component rule."""
    cur.execute(
        """
        UPDATE word_person_entity_links
        SET active = FALSE, updated_at = NOW()
        WHERE word_id = %s AND name_role <> 'full_name' AND active
        """,
        (word_id,),
    )
    cur.execute(
        """
        UPDATE words
        SET person_name_status = 'general_person',
            is_name_fragment = FALSE,
            person_name_policy_version = 'sudachi-person-name-v1',
            updated_at = NOW()
        WHERE id = %s
          AND person_name_policy_version = 'wikidata-person-name-v1'
        RETURNING id
        """,
        (word_id,),
    )
    return cur.fetchone() is not None


def deactivate_orphan_entities(cur: psycopg.Cursor[Any], source_id: int) -> Counter[str]:
    """Deactivate trial data that no longer has a verified fragment link."""
    counts: Counter[str] = Counter()
    cur.execute(
        """
        UPDATE person_entities entity
        SET active = FALSE, updated_at = NOW()
        WHERE entity.active
          AND NOT EXISTS (
            SELECT 1
            FROM word_person_entity_links link
            WHERE link.person_entity_id = entity.id
              AND link.name_role <> 'full_name'
              AND link.active
          )
        RETURNING entity.id
        """
    )
    counts["orphan_entities_deactivated"] = len(cur.fetchall())
    cur.execute(
        """
        UPDATE word_person_entity_links link
        SET active = FALSE, updated_at = NOW()
        FROM person_entities entity
        WHERE link.person_entity_id = entity.id
          AND NOT entity.active
          AND link.active
        RETURNING link.word_id
        """
    )
    counts["orphan_links_deactivated"] = len(cur.fetchall())
    cur.execute(
        """
        UPDATE words word
        SET active = FALSE, updated_at = NOW()
        WHERE word.source_id = %s
          AND word.active
          AND NOT EXISTS (
            SELECT 1
            FROM word_person_entity_links link
            JOIN person_entities entity ON entity.id = link.person_entity_id
            WHERE link.word_id = word.id
              AND link.name_role = 'full_name'
              AND link.active
              AND entity.active
          )
        RETURNING word.id
        """,
        (source_id,),
    )
    orphan_word_ids = [int(row[0]) for row in cur.fetchall()]
    counts["orphan_full_name_words_deactivated"] = len(orphan_word_ids)
    if orphan_word_ids:
        cur.execute(
            """
            UPDATE game_word_settings
            SET usable = FALSE, updated_at = NOW()
            WHERE word_id = ANY(%s) AND usable
            """,
            (orphan_word_ids,),
        )
    cur.execute(
        """
        UPDATE words
        SET surface_quality_status = 'clean',
            surface_quality_flags = '{}',
            surface_quality_policy_version = 'surface-quality-v1',
            updated_at = NOW()
        WHERE source_id = %s
          AND active
          AND surface_quality_policy_version = ''
        RETURNING id
        """,
        (source_id,),
    )
    counts["full_name_quality_backfilled"] = len(cur.fetchall())
    return counts


def apply_entry(
    cur: psycopg.Cursor[Any],
    source_id: int,
    word_id: int,
    surface: str,
    entry: dict[str, Any],
    source_version: str,
    max_people: int,
) -> Counter[str]:
    counts: Counter[str] = Counter()
    humans = [HumanMatch(**item) for item in entry.get("humans", [])]
    humans = [
        human for human in humans
        if human_expands_surface(surface, human)
    ]
    roles = set(entry.get("roles", []))
    inferred = not roles
    if inferred:
        roles = infer_roles_from_humans(surface, humans)
    if not roles:
        counts["not_name_fragment"] += 1
        if reset_legacy_match(cur, word_id):
            counts["legacy_matches_reverted"] += 1
        return counts
    if not humans:
        counts["fragment_without_full_name"] += 1
        if reset_legacy_match(cur, word_id):
            counts["legacy_matches_reverted"] += 1
        return counts

    cur.execute(
        """
        UPDATE word_person_entity_links
        SET active = FALSE, updated_at = NOW()
        WHERE word_id = %s AND name_role <> 'full_name' AND active
        """,
        (word_id,),
    )
    status, role = status_for_roles(roles)
    replacements = 0
    for human in humans[:max_people]:
        entity_id = upsert_person_entity(cur, human, source_version)
        full_word_id, inserted = ensure_full_name_word(cur, source_id, human, source_version)
        match_method = (
            "wikidata-exact-human-alias-component" if inferred
            else "wikidata-exact-name-and-human-alias"
        )
        upsert_link(cur, word_id, entity_id, role, match_method, source_version)
        upsert_link(cur, full_word_id, entity_id, "full_name", "wikidata-canonical-ja-label", source_version)
        replacements += 1
        counts["full_name_words_inserted" if inserted else "full_name_words_reused"] += 1

    if replacements:
        cur.execute(
            """
            UPDATE words
            SET person_name_status = %s,
                is_name_fragment = TRUE,
                person_name_policy_version = %s,
                updated_at = NOW()
            WHERE id = %s
            """,
            (status, POLICY_VERSION, word_id),
        )
        counts[status] += 1
        counts["fragments_excluded"] += 1
    return counts


def select_candidates(
    cur: psycopg.Cursor[Any], surfaces: list[str], max_rows: int | None
) -> list[tuple[int, str]]:
    if surfaces:
        cur.execute(
            """
            SELECT id, surface
            FROM words
            WHERE (
                person_name_status = 'general_person'
                OR (
                  person_name_policy_version = 'wikidata-person-name-v1'
                  AND is_name_fragment
                )
              )
              AND surface = ANY(%s)
            ORDER BY id
            """,
            (surfaces,),
        )
    else:
        cur.execute(
            """
            SELECT id, surface
            FROM words
            WHERE proper_noun_type = 'person'
              AND (
                person_name_status = 'general_person'
                OR (
                  person_name_policy_version = 'wikidata-person-name-v1'
                  AND is_name_fragment
                )
              )
            ORDER BY
              CASE WHEN person_name_policy_version = 'wikidata-person-name-v1' THEN 0 ELSE 1 END,
              zipf_frequency DESC NULLS LAST,
              id
            """
        )
    candidates = [
        (int(word_id), surface)
        for word_id, surface in cur.fetchall()
        if looks_like_foreign_candidate(surface)
    ]
    return candidates[:max_rows] if max_rows is not None else candidates


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--database-url", default=os.getenv("DATABASE_URL"))
    parser.add_argument("--surface", action="append", default=[], help="Process one exact surface; repeatable")
    parser.add_argument("--max-rows", type=int)
    parser.add_argument("--batch-size", type=int, default=20)
    parser.add_argument("--max-people-per-name", type=int, default=1)
    parser.add_argument("--delay-seconds", type=float, default=1.0)
    parser.add_argument("--user-agent", default=os.getenv("WIKIDATA_USER_AGENT", DEFAULT_USER_AGENT))
    parser.add_argument(
        "--cache",
        type=Path,
        default=Path(".word-master-local/wikidata-person-enrichment-v1.jsonl"),
    )
    parser.add_argument("--refresh", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    return parser.parse_args()


def main() -> int:
    import psycopg

    args = parse_args()
    if not args.database_url:
        print("DATABASE_URL or --database-url is required", file=sys.stderr)
        return 2
    if args.batch_size < 1 or args.batch_size > 100:
        print("--batch-size must be between 1 and 100", file=sys.stderr)
        return 2
    if args.max_people_per_name < 1 or args.max_people_per_name > 5:
        print("--max-people-per-name must be between 1 and 5", file=sys.stderr)
        return 2

    client = WikidataClient(args.user_agent, args.delay_seconds)
    cache = JsonlCache(args.cache)
    totals: Counter[str] = Counter()
    with psycopg.connect(args.database_url) as connection:
        with connection.cursor() as cur:
            candidates = select_candidates(cur, args.surface, args.max_rows)
            totals["candidates"] = len(candidates)
            source_version = date.today().isoformat()
            source_id = ensure_source(cur, source_version) if not args.dry_run else 0
            for offset in range(0, len(candidates), args.batch_size):
                batch = candidates[offset : offset + args.batch_size]
                entries = fetch_batch(client, cache, [surface for _, surface in batch], args.refresh)
                for word_id, surface in batch:
                    entry = entries[surface]
                    if args.dry_run:
                        humans = [
                            HumanMatch(**item) for item in entry.get("humans", [])
                            if human_expands_surface(surface, HumanMatch(**item))
                        ]
                        roles = set(entry.get("roles", [])) or infer_roles_from_humans(
                            surface, humans
                        )
                        totals["matched_fragments"] += int(bool(roles and humans))
                    else:
                        totals.update(
                            apply_entry(
                                cur,
                                source_id,
                                word_id,
                                surface,
                                entry,
                                source_version,
                                args.max_people_per_name,
                            )
                        )
                if not args.dry_run:
                    connection.commit()
                print(
                    f"processed: {min(offset + len(batch), len(candidates))}/{len(candidates)}",
                    file=sys.stderr,
                    flush=True,
                )
            if not args.dry_run:
                totals.update(deactivate_orphan_entities(cur, source_id))
                connection.commit()
        if args.dry_run:
            connection.rollback()

    print("wikidata person-name enrichment completed")
    for name in sorted(totals):
        print(f"{name}: {totals[name]}")
    print(f"cache: {args.cache}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

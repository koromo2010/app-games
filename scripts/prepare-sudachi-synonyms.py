#!/usr/bin/env python3
"""Download, verify, and index the pinned Sudachi synonym dictionary."""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import os
import sys
import unicodedata
import urllib.request
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any, Iterable

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_MANIFEST = ROOT / "config" / "word-sources" / "sudachi-synonym-20260428.json"
DEFAULT_LOCAL_ROOT = ROOT / ".word-master-local" / "sudachi-synonym"
CANDIDATE_QUERY = """
SELECT id, surface, normalized_form
FROM words
WHERE active
  AND form_status <> 'inflected'
  AND NOT is_name_fragment
  AND surface_quality_status = 'clean'
  AND content_safety_status <> 'exclude'
ORDER BY id
"""


def normalize(value: str | None) -> str:
    return unicodedata.normalize("NFKC", value or "").strip().lower()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def load_manifest(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as stream:
        manifest = json.load(stream)
    required = {
        "source_key",
        "display_name",
        "version",
        "release_url",
        "commit",
        "license",
        "license_url",
        "legal_url",
        "attribution",
        "asset",
    }
    missing = required - set(manifest)
    if missing:
        raise ValueError(f"manifest is missing: {', '.join(sorted(missing))}")
    asset_required = {"url", "file_name", "sha256", "bytes", "columns"}
    asset_missing = asset_required - set(manifest["asset"])
    if asset_missing:
        raise ValueError(f"manifest asset is missing: {', '.join(sorted(asset_missing))}")
    return manifest


def verify_source(path: Path, asset: dict[str, Any]) -> None:
    expected_size = int(asset["bytes"])
    actual_size = path.stat().st_size
    if actual_size != expected_size:
        raise ValueError(
            f"size mismatch for {path.name}: expected {expected_size}, got {actual_size}"
        )
    expected_hash = str(asset["sha256"]).lower()
    actual_hash = sha256_file(path)
    if actual_hash != expected_hash:
        raise ValueError(
            f"SHA-256 mismatch for {path.name}: expected {expected_hash}, got {actual_hash}"
        )


def download_source(asset: dict[str, Any], version_dir: Path) -> Path:
    source_path = version_dir / str(asset["file_name"])
    partial = source_path.with_suffix(source_path.suffix + ".part")
    if source_path.is_file():
        verify_source(source_path, asset)
        print(f"verified existing source: {source_path.name}")
        return source_path
    if partial.is_file():
        try:
            verify_source(partial, asset)
            os.replace(partial, source_path)
            print(f"verified completed partial source: {source_path.name}")
            return source_path
        except ValueError:
            partial.unlink()

    request = urllib.request.Request(
        str(asset["url"]), headers={"User-Agent": "app-games-word-master/1"}
    )
    print(f"downloading: {asset['url']}")
    with urllib.request.urlopen(request) as response, partial.open("wb") as output:
        while chunk := response.read(1024 * 1024):
            output.write(chunk)
    try:
        verify_source(partial, asset)
    except Exception:
        partial.unlink(missing_ok=True)
        raise
    os.replace(partial, source_path)
    return source_path


def parse_source_row(
    row: list[str], line_number: int, expected_columns: int = 11
) -> dict[str, Any]:
    if len(row) != expected_columns:
        raise ValueError(
            f"synonyms.txt:{line_number}: expected {expected_columns} columns, got {len(row)}"
        )
    group_id = row[0].strip()
    expansion_control = row[2].strip() or "0"
    lexeme_id = row[3].strip()
    headword = row[8].strip()
    if len(group_id) != 6 or not group_id.isdigit():
        raise ValueError(f"synonyms.txt:{line_number}: invalid group id: {group_id!r}")
    if expansion_control not in {"0", "1", "2"}:
        raise ValueError(
            f"synonyms.txt:{line_number}: invalid expansion control: {expansion_control!r}"
        )
    if not headword:
        raise ValueError(f"synonyms.txt:{line_number}: headword is empty")
    return {
        "group_id": group_id,
        "nominal_verbal": row[1].strip(),
        "expansion_control": expansion_control,
        "lexeme_id": lexeme_id,
        "form_type": row[4].strip(),
        "abbreviation_type": row[5].strip(),
        "orthography_type": row[6].strip(),
        "domain": row[7].strip(),
        "headword": headword,
    }


def build_index(
    source_path: Path, output_path: Path, *, expected_columns: int = 11
) -> dict[str, Any]:
    counts: Counter[str] = Counter()
    groups: set[str] = set()
    headwords: dict[str, list[dict[str, Any]]] = defaultdict(list)
    with source_path.open("r", encoding="utf-8", newline="") as stream:
        for line_number, row in enumerate(csv.reader(stream), start=1):
            if not row:
                continue
            entry = parse_source_row(row, line_number, expected_columns)
            counts["entry_count"] += 1
            groups.add(entry["group_id"])
            key = normalize(entry["headword"])
            if entry["expansion_control"] == "2":
                counts["disabled_entry_count"] += 1
                continue
            headwords[key].append(
                {
                    "group_id": entry["group_id"],
                    "lexeme_id": entry["lexeme_id"],
                    "form_type": entry["form_type"],
                    "abbreviation_type": entry["abbreviation_type"],
                    "orthography_type": entry["orthography_type"],
                    "domain": entry["domain"],
                    "headword": entry["headword"],
                }
            )
            counts["active_entry_count"] += 1
    index = {
        "entry_count": counts["entry_count"],
        "active_entry_count": counts["active_entry_count"],
        "disabled_entry_count": counts["disabled_entry_count"],
        "group_count": len(groups),
        "active_headword_count": len(headwords),
        "headwords": dict(sorted(headwords.items())),
    }
    output_path.parent.mkdir(parents=True, exist_ok=True)
    temporary = output_path.with_suffix(output_path.suffix + ".part")
    temporary.write_text(json.dumps(index, ensure_ascii=False) + "\n", encoding="utf-8")
    os.replace(temporary, output_path)
    return index


def summarize_coverage(
    rows: Iterable[tuple[int, str, str]], headwords: dict[str, Any]
) -> dict[str, Any]:
    total = 0
    normalized_matches = 0
    surface_matches = 0
    for _, surface, normalized_form in rows:
        total += 1
        normalized_form_key = normalize(normalized_form)
        surface_key = normalize(surface)
        if normalized_form_key in headwords:
            normalized_matches += 1
        elif surface_key in headwords:
            surface_matches += 1
    matched = normalized_matches + surface_matches
    return {
        "candidate_count": total,
        "matched_count": matched,
        "missing_count": total - matched,
        "coverage_ratio": matched / total if total else 0.0,
        "match_method": {
            "normalized_form": normalized_matches,
            "surface_fallback": surface_matches,
        },
    }


def analyze_coverage(database_url: str, index: dict[str, Any]) -> dict[str, Any]:
    import psycopg

    with psycopg.connect(database_url) as connection:
        with connection.cursor() as cursor:
            cursor.execute(CANDIDATE_QUERY)
            return summarize_coverage(cursor, index["headwords"])


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", type=Path, default=DEFAULT_MANIFEST)
    parser.add_argument("--local-root", type=Path, default=DEFAULT_LOCAL_ROOT)
    parser.add_argument("--download-only", action="store_true")
    parser.add_argument("--coverage", action="store_true")
    parser.add_argument("--database-url", default=os.getenv("DATABASE_URL"))
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    try:
        manifest = load_manifest(args.manifest)
        version_dir = args.local_root / str(manifest["version"])
        version_dir.mkdir(parents=True, exist_ok=True)
        source_path = download_source(manifest["asset"], version_dir)
        if args.download_only:
            return 0
        index_path = version_dir / "synonym-index.json"
        index = build_index(
            source_path,
            index_path,
            expected_columns=int(manifest["asset"]["columns"]),
        )
        print(f"synonym index: {index_path}")
        print(f"entries: {index['entry_count']:,}")
        print(f"active entries: {index['active_entry_count']:,}")
        print(f"groups: {index['group_count']:,}")
        print(f"active headwords: {index['active_headword_count']:,}")
        if args.coverage:
            if not args.database_url:
                raise ValueError("DATABASE_URL or --database-url is required with --coverage")
            coverage = analyze_coverage(args.database_url, index)
            coverage_path = version_dir / "word-master-coverage.json"
            coverage_path.write_text(
                json.dumps(coverage, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
            )
            print(f"word-master candidates: {coverage['candidate_count']:,}")
            print(f"matched: {coverage['matched_count']:,}")
            print(f"coverage: {coverage['coverage_ratio']:.2%}")
    except Exception as error:
        print(f"Sudachi synonym preparation failed: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

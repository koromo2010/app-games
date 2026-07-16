#!/usr/bin/env python3
"""Download, verify, extract, and inspect the pinned Japanese WordNet database."""

from __future__ import annotations

import argparse
import gzip
import hashlib
import json
import os
import shutil
import sqlite3
import sys
import unicodedata
import urllib.request
from contextlib import closing
from pathlib import Path
from typing import Any, Iterable

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_MANIFEST = ROOT / "config" / "word-sources" / "japanese-wordnet-1.1.json"
DEFAULT_LOCAL_ROOT = ROOT / ".word-master-local" / "japanese-wordnet"
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
REQUIRED_TABLES = {"word", "sense", "synset", "synlink", "synset_def"}


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
        "release_date",
        "release_url",
        "license",
        "license_url",
        "attribution_url",
        "attribution",
        "asset",
    }
    missing = required - set(manifest)
    if missing:
        raise ValueError(f"manifest is missing: {', '.join(sorted(missing))}")
    asset_required = {
        "url",
        "file_name",
        "decompressed_file_name",
        "sha256",
        "bytes",
        "decompressed_bytes",
    }
    asset_missing = asset_required - set(manifest["asset"])
    if asset_missing:
        raise ValueError(f"manifest asset is missing: {', '.join(sorted(asset_missing))}")
    return manifest


def verify_archive(path: Path, asset: dict[str, Any]) -> None:
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


def download_archive(asset: dict[str, Any], version_dir: Path) -> Path:
    archive_path = version_dir / str(asset["file_name"])
    partial = archive_path.with_suffix(archive_path.suffix + ".part")
    if archive_path.is_file():
        verify_archive(archive_path, asset)
        print(f"verified existing archive: {archive_path.name}")
        return archive_path
    if partial.is_file():
        try:
            verify_archive(partial, asset)
            os.replace(partial, archive_path)
            print(f"verified completed partial archive: {archive_path.name}")
            return archive_path
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
        verify_archive(partial, asset)
    except Exception:
        partial.unlink(missing_ok=True)
        raise
    os.replace(partial, archive_path)
    return archive_path


def extract_database(archive_path: Path, output_path: Path, expected_bytes: int) -> Path:
    if output_path.is_file() and output_path.stat().st_size == expected_bytes:
        return output_path
    temporary = output_path.with_suffix(output_path.suffix + ".part")
    temporary.unlink(missing_ok=True)
    try:
        with gzip.open(archive_path, "rb") as source, temporary.open("wb") as output:
            shutil.copyfileobj(source, output, length=1024 * 1024)
        actual_size = temporary.stat().st_size
        if actual_size != expected_bytes:
            raise ValueError(
                f"extracted size mismatch: expected {expected_bytes}, got {actual_size}"
            )
        os.replace(temporary, output_path)
    except Exception:
        temporary.unlink(missing_ok=True)
        raise
    return output_path


def inspect_database(database_path: Path) -> dict[str, Any]:
    with closing(sqlite3.connect(database_path)) as connection:
        integrity = connection.execute("PRAGMA quick_check").fetchone()[0]
        if integrity != "ok":
            raise ValueError(f"SQLite quick_check failed: {integrity}")
        tables = {
            row[0]
            for row in connection.execute(
                "SELECT name FROM sqlite_master WHERE type = 'table'"
            )
        }
        missing = REQUIRED_TABLES - tables
        if missing:
            raise ValueError(f"WordNet database is missing: {', '.join(sorted(missing))}")
        return {
            "word_count": connection.execute("SELECT COUNT(*) FROM word").fetchone()[0],
            "japanese_word_count": connection.execute(
                "SELECT COUNT(*) FROM word WHERE lang = 'jpn'"
            ).fetchone()[0],
            "sense_count": connection.execute("SELECT COUNT(*) FROM sense").fetchone()[0],
            "japanese_sense_count": connection.execute(
                "SELECT COUNT(*) FROM sense WHERE lang = 'jpn'"
            ).fetchone()[0],
            "synset_count": connection.execute("SELECT COUNT(*) FROM synset").fetchone()[0],
            "japanese_synset_count": connection.execute(
                "SELECT COUNT(DISTINCT synset) FROM sense WHERE lang = 'jpn'"
            ).fetchone()[0],
            "synlink_count": connection.execute("SELECT COUNT(*) FROM synlink").fetchone()[0],
        }


def load_japanese_lemmas(database_path: Path) -> set[str]:
    with closing(sqlite3.connect(database_path)) as connection:
        return {
            normalize(row[0])
            for row in connection.execute("SELECT lemma FROM word WHERE lang = 'jpn'")
        }


def summarize_coverage(
    rows: Iterable[tuple[int, str, str]], lemmas: set[str]
) -> dict[str, Any]:
    total = normalized_matches = surface_matches = 0
    for _, surface, normalized_form in rows:
        total += 1
        if normalize(normalized_form) in lemmas:
            normalized_matches += 1
        elif normalize(surface) in lemmas:
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


def analyze_coverage(database_url: str, database_path: Path) -> dict[str, Any]:
    import psycopg

    lemmas = load_japanese_lemmas(database_path)
    with psycopg.connect(database_url) as connection:
        with connection.cursor() as cursor:
            cursor.execute(CANDIDATE_QUERY)
            return summarize_coverage(cursor, lemmas)


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
        asset = manifest["asset"]
        archive_path = download_archive(asset, version_dir)
        if args.download_only:
            return 0
        database_path = extract_database(
            archive_path,
            version_dir / str(asset["decompressed_file_name"]),
            int(asset["decompressed_bytes"]),
        )
        summary = inspect_database(database_path)
        summary_path = version_dir / "database-summary.json"
        summary_path.write_text(
            json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )
        print(f"Japanese WordNet database: {database_path}")
        print(f"Japanese words: {summary['japanese_word_count']:,}")
        print(f"Japanese senses: {summary['japanese_sense_count']:,}")
        print(f"Japanese concepts: {summary['japanese_synset_count']:,}")
        if args.coverage:
            if not args.database_url:
                raise ValueError("DATABASE_URL or --database-url is required with --coverage")
            coverage = analyze_coverage(args.database_url, database_path)
            coverage_path = version_dir / "word-master-coverage.json"
            coverage_path.write_text(
                json.dumps(coverage, ensure_ascii=False, indent=2) + "\n",
                encoding="utf-8",
            )
            print(f"word-master candidates: {coverage['candidate_count']:,}")
            print(f"matched: {coverage['matched_count']:,}")
            print(f"coverage: {coverage['coverage_ratio']:.2%}")
    except Exception as error:
        print(f"Japanese WordNet preparation failed: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

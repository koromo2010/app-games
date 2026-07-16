#!/usr/bin/env python3
"""Download pinned chiVe vectors and measure word-master coverage locally."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
import tarfile
import unicodedata
import urllib.request
from pathlib import Path
from typing import Any, Iterable, Protocol

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_MANIFEST = ROOT / "config" / "word-sources" / "chive-1.3-mc90.json"
DEFAULT_LOCAL_ROOT = ROOT / ".word-master-local" / "chive"
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


class Vocabulary(Protocol):
    def __contains__(self, key: object) -> bool: ...


def normalize_key(value: str | None) -> str:
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
        "license",
        "license_url",
        "attribution",
        "asset",
    }
    missing = required - set(manifest)
    if missing:
        raise ValueError(f"manifest is missing: {', '.join(sorted(missing))}")
    asset_required = {
        "url",
        "archive_name",
        "sha256",
        "bytes",
        "directory",
        "model_file",
        "vector_file",
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
    archive = version_dir / str(asset["archive_name"])
    partial = archive.with_suffix(archive.suffix + ".part")
    if archive.is_file():
        verify_archive(archive, asset)
        print(f"verified existing archive: {archive.name}")
        return archive
    if partial.is_file():
        try:
            verify_archive(partial, asset)
            os.replace(partial, archive)
            print(f"verified completed partial archive: {archive.name}")
            return archive
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
    os.replace(partial, archive)
    return archive


def extract_model(archive: Path, asset: dict[str, Any], version_dir: Path) -> Path:
    directory = str(asset["directory"])
    expected_files = {
        f"{directory}/LICENSE",
        f"{directory}/README.md",
        f"{directory}/{asset['model_file']}",
        f"{directory}/{asset['vector_file']}",
    }
    model_path = version_dir / directory / str(asset["model_file"])
    vector_path = version_dir / directory / str(asset["vector_file"])
    if model_path.is_file() and vector_path.is_file():
        print(f"verified existing extracted model: {model_path}")
        return model_path

    with tarfile.open(archive, "r:gz") as source:
        members = source.getmembers()
        file_names = {member.name for member in members if member.isfile()}
        if not expected_files.issubset(file_names):
            missing = expected_files - file_names
            raise ValueError(f"chiVe archive is missing expected files: {sorted(missing)}")
        for member in members:
            member_path = Path(member.name)
            if member_path.is_absolute() or ".." in member_path.parts:
                raise ValueError(f"unsafe archive member: {member.name}")
            if member.issym() or member.islnk():
                raise ValueError(f"archive links are not allowed: {member.name}")
            if member.name != directory and member_path.parts[0] != directory:
                raise ValueError(f"unexpected archive member: {member.name}")
        source.extractall(version_dir)
    if not model_path.is_file() or not vector_path.is_file():
        raise ValueError("chiVe extraction did not produce the expected model files")
    print(f"extracted model: {model_path}")
    return model_path


def summarize_coverage(
    rows: Iterable[tuple[int, str, str]], vocabulary: Vocabulary
) -> dict[str, Any]:
    total = 0
    normalized_matches = 0
    surface_matches = 0
    missing_samples: list[dict[str, Any]] = []
    for word_id, surface, normalized_form in rows:
        total += 1
        normalized = normalize_key(normalized_form)
        display = normalize_key(surface)
        if normalized and normalized in vocabulary:
            normalized_matches += 1
        elif display and display in vocabulary:
            surface_matches += 1
        elif len(missing_samples) < 50:
            missing_samples.append(
                {
                    "word_master_id": int(word_id),
                    "surface": surface,
                    "normalized_form": normalized_form,
                }
            )
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
        "missing_samples": missing_samples,
    }


def analyze_coverage(
    database_url: str, model_path: Path, manifest: dict[str, Any], output_path: Path
) -> dict[str, Any]:
    try:
        import psycopg
        from gensim.models import KeyedVectors
    except ImportError as error:
        raise RuntimeError(
            "Install requirements/word-master.txt in .venv-word-master before coverage analysis"
        ) from error

    print(f"loading chiVe model: {model_path}")
    vectors = KeyedVectors.load(str(model_path), mmap="r")
    with psycopg.connect(database_url) as connection:
        with connection.cursor() as cursor:
            cursor.execute(CANDIDATE_QUERY)
            coverage = summarize_coverage(cursor, vectors.key_to_index)
    report = {
        "source_key": manifest["source_key"],
        "version": manifest["version"],
        "license": manifest["license"],
        "model_vocabulary_count": len(vectors.key_to_index),
        **coverage,
    }
    output_path.parent.mkdir(parents=True, exist_ok=True)
    temporary = output_path.with_suffix(output_path.suffix + ".part")
    temporary.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    os.replace(temporary, output_path)
    return report


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", type=Path, default=DEFAULT_MANIFEST)
    parser.add_argument("--local-root", type=Path, default=DEFAULT_LOCAL_ROOT)
    parser.add_argument("--download-only", action="store_true")
    parser.add_argument("--coverage", action="store_true")
    parser.add_argument("--database-url", default=os.getenv("DATABASE_URL"))
    parser.add_argument("--report", type=Path)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    try:
        manifest = load_manifest(args.manifest)
        version_dir = args.local_root / str(manifest["version"])
        version_dir.mkdir(parents=True, exist_ok=True)
        archive = download_archive(manifest["asset"], version_dir)
        if args.download_only:
            return 0
        model_path = extract_model(archive, manifest["asset"], version_dir)
        if args.coverage:
            if not args.database_url:
                raise ValueError("DATABASE_URL or --database-url is required with --coverage")
            report_path = args.report or version_dir / "word-master-coverage.json"
            report = analyze_coverage(args.database_url, model_path, manifest, report_path)
            print(f"coverage report: {report_path}")
            print(f"model vocabulary: {report['model_vocabulary_count']:,}")
            print(f"word-master candidates: {report['candidate_count']:,}")
            print(f"matched: {report['matched_count']:,}")
            print(f"missing: {report['missing_count']:,}")
            print(f"coverage: {report['coverage_ratio']:.2%}")
    except Exception as error:
        print(f"chiVe preparation failed: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

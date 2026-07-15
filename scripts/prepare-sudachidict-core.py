#!/usr/bin/env python3
"""Download and normalize the pinned SudachiDict Core source CSV files."""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import os
import sys
import unicodedata
import urllib.request
import zipfile
from collections import Counter
from pathlib import Path
from typing import Any, Iterable

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_MANIFEST = ROOT / "config" / "word-sources" / "sudachidict-core-20260428.json"
DEFAULT_LOCAL_ROOT = ROOT / ".word-master-local" / "sudachidict"
EXPECTED_COLUMNS = 19
OUTPUT_COLUMNS = (
    "source_entry_id",
    "surface",
    "reading",
    "primary_part_of_speech",
    "normalized_form",
    "part_of_speech_details",
    "proper_noun_status",
    "proper_noun_type",
)
PROPER_TYPE_MAP = {
    "人名": "person",
    "地名": "place",
    "組織名": "organization",
}


def normalize_text(value: str) -> str:
    return unicodedata.normalize("NFKC", value).strip().lower()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def load_manifest(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as stream:
        manifest = json.load(stream)
    required = {"source_key", "display_name", "version", "license", "attribution", "assets"}
    missing = required - set(manifest)
    if missing:
        raise ValueError(f"manifest is missing: {', '.join(sorted(missing))}")
    if not manifest["assets"]:
        raise ValueError("manifest must contain at least one asset")
    return manifest


def download_asset(asset: dict[str, str], version_dir: Path) -> Path:
    archive = version_dir / f"{asset['name']}_lex.zip"
    expected = asset["sha256"].lower()
    if archive.is_file() and sha256_file(archive) == expected:
        print(f"verified existing archive: {archive.name}")
    else:
        partial = archive.with_suffix(archive.suffix + ".part")
        request = urllib.request.Request(asset["url"], headers={"User-Agent": "app-games-word-master/1"})
        print(f"downloading: {asset['url']}")
        with urllib.request.urlopen(request) as response, partial.open("wb") as output:
            while chunk := response.read(1024 * 1024):
                output.write(chunk)
        actual = sha256_file(partial)
        if actual != expected:
            partial.unlink(missing_ok=True)
            raise ValueError(f"SHA-256 mismatch for {archive.name}: expected {expected}, got {actual}")
        os.replace(partial, archive)

    csv_dir = version_dir / asset["name"]
    csv_dir.mkdir(parents=True, exist_ok=True)
    csv_path = csv_dir / asset["csv_name"]
    with zipfile.ZipFile(archive) as source:
        matches = [item for item in source.infolist() if Path(item.filename).name == asset["csv_name"]]
        if len(matches) != 1:
            raise ValueError(f"{archive.name} must contain exactly one {asset['csv_name']}")
        with source.open(matches[0]) as input_stream, csv_path.open("wb") as output:
            while chunk := input_stream.read(1024 * 1024):
                output.write(chunk)
    print(f"extracted: {csv_path}")
    return csv_path


def proper_noun_fields(details: list[str]) -> tuple[str, str]:
    if "固有名詞" not in details:
        return "common", ""
    for detail in details:
        proper_type = PROPER_TYPE_MAP.get(detail)
        if proper_type:
            return "proper", proper_type
    return "proper", "other"


def parse_source_row(row: list[str], source_name: str, line_number: int) -> dict[str, str] | None:
    if len(row) != EXPECTED_COLUMNS:
        raise ValueError(
            f"{source_name}:{line_number}: expected {EXPECTED_COLUMNS} columns, got {len(row)}"
        )

    surface = row[4].strip()
    primary_pos = row[5].strip()
    if not surface or not primary_pos or primary_pos == "*":
        return None

    reading = normalize_text("" if row[11] == "*" else row[11])
    normalized_form = normalize_text(surface if row[12] in {"", "*"} else row[12])
    if not normalized_form:
        return None

    details = [value.strip() for value in row[6:11] if value.strip() not in {"", "*"}]
    proper_status, proper_type = proper_noun_fields(details)
    identity = "\x1f".join((normalized_form, reading, primary_pos)).encode("utf-8")
    digest = hashlib.sha256(identity).digest()

    return {
        "_digest": digest,
        "source_entry_id": "sudachidict-core:" + digest.hex(),
        "surface": surface,
        "reading": reading,
        "primary_part_of_speech": primary_pos,
        "normalized_form": normalized_form,
        "part_of_speech_details": "|".join(details),
        "proper_noun_status": proper_status,
        "proper_noun_type": proper_type,
    }


def normalize_sources(input_paths: Iterable[Path], output_path: Path) -> Counter[str]:
    counts: Counter[str] = Counter()
    seen: set[bytes] = set()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    temporary = output_path.with_suffix(output_path.suffix + ".part")

    try:
        with temporary.open("w", encoding="utf-8", newline="") as output_stream:
            writer = csv.DictWriter(output_stream, fieldnames=OUTPUT_COLUMNS, lineterminator="\n")
            writer.writeheader()
            for input_path in input_paths:
                with input_path.open("r", encoding="utf-8", newline="") as input_stream:
                    reader = csv.reader(input_stream)
                    for line_number, row in enumerate(reader, start=1):
                        counts["input_rows"] += 1
                        parsed = parse_source_row(row, input_path.name, line_number)
                        if parsed is None:
                            counts["skipped_invalid"] += 1
                            continue
                        digest = parsed.pop("_digest")
                        if digest in seen:
                            counts["skipped_duplicate"] += 1
                            continue
                        seen.add(digest)
                        writer.writerow(parsed)
                        counts["output_rows"] += 1
        os.replace(temporary, output_path)
    except Exception:
        temporary.unlink(missing_ok=True)
        raise

    return counts


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", type=Path, default=DEFAULT_MANIFEST)
    parser.add_argument("--local-root", type=Path, default=DEFAULT_LOCAL_ROOT)
    parser.add_argument("--download-only", action="store_true")
    parser.add_argument("--normalize-only", action="store_true")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if args.download_only and args.normalize_only:
        print("--download-only and --normalize-only cannot be combined", file=sys.stderr)
        return 2

    try:
        manifest = load_manifest(args.manifest)
        version_dir = args.local_root / manifest["version"]
        version_dir.mkdir(parents=True, exist_ok=True)
        input_paths = []
        for asset in manifest["assets"]:
            expected_path = version_dir / asset["name"] / asset["csv_name"]
            if args.normalize_only:
                if not expected_path.is_file():
                    raise FileNotFoundError(expected_path)
                input_paths.append(expected_path)
            else:
                input_paths.append(download_asset(asset, version_dir))

        if not args.download_only:
            output_path = version_dir / "sudachidict-core.normalized.csv"
            counts = normalize_sources(input_paths, output_path)
            print(f"normalized CSV: {output_path}")
            for key in sorted(counts):
                print(f"{key}: {counts[key]}")
    except Exception as error:
        print(f"SudachiDict Core preparation failed: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

#!/usr/bin/env python3
"""Filter local Word Wolf pair candidates with the Sudachi synonym index."""

from __future__ import annotations

import argparse
import json
import os
import sys
import unicodedata
from collections import Counter
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_INDEX = (
    ROOT
    / ".word-master-local"
    / "sudachi-synonym"
    / "20260428"
    / "synonym-index.json"
)
DEFAULT_INPUT = (
    ROOT
    / ".word-master-local"
    / "generated"
    / "wordwolf-pair-candidates"
    / "chive-1.3-mc90-sample.json"
)
DEFAULT_OUTPUT = (
    ROOT
    / ".word-master-local"
    / "generated"
    / "wordwolf-pair-candidates"
    / "chive-1.3-mc90-sudachi-filtered.json"
)
FILTER_POLICY_VERSION = "sudachi-synonym-filter-v1"


def normalize(value: str | None) -> str:
    return unicodedata.normalize("NFKC", value or "").strip().lower()


def word_records(word: dict[str, Any], headwords: dict[str, Any]) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    seen: set[tuple[str, str, str]] = set()
    for value in (word.get("normalized_form"), word.get("surface")):
        for record in headwords.get(normalize(value), []):
            identity = (
                str(record.get("group_id", "")),
                str(record.get("lexeme_id", "")),
                str(record.get("headword", "")),
            )
            if identity not in seen:
                seen.add(identity)
                records.append(record)
    return records


def synonym_relation(
    left: dict[str, Any], right: dict[str, Any], headwords: dict[str, Any]
) -> dict[str, Any] | None:
    left_records = word_records(left, headwords)
    right_records = word_records(right, headwords)
    left_by_group: dict[str, list[dict[str, Any]]] = {}
    right_by_group: dict[str, list[dict[str, Any]]] = {}
    for record in left_records:
        left_by_group.setdefault(str(record["group_id"]), []).append(record)
    for record in right_records:
        right_by_group.setdefault(str(record["group_id"]), []).append(record)
    common_groups = sorted(set(left_by_group) & set(right_by_group))
    if not common_groups:
        return None

    relation = "synonym"
    for group_id in common_groups:
        left_lexemes = {str(item.get("lexeme_id", "")) for item in left_by_group[group_id]}
        right_lexemes = {str(item.get("lexeme_id", "")) for item in right_by_group[group_id]}
        if (left_lexemes & right_lexemes) - {""}:
            relation = "same_lexeme"
            break
    return {
        "filter_policy_version": FILTER_POLICY_VERSION,
        "relation": relation,
        "group_ids": common_groups,
    }


def filter_report(report: dict[str, Any], index: dict[str, Any]) -> dict[str, Any]:
    kept: list[dict[str, Any]] = []
    excluded: list[dict[str, Any]] = []
    reasons: Counter[str] = Counter()
    headwords = index.get("headwords", {})
    for pair in report.get("pairs", []):
        relation = synonym_relation(pair["left"], pair["right"], headwords)
        if relation:
            excluded.append({**pair, "synonym_filter": relation})
            reasons[relation["relation"]] += 1
        else:
            kept.append(pair)
    return {
        "filter_policy_version": FILTER_POLICY_VERSION,
        "source_policy_version": report.get("policy_version"),
        "input_pair_count": len(report.get("pairs", [])),
        "kept_pair_count": len(kept),
        "excluded_pair_count": len(excluded),
        "excluded_by_relation": dict(sorted(reasons.items())),
        "kept_pairs": kept,
        "excluded_pairs": excluded,
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--index", type=Path, default=DEFAULT_INDEX)
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    try:
        index = json.loads(args.index.read_text(encoding="utf-8"))
        report = json.loads(args.input.read_text(encoding="utf-8"))
        result = filter_report(report, index)
        args.output.parent.mkdir(parents=True, exist_ok=True)
        temporary = args.output.with_suffix(args.output.suffix + ".part")
        temporary.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        os.replace(temporary, args.output)
        print(f"input pairs: {result['input_pair_count']:,}")
        print(f"kept pairs: {result['kept_pair_count']:,}")
        print(f"excluded pairs: {result['excluded_pair_count']:,}")
        for relation, count in result["excluded_by_relation"].items():
            print(f"excluded {relation}: {count:,}")
        print(f"local report: {args.output}")
    except Exception as error:
        print(f"Sudachi synonym filtering failed: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

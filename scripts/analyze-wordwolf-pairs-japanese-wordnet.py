#!/usr/bin/env python3
"""Annotate local Word Wolf pairs with Japanese WordNet semantic relations."""

from __future__ import annotations

import argparse
import json
import os
import sqlite3
import sys
import unicodedata
from collections import Counter, defaultdict
from contextlib import closing
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DATABASE = (
    ROOT / ".word-master-local" / "japanese-wordnet" / "1.1" / "wnjpn.db"
)
DEFAULT_INPUT = (
    ROOT
    / ".word-master-local"
    / "generated"
    / "wordwolf-pair-candidates"
    / "chive-1.3-mc90-sudachi-filtered.json"
)
DEFAULT_OUTPUT = (
    ROOT
    / ".word-master-local"
    / "generated"
    / "wordwolf-pair-candidates"
    / "chive-1.3-mc90-sudachi-wordnet.json"
)
POLICY_VERSION = "japanese-wordnet-1.1-relation-v1"
EXCLUDED_RELATIONS = {"same_synset", "similar_to", "direct_hypernym"}


def normalize(value: str | None) -> str:
    return unicodedata.normalize("NFKC", value or "").strip().lower()


class WordNetGraph:
    def __init__(
        self,
        lemmas: dict[str, set[str]],
        hypernyms: dict[str, set[str]],
        similar: dict[str, set[str]],
        definitions: dict[str, str] | None = None,
    ) -> None:
        self.lemmas = lemmas
        self.hypernyms = hypernyms
        self.similar = similar
        self.definitions = definitions or {}

    @classmethod
    def from_database(cls, path: Path) -> "WordNetGraph":
        lemmas: dict[str, set[str]] = defaultdict(set)
        hypernyms: dict[str, set[str]] = defaultdict(set)
        similar: dict[str, set[str]] = defaultdict(set)
        definitions: dict[str, str] = {}
        with closing(sqlite3.connect(path)) as connection:
            for lemma, synset in connection.execute(
                """
                SELECT w.lemma, s.synset
                FROM word w
                JOIN sense s ON s.wordid = w.wordid
                WHERE w.lang = 'jpn' AND s.lang = 'jpn'
                """
            ):
                lemmas[normalize(lemma)].add(synset)
            for source, target, link in connection.execute(
                "SELECT synset1, synset2, link FROM synlink WHERE link IN ('hype', 'sim')"
            ):
                if link == "hype":
                    hypernyms[source].add(target)
                else:
                    similar[source].add(target)
            for synset, definition in connection.execute(
                "SELECT synset, def FROM synset_def WHERE lang = 'jpn' ORDER BY sid"
            ):
                definitions.setdefault(synset, definition)
        return cls(dict(lemmas), dict(hypernyms), dict(similar), definitions)

    def synsets_for_word(self, word: dict[str, Any]) -> set[str]:
        result: set[str] = set()
        for value in (word.get("normalized_form"), word.get("surface")):
            result.update(self.lemmas.get(normalize(value), set()))
        return result

    def describe_synsets(self, synsets: set[str]) -> list[dict[str, str]]:
        return [
            {
                "synset": synset,
                **(
                    {"definition": self.definitions[synset]}
                    if synset in self.definitions
                    else {}
                ),
            }
            for synset in sorted(synsets)
        ]

    def relation(self, left: dict[str, Any], right: dict[str, Any]) -> dict[str, Any]:
        left_synsets = self.synsets_for_word(left)
        right_synsets = self.synsets_for_word(right)
        base: dict[str, Any] = {
            "policy_version": POLICY_VERSION,
            "left_matched": bool(left_synsets),
            "right_matched": bool(right_synsets),
        }
        if not left_synsets or not right_synsets:
            return {**base, "relation": "no_match"}

        common = left_synsets & right_synsets
        if common:
            return {
                **base,
                "relation": "same_synset",
                "evidence": self.describe_synsets(common),
            }

        similar_edges = {
            (left_synset, right_synset)
            for left_synset in left_synsets
            for right_synset in right_synsets
            if right_synset in self.similar.get(left_synset, set())
            or left_synset in self.similar.get(right_synset, set())
        }
        if similar_edges:
            return {
                **base,
                "relation": "similar_to",
                "synset_pairs": [list(edge) for edge in sorted(similar_edges)],
            }

        left_is_child = {
            (left_synset, right_synset)
            for left_synset in left_synsets
            for right_synset in right_synsets
            if right_synset in self.hypernyms.get(left_synset, set())
        }
        right_is_child = {
            (right_synset, left_synset)
            for right_synset in right_synsets
            for left_synset in left_synsets
            if left_synset in self.hypernyms.get(right_synset, set())
        }
        if left_is_child or right_is_child:
            directions = []
            if left_is_child:
                directions.append("left_is_hyponym")
            if right_is_child:
                directions.append("right_is_hyponym")
            edges = left_is_child | right_is_child
            return {
                **base,
                "relation": "direct_hypernym",
                "directions": directions,
                "child_parent_synsets": [list(edge) for edge in sorted(edges)],
            }

        left_parents = {
            parent
            for synset in left_synsets
            for parent in self.hypernyms.get(synset, set())
        }
        right_parents = {
            parent
            for synset in right_synsets
            for parent in self.hypernyms.get(synset, set())
        }
        common_parents = left_parents & right_parents
        if common_parents:
            return {
                **base,
                "relation": "sibling",
                "common_hypernyms": self.describe_synsets(common_parents),
            }
        return {**base, "relation": "no_direct_relation"}


def analyze_report(report: dict[str, Any], graph: WordNetGraph) -> dict[str, Any]:
    input_pairs = report.get("kept_pairs", report.get("pairs", []))
    kept: list[dict[str, Any]] = []
    excluded: list[dict[str, Any]] = []
    counts: Counter[str] = Counter()
    for pair in input_pairs:
        relation = graph.relation(pair["left"], pair["right"])
        annotated = {**pair, "wordnet": relation}
        counts[relation["relation"]] += 1
        if relation["relation"] in EXCLUDED_RELATIONS:
            excluded.append(annotated)
        else:
            kept.append(annotated)
    return {
        "policy_version": POLICY_VERSION,
        "source_policy_version": report.get("filter_policy_version")
        or report.get("policy_version"),
        "input_pair_count": len(input_pairs),
        "kept_pair_count": len(kept),
        "excluded_pair_count": len(excluded),
        "relation_counts": dict(sorted(counts.items())),
        "kept_pairs": kept,
        "excluded_pairs": excluded,
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--database", type=Path, default=DEFAULT_DATABASE)
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    try:
        graph = WordNetGraph.from_database(args.database)
        report = json.loads(args.input.read_text(encoding="utf-8"))
        result = analyze_report(report, graph)
        args.output.parent.mkdir(parents=True, exist_ok=True)
        temporary = args.output.with_suffix(args.output.suffix + ".part")
        temporary.write_text(
            json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )
        os.replace(temporary, args.output)
        print(f"input pairs: {result['input_pair_count']:,}")
        print(f"kept pairs: {result['kept_pair_count']:,}")
        print(f"excluded pairs: {result['excluded_pair_count']:,}")
        for relation, count in result["relation_counts"].items():
            print(f"{relation}: {count:,}")
        print(f"local report: {args.output}")
    except Exception as error:
        print(f"Japanese WordNet pair analysis failed: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

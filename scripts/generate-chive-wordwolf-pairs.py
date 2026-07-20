#!/usr/bin/env python3
"""Generate local-only Word Wolf pair candidates from pinned chiVe vectors."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
import unicodedata
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_MODEL = (
    ROOT
    / ".word-master-local"
    / "chive"
    / "1.3-mc90"
    / "chive-1.3-mc90_gensim"
    / "chive-1.3-mc90.kv"
)
DEFAULT_OUTPUT = (
    ROOT
    / ".word-master-local"
    / "generated"
    / "wordwolf-pair-candidates"
    / "chive-1.3-mc90-sample.json"
)
PAIR_POLICY_VERSION = "chive-nearest-neighbor-v1"
CANDIDATE_QUERY = """
SELECT id, surface, normalized_form, reading, primary_part_of_speech,
       COALESCE(zipf_frequency, zipf_fallback) AS effective_zipf
FROM words
WHERE active
  AND form_status <> 'inflected'
  AND NOT is_name_fragment
  AND surface_quality_status = 'clean'
  AND content_safety_status <> 'exclude'
  AND primary_part_of_speech = '名詞'
  AND COALESCE(zipf_frequency, zipf_fallback) >= %s
  AND COALESCE(zipf_frequency, zipf_fallback) < %s
ORDER BY id
"""


@dataclass(frozen=True)
class PairWord:
    word_master_id: int
    surface: str
    normalized_form: str
    reading: str
    part_of_speech: str
    zipf_frequency: float


def normalize(value: str | None) -> str:
    return unicodedata.normalize("NFKC", value or "").strip().lower()


def is_word_like(value: str) -> bool:
    text = normalize(value)
    if len(text) < 2 or len(text) > 12:
        return False
    return all(
        not unicodedata.category(character).startswith(("C", "P", "S", "Z"))
        for character in text
    )


def pair_allowed(
    left: PairWord,
    right: PairWord,
    similarity: float,
    *,
    min_similarity: float,
    max_similarity: float,
    max_zipf_gap: float,
) -> bool:
    if left.word_master_id == right.word_master_id:
        return False
    if not min_similarity <= similarity <= max_similarity:
        return False
    if abs(left.zipf_frequency - right.zipf_frequency) > max_zipf_gap:
        return False
    left_normalized = normalize(left.normalized_form)
    right_normalized = normalize(right.normalized_form)
    if not left_normalized or not right_normalized or left_normalized == right_normalized:
        return False
    if left_normalized in right_normalized or right_normalized in left_normalized:
        return False
    left_reading = normalize(left.reading)
    right_reading = normalize(right.reading)
    if left_reading and left_reading == right_reading:
        return False
    return is_word_like(left.surface) and is_word_like(right.surface)


def load_candidates(database_url: str, min_zipf: float, max_zipf: float) -> list[PairWord]:
    import psycopg

    with psycopg.connect(database_url) as connection:
        with connection.cursor() as cursor:
            cursor.execute(CANDIDATE_QUERY, (min_zipf, max_zipf))
            return [
                PairWord(
                    word_master_id=int(row[0]),
                    surface=str(row[1]),
                    normalized_form=str(row[2]),
                    reading=str(row[3] or ""),
                    part_of_speech=str(row[4]),
                    zipf_frequency=float(row[5]),
                )
                for row in cursor
            ]


def stable_seed_order(word: PairWord) -> bytes:
    value = f"{PAIR_POLICY_VERSION}\x1f{word.word_master_id}\x1f{word.normalized_form}"
    return hashlib.sha256(value.encode("utf-8")).digest()


def generate_pairs(
    words: list[PairWord],
    vectors: Any,
    *,
    limit: int,
    min_similarity: float,
    max_similarity: float,
    max_zipf_gap: float,
) -> tuple[list[dict[str, Any]], int]:
    import numpy as np

    by_key: dict[str, PairWord] = {}
    for word in sorted(words, key=lambda item: (-item.zipf_frequency, item.word_master_id)):
        key = normalize(word.normalized_form)
        if key and key in vectors.key_to_index and key not in by_key:
            by_key[key] = word
    keys = list(by_key)
    if not keys:
        return [], 0

    model_indices = [vectors.key_to_index[key] for key in keys]
    matrix = vectors.get_normed_vectors()[model_indices]
    index_by_key = {key: index for index, key in enumerate(keys)}
    seed_words = sorted(by_key.values(), key=stable_seed_order)
    used_ids: set[int] = set()
    seen_pairs: set[tuple[int, int]] = set()
    pairs: list[dict[str, Any]] = []

    for seed in seed_words:
        if len(pairs) >= limit:
            break
        if seed.word_master_id in used_ids:
            continue
        seed_key = normalize(seed.normalized_form)
        seed_index = index_by_key[seed_key]
        scores = matrix @ matrix[seed_index]
        nearest_count = min(100, len(keys))
        nearest = np.argpartition(scores, -nearest_count)[-nearest_count:]
        nearest = nearest[np.argsort(scores[nearest])[::-1]]
        for candidate_index in nearest:
            candidate = by_key[keys[int(candidate_index)]]
            similarity = float(scores[int(candidate_index)])
            pair_id = tuple(sorted((seed.word_master_id, candidate.word_master_id)))
            if candidate.word_master_id in used_ids or pair_id in seen_pairs:
                continue
            if not pair_allowed(
                seed,
                candidate,
                similarity,
                min_similarity=min_similarity,
                max_similarity=max_similarity,
                max_zipf_gap=max_zipf_gap,
            ):
                continue
            seen_pairs.add(pair_id)
            used_ids.update(pair_id)
            pairs.append(
                {
                    "word_low_id": pair_id[0],
                    "word_high_id": pair_id[1],
                    "left": asdict(seed),
                    "right": asdict(candidate),
                    "similarity": round(similarity, 6),
                    "generation_method": PAIR_POLICY_VERSION,
                    "review_status": "unreviewed",
                }
            )
            break
    return pairs, len(keys)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--database-url", default=os.getenv("DATABASE_URL"))
    parser.add_argument("--model", type=Path, default=DEFAULT_MODEL)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--limit", type=int, default=100)
    parser.add_argument("--min-zipf", type=float, default=3.0)
    parser.add_argument("--max-zipf", type=float, default=8.0)
    parser.add_argument("--min-similarity", type=float, default=0.45)
    parser.add_argument("--max-similarity", type=float, default=0.88)
    parser.add_argument("--max-zipf-gap", type=float, default=0.75)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if not args.database_url:
        print("DATABASE_URL or --database-url is required", file=sys.stderr)
        return 2
    if args.limit < 1 or args.limit > 50_000:
        print("--limit must be between 1 and 50000", file=sys.stderr)
        return 2
    try:
        from gensim.models import KeyedVectors

        words = load_candidates(args.database_url, args.min_zipf, args.max_zipf)
        print(f"loading chiVe model: {args.model}")
        vectors = KeyedVectors.load(str(args.model), mmap="r")
        pairs, matched_vocabulary = generate_pairs(
            words,
            vectors,
            limit=args.limit,
            min_similarity=args.min_similarity,
            max_similarity=args.max_similarity,
            max_zipf_gap=args.max_zipf_gap,
        )
        report = {
            "policy_version": PAIR_POLICY_VERSION,
            "resource": "chiVe 1.3-mc90",
            "license": "Apache-2.0",
            "filters": {
                "min_zipf": args.min_zipf,
                "max_zipf_exclusive": args.max_zipf,
                "min_similarity": args.min_similarity,
                "max_similarity": args.max_similarity,
                "max_zipf_gap": args.max_zipf_gap,
                "part_of_speech": "名詞",
            },
            "database_candidate_count": len(words),
            "matched_vocabulary_count": matched_vocabulary,
            "pair_count": len(pairs),
            "pairs": pairs,
        }
        args.output.parent.mkdir(parents=True, exist_ok=True)
        temporary = args.output.with_suffix(args.output.suffix + ".part")
        temporary.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        os.replace(temporary, args.output)
        print(f"database candidates: {len(words):,}")
        print(f"chiVe matched vocabulary: {matched_vocabulary:,}")
        print(f"generated pairs: {len(pairs):,}")
        print(f"local report: {args.output}")
    except Exception as error:
        print(f"chiVe pair generation failed: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

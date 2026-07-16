from __future__ import annotations

import importlib.util
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPT_PATH = ROOT / "scripts" / "prepare-chive.py"
SPEC = importlib.util.spec_from_file_location("prepare_chive", SCRIPT_PATH)
assert SPEC and SPEC.loader
adapter = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(adapter)

PAIR_SCRIPT_PATH = ROOT / "scripts" / "generate-chive-wordwolf-pairs.py"
PAIR_SPEC = importlib.util.spec_from_file_location("generate_chive_wordwolf_pairs", PAIR_SCRIPT_PATH)
assert PAIR_SPEC and PAIR_SPEC.loader
pairs = importlib.util.module_from_spec(PAIR_SPEC)
sys.modules[PAIR_SPEC.name] = pairs
PAIR_SPEC.loader.exec_module(pairs)


class ChiVeAdapterTest(unittest.TestCase):
    def test_manifest_pins_archive_integrity_and_license(self) -> None:
        manifest_path = ROOT / "config" / "word-sources" / "chive-1.3-mc90.json"
        manifest = adapter.load_manifest(manifest_path)
        self.assertEqual(manifest["version"], "1.3-mc90")
        self.assertEqual(manifest["license"], "Apache-2.0")
        self.assertEqual(len(manifest["asset"]["sha256"]), 64)
        self.assertGreater(manifest["asset"]["bytes"], 400_000_000)

    def test_coverage_prefers_normalized_form_and_falls_back_to_surface(self) -> None:
        rows = [
            (1, "空缶", "空き缶"),
            (2, "徳島", "徳島"),
            (3, "未収録語", "未収録語"),
        ]
        result = adapter.summarize_coverage(rows, {"空き缶": 0, "徳島": 1})
        self.assertEqual(result["candidate_count"], 3)
        self.assertEqual(result["matched_count"], 2)
        self.assertEqual(result["missing_count"], 1)
        self.assertAlmostEqual(result["coverage_ratio"], 2 / 3)
        self.assertEqual(result["missing_samples"][0]["word_master_id"], 3)

    def test_candidate_query_matches_production_catalog_policy(self) -> None:
        self.assertIn("form_status <> 'inflected'", adapter.CANDIDATE_QUERY)
        self.assertIn("NOT is_name_fragment", adapter.CANDIDATE_QUERY)
        self.assertIn("surface_quality_status = 'clean'", adapter.CANDIDATE_QUERY)
        self.assertIn("content_safety_status <> 'exclude'", adapter.CANDIDATE_QUERY)
        self.assertIn("content_safety_status <> 'exclude'", pairs.CANDIDATE_QUERY)

    def test_archive_verification_rejects_size_or_hash_changes(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            archive = Path(directory) / "asset.tar.gz"
            archive.write_bytes(b"fixed-test-data")
            asset = {
                "bytes": archive.stat().st_size,
                "sha256": adapter.sha256_file(archive),
            }
            adapter.verify_archive(archive, asset)
            archive.write_bytes(b"changed")
            with self.assertRaisesRegex(ValueError, "size mismatch"):
                adapter.verify_archive(archive, asset)

    def test_pair_filter_rejects_containment_same_reading_and_large_zipf_gap(self) -> None:
        left = pairs.PairWord(1, "美術館", "美術館", "ビジュツカン", "名詞", 4.2)
        good = pairs.PairWord(2, "水族館", "水族館", "スイゾクカン", "名詞", 4.0)
        contained = pairs.PairWord(3, "国立美術館", "国立美術館", "コクリツビジュツカン", "名詞", 4.0)
        same_reading = pairs.PairWord(4, "びじゅつ館", "びじゅつ館", "ビジュツカン", "名詞", 4.0)
        rare = pairs.PairWord(5, "画院", "画院", "ガイン", "名詞", 2.0)
        options = {"min_similarity": 0.45, "max_similarity": 0.88, "max_zipf_gap": 0.75}
        self.assertTrue(pairs.pair_allowed(left, good, 0.72, **options))
        self.assertFalse(pairs.pair_allowed(left, contained, 0.72, **options))
        self.assertFalse(pairs.pair_allowed(left, same_reading, 0.72, **options))
        self.assertFalse(pairs.pair_allowed(left, rare, 0.72, **options))


if __name__ == "__main__":
    unittest.main()

from __future__ import annotations

import csv
import importlib.util
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPT_PATH = ROOT / "scripts" / "prepare-sudachidict-core.py"
SPEC = importlib.util.spec_from_file_location("prepare_sudachidict_core", SCRIPT_PATH)
assert SPEC and SPEC.loader
adapter = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(adapter)


def source_row(
    surface: str,
    *,
    reading: str,
    normalized: str,
    pos: tuple[str, str, str, str, str, str],
    cost: str = "5000",
) -> list[str]:
    return [
        surface,
        "1",
        "1",
        cost,
        surface,
        *pos,
        reading,
        normalized,
        "*",
        "A",
        "*",
        "*",
        "*",
        "*",
    ]


class SudachiDictAdapterTest(unittest.TestCase):
    def test_normalizes_deduplicates_and_classifies_proper_nouns(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory)
            small = base / "small_lex.csv"
            core = base / "core_lex.csv"
            output = base / "normalized.csv"
            rows = [
                source_row(
                    "コンピューター",
                    reading="コンピューター",
                    normalized="コンピューター",
                    pos=("名詞", "普通名詞", "一般", "*", "*", "*"),
                ),
                source_row(
                    "東京",
                    reading="トウキョウ",
                    normalized="東京",
                    pos=("名詞", "固有名詞", "地名", "一般", "*", "*"),
                ),
            ]
            duplicate = source_row(
                "東京",
                reading="トウキョウ",
                normalized="東京",
                pos=("名詞", "固有名詞", "地名", "一般", "*", "*"),
                cost="9000",
            )
            with small.open("w", encoding="utf-8", newline="") as stream:
                csv.writer(stream).writerows(rows)
            with core.open("w", encoding="utf-8", newline="") as stream:
                csv.writer(stream).writerows([duplicate])

            counts = adapter.normalize_sources([small, core], output)

            self.assertEqual(counts["input_rows"], 3)
            self.assertEqual(counts["output_rows"], 2)
            self.assertEqual(counts["skipped_duplicate"], 1)
            with output.open("r", encoding="utf-8", newline="") as stream:
                normalized = list(csv.DictReader(stream))
            self.assertEqual(normalized[0]["proper_noun_status"], "common")
            self.assertEqual(normalized[1]["proper_noun_status"], "proper")
            self.assertEqual(normalized[1]["proper_noun_type"], "place")
            self.assertTrue(normalized[1]["source_entry_id"].startswith("sudachidict-core:"))

    def test_rejects_an_unexpected_fixed_version_layout(self) -> None:
        malformed = ["value"] * 18
        with self.assertRaisesRegex(ValueError, "expected 19 columns"):
            adapter.parse_source_row(malformed, "small_lex.csv", 1)


if __name__ == "__main__":
    unittest.main()

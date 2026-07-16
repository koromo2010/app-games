from __future__ import annotations

import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def load_script(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


adapter = load_script(
    "prepare_sudachi_synonyms", ROOT / "scripts" / "prepare-sudachi-synonyms.py"
)
pair_filter = load_script(
    "filter_wordwolf_pairs_sudachi_synonyms",
    ROOT / "scripts" / "filter-wordwolf-pairs-sudachi-synonyms.py",
)


class SudachiSynonymAdapterTest(unittest.TestCase):
    def test_coverage_query_excludes_sensitive_words(self) -> None:
        self.assertIn("content_safety_status <> 'exclude'", adapter.CANDIDATE_QUERY)

    def test_manifest_pins_source_integrity_and_license(self) -> None:
        manifest = adapter.load_manifest(
            ROOT / "config" / "word-sources" / "sudachi-synonym-20260428.json"
        )
        self.assertEqual(manifest["version"], "20260428")
        self.assertEqual(manifest["license"], "Apache-2.0 with bundled third-party notices")
        self.assertEqual(len(manifest["asset"]["sha256"]), 64)
        self.assertEqual(manifest["asset"]["columns"], 11)

    def test_build_index_ignores_disabled_history_entries(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "synonyms.txt"
            output = Path(directory) / "index.json"
            source.write_text(
                "000001,1,0,1,0,0,0,(),宛て先,,\n"
                "000001,1,0,1,0,0,2,(),宛先,,\n"
                "000001,1,2,2,0,0,0,(),廃止語,,\n\n",
                encoding="utf-8",
            )
            index = adapter.build_index(source, output)
            self.assertEqual(index["entry_count"], 3)
            self.assertEqual(index["active_entry_count"], 2)
            self.assertEqual(index["disabled_entry_count"], 1)
            self.assertEqual(index["group_count"], 1)
            self.assertNotIn("廃止語", index["headwords"])
            self.assertEqual(json.loads(output.read_text(encoding="utf-8"))["group_count"], 1)

    def test_relation_distinguishes_same_lexeme_from_synonym(self) -> None:
        headwords = {
            "宛て先": [{"group_id": "000001", "lexeme_id": "1", "headword": "宛て先"}],
            "宛先": [{"group_id": "000001", "lexeme_id": "1", "headword": "宛先"}],
            "送り先": [{"group_id": "000001", "lexeme_id": "2", "headword": "送り先"}],
        }
        destination = {"surface": "宛て先", "normalized_form": "宛て先"}
        spelling = {"surface": "宛先", "normalized_form": "宛先"}
        synonym = {"surface": "送り先", "normalized_form": "送り先"}
        self.assertEqual(
            pair_filter.synonym_relation(destination, spelling, headwords)["relation"],
            "same_lexeme",
        )
        self.assertEqual(
            pair_filter.synonym_relation(destination, synonym, headwords)["relation"],
            "synonym",
        )

    def test_filter_report_keeps_unrelated_pairs(self) -> None:
        report = {
            "policy_version": "test",
            "pairs": [
                {
                    "left": {"surface": "何回", "normalized_form": "何回"},
                    "right": {"surface": "何度", "normalized_form": "何度"},
                },
                {
                    "left": {"surface": "ロース", "normalized_form": "ロース"},
                    "right": {"surface": "カルビ", "normalized_form": "カルビ"},
                },
            ],
        }
        index = {
            "headwords": {
                "何回": [{"group_id": "123456", "lexeme_id": "1", "headword": "何回"}],
                "何度": [{"group_id": "123456", "lexeme_id": "2", "headword": "何度"}],
            }
        }
        result = pair_filter.filter_report(report, index)
        self.assertEqual(result["input_pair_count"], 2)
        self.assertEqual(result["excluded_pair_count"], 1)
        self.assertEqual(result["kept_pair_count"], 1)
        self.assertEqual(result["excluded_by_relation"], {"synonym": 1})


if __name__ == "__main__":
    unittest.main()

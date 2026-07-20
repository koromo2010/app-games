from __future__ import annotations

import importlib.util
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPT_PATH = ROOT / "scripts" / "publish-selected-word-pools.py"
SPEC = importlib.util.spec_from_file_location("publish_selected_word_pools", SCRIPT_PATH)
assert SPEC and SPEC.loader
publisher = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = publisher
SPEC.loader.exec_module(publisher)


class PublishSelectedWordPoolsTest(unittest.TestCase):
    def test_four_kanji_filter(self) -> None:
        self.assertTrue(publisher.is_four_kanji("一期一会"))
        self.assertTrue(publisher.is_four_kanji("時々刻々"))
        self.assertFalse(publisher.is_four_kanji("うやむや"))
        self.assertFalse(publisher.is_four_kanji("葛折り"))

    def test_projects_only_compact_catalog_fields(self) -> None:
        self.assertEqual(
            publisher.project_catalog_row((12, "一期一会", "いちごいちえ", 2.96)),
            publisher.CatalogRow(12, "一期一会", "いちごいちえ", 2.96),
        )

    def test_schema_exposes_pool_and_difficulty_flags(self) -> None:
        self.assertIn("shared_word_pool_evaluations", publisher.CREATE_SCHEMA_SQL)
        self.assertIn("pool_key TEXT NOT NULL", publisher.CREATE_SCHEMA_SQL)
        self.assertIn("difficulty_tier TEXT", publisher.CREATE_SCHEMA_SQL)
        self.assertIn("evaluation_flags TEXT[]", publisher.CREATE_SCHEMA_SQL)
        self.assertNotIn("entry_payload", publisher.CREATE_SCHEMA_SQL)

    def test_queries_keep_local_safety_filters(self) -> None:
        for query in (publisher.STANDARD_POOL_QUERY, publisher.YOJI_POOL_QUERY):
            self.assertIn("surface_quality_status = 'clean'", query)
            self.assertIn("content_safety_status <> 'exclude'", query)
            self.assertIn("word.zipf_frequency", query)
            self.assertIn("word.zipf_fallback", query)

    def test_unmeasured_selected_words_use_zero_only_in_production_projection(self) -> None:
        self.assertIn("evaluation.evidence->>'display_zipf'", publisher.STANDARD_POOL_QUERY)
        self.assertIn(
            "COALESCE(word.zipf_frequency, word.zipf_fallback, 0)",
            publisher.YOJI_POOL_QUERY,
        )


if __name__ == "__main__":
    unittest.main()

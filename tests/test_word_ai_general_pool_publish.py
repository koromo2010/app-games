from __future__ import annotations

import importlib.util
import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SCRIPT_PATH = ROOT / "scripts" / "publish-ai-general-word-pool.py"
SPEC = importlib.util.spec_from_file_location(
    "publish_ai_general_word_pool",
    SCRIPT_PATH,
)
assert SPEC and SPEC.loader
publisher = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = publisher
SPEC.loader.exec_module(publisher)


class PublishAiGeneralWordPoolTest(unittest.TestCase):
    def test_preserves_measured_zipf(self) -> None:
        row = publisher.project_ai_general_row(
            (100, "図書館", "トショカン", 5.25, "normal")
        )
        self.assertEqual(row.zipf_frequency, 5.25)
        self.assertIn("zipf_measured", row.evaluation_flags)
        self.assertEqual(row.difficulty_tier, "normal")

    def test_projects_missing_zipf_from_reviewed_difficulty(self) -> None:
        row = publisher.project_ai_general_row(
            (101, "同相写像", "どうそうしゃぞう", None, "hard")
        )
        self.assertEqual(row.zipf_frequency, 4.0)
        self.assertIn("zipf_projected", row.evaluation_flags)
        self.assertIn("difficulty_hard", row.evaluation_flags)

    def test_rejects_unknown_difficulty(self) -> None:
        with self.assertRaises(ValueError):
            publisher.project_ai_general_row(
                (102, "語", "ご", None, "extreme")
            )

    def test_query_requires_completed_reviews_and_safe_master_row(self) -> None:
        query = publisher.AI_GENERAL_POOL_QUERY
        self.assertIn("candidate.review_status = 'promoted'", query)
        self.assertIn("candidate.quality_status = 'approved'", query)
        self.assertIn("candidate.content_safety_status = 'clean'", query)
        self.assertIn("NOT word.is_name_fragment", query)
        self.assertIn("word.surface_quality_status = 'clean'", query)
        self.assertIn(
            "word.content_safety_status NOT IN ('review', 'exclude')",
            query,
        )

    def test_pool_schema_uses_permanent_master_id(self) -> None:
        schema = publisher.CREATE_POOL_SCHEMA_SQL
        self.assertIn("REFERENCES shared_word_catalog(word_master_id)", schema)
        self.assertIn("PRIMARY KEY (word_master_id, pool_key)", schema)


if __name__ == "__main__":
    unittest.main()

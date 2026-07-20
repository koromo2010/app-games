from __future__ import annotations

import importlib.util
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPT_PATH = ROOT / "scripts" / "upload-shared-word-catalog.py"
SPEC = importlib.util.spec_from_file_location("upload_shared_word_catalog", SCRIPT_PATH)
assert SPEC and SPEC.loader
catalog = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(catalog)


class UploadSharedWordCatalogTest(unittest.TestCase):
    def test_projects_only_game_facing_fields(self) -> None:
        self.assertEqual(
            catalog.project_catalog_row((215501, "吟声", "ギンセイ", 0)),
            (215501, "吟声", "ギンセイ", 0.0),
        )

    def test_missing_reading_becomes_empty_text(self) -> None:
        self.assertEqual(
            catalog.project_catalog_row((7, "例", None, 3.5)),
            (7, "例", "", 3.5),
        )

    def test_candidate_query_applies_local_quality_filters(self) -> None:
        self.assertIn("COALESCE(zipf_frequency, zipf_fallback)", catalog.CANDIDATE_QUERY)
        self.assertIn("IS NOT NULL", catalog.CANDIDATE_QUERY)
        self.assertIn("form_status <> 'inflected'", catalog.CANDIDATE_QUERY)
        self.assertIn("NOT is_name_fragment", catalog.CANDIDATE_QUERY)
        self.assertIn("surface_quality_status = 'clean'", catalog.CANDIDATE_QUERY)
        self.assertIn("content_safety_status <> 'exclude'", catalog.CANDIDATE_QUERY)

    def test_target_catalog_uses_immutable_master_id(self) -> None:
        self.assertIn("word_master_id BIGINT PRIMARY KEY", catalog.CREATE_SCHEMA_SQL)
        self.assertIn("prevent_shared_word_catalog_delete", catalog.CREATE_SCHEMA_SQL)
        self.assertIn("shared_word_game_evaluations", catalog.CREATE_SCHEMA_SQL)
        self.assertIn("shared_wordwolf_pairs", catalog.CREATE_SCHEMA_SQL)
        self.assertIn("partner_word_master_id BIGINT", catalog.CREATE_SCHEMA_SQL)
        self.assertIn("last_seen_sync_id TEXT NOT NULL", catalog.CREATE_SCHEMA_SQL)
        self.assertNotIn("normalized_form", catalog.CREATE_SCHEMA_SQL)


if __name__ == "__main__":
    unittest.main()

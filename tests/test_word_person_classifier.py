from __future__ import annotations

import importlib.util
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPT_PATH = ROOT / "scripts" / "word_person_classifier.py"
SPEC = importlib.util.spec_from_file_location("word_person_classifier", SCRIPT_PATH)
assert SPEC and SPEC.loader
classifier = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(classifier)


class WordPersonClassifierTest(unittest.TestCase):
    def test_non_person_is_not_excluded(self) -> None:
        status, excluded, version = classifier.classify_person_name(
            "common", None, ["一般"]
        )
        self.assertEqual(status, "not_person")
        self.assertFalse(excluded)
        self.assertEqual(version, classifier.PERSON_NAME_POLICY_VERSION)

    def test_surname_only_is_excluded(self) -> None:
        status, excluded, _ = classifier.classify_person_name(
            "proper", "person", ["姓"]
        )
        self.assertEqual(status, "surname_only")
        self.assertTrue(excluded)

    def test_given_name_only_is_excluded(self) -> None:
        status, excluded, _ = classifier.classify_person_name(
            "proper", "person", ["名"]
        )
        self.assertEqual(status, "given_name_only")
        self.assertTrue(excluded)

    def test_general_person_is_kept_for_notability_matching(self) -> None:
        status, excluded, _ = classifier.classify_person_name(
            "proper", "person", ["一般"]
        )
        self.assertEqual(status, "general_person")
        self.assertFalse(excluded)

    def test_unknown_person_metadata_is_kept_for_review(self) -> None:
        status, excluded, _ = classifier.classify_person_name(
            "proper", "person", ["未知"]
        )
        self.assertEqual(status, "unknown")
        self.assertFalse(excluded)

    def test_ambiguous_surname_and_given_name_is_kept_for_review(self) -> None:
        status, excluded, _ = classifier.classify_person_name(
            "proper", "person", ["姓", "名"]
        )
        self.assertEqual(status, "unknown")
        self.assertFalse(excluded)


if __name__ == "__main__":
    unittest.main()

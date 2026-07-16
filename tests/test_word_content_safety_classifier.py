from __future__ import annotations

import importlib.util
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPT_PATH = ROOT / "scripts" / "word_content_safety_classifier.py"
SPEC = importlib.util.spec_from_file_location("word_content_safety_classifier", SCRIPT_PATH)
assert SPEC and SPEC.loader
classifier = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(classifier)


class WordContentSafetyClassifierTest(unittest.TestCase):
    def test_excludes_known_standalone_identity_slur(self) -> None:
        status, flags, version = classifier.classify_content_safety("ホモ")
        self.assertEqual(status, "exclude")
        self.assertEqual(flags, ["identity_slur"])
        self.assertEqual(version, classifier.CONTENT_SAFETY_POLICY_VERSION)

    def test_normalizes_width_and_whitespace(self) -> None:
        status, flags, _ = classifier.classify_content_safety("  セックス  ")
        self.assertEqual(status, "exclude")
        self.assertEqual(flags, ["sexual_explicit"])

    def test_does_not_use_unsafe_substring_matching(self) -> None:
        status, flags, _ = classifier.classify_content_safety("ホモ・サピエンス")
        self.assertEqual(status, "unreviewed")
        self.assertEqual(flags, [])

    def test_checks_dictionary_normalized_form(self) -> None:
        status, flags, _ = classifier.classify_content_safety("別表記", "レイプ")
        self.assertEqual(status, "exclude")
        self.assertEqual(flags, ["sexual_violence"])

    def test_ordinary_word_stays_unreviewed_for_llm_decision(self) -> None:
        status, flags, _ = classifier.classify_content_safety("タイトル")
        self.assertEqual(status, "unreviewed")
        self.assertEqual(flags, [])


if __name__ == "__main__":
    unittest.main()

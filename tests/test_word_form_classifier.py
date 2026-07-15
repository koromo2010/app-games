from __future__ import annotations

import importlib.util
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPT_PATH = ROOT / "scripts" / "word_form_classifier.py"
SPEC = importlib.util.spec_from_file_location("word_form_classifier", SCRIPT_PATH)
assert SPEC and SPEC.loader
classifier = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(classifier)


class WordFormClassifierTest(unittest.TestCase):
    def test_marks_terminal_verb_as_dictionary_form(self) -> None:
        status, reason, version = classifier.classify_word_form(
            "動詞",
            ["一般", "五段-ラ行", "終止形-一般"],
        )
        self.assertEqual(status, "dictionary")
        self.assertEqual(reason, "terminal:終止形-一般")
        self.assertEqual(version, classifier.FORM_POLICY_VERSION)

    def test_marks_non_terminal_verb_as_inflected(self) -> None:
        status, reason, _ = classifier.classify_word_form(
            "動詞",
            ["一般", "五段-ラ行", "連用形-促音便"],
        )
        self.assertEqual(status, "inflected")
        self.assertEqual(reason, "non-terminal:連用形-促音便")

    def test_keeps_literary_terminal_adjective(self) -> None:
        status, reason, _ = classifier.classify_word_form(
            "形容詞",
            ["一般", "文語形容詞-シク", "終止形-一般"],
        )
        self.assertEqual(status, "dictionary")
        self.assertEqual(reason, "terminal:終止形-一般")

    def test_marks_noun_as_non_inflecting(self) -> None:
        status, reason, _ = classifier.classify_word_form(
            "名詞",
            ["普通名詞", "一般"],
        )
        self.assertEqual(status, "non_inflecting")
        self.assertEqual(reason, "non-inflecting-pos:名詞")

    def test_marks_missing_inflection_metadata_as_unknown(self) -> None:
        status, reason, _ = classifier.classify_word_form("動詞", [])
        self.assertEqual(status, "unknown")
        self.assertEqual(reason, "missing-conjugation-form")


if __name__ == "__main__":
    unittest.main()

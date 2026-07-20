from __future__ import annotations

import importlib.util
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPT_PATH = ROOT / "scripts" / "word_zipf.py"
SPEC = importlib.util.spec_from_file_location("word_zipf", SCRIPT_PATH)
assert SPEC and SPEC.loader
word_zipf = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(word_zipf)


class WordZipfTest(unittest.TestCase):
    def test_keeps_a_whole_token_measurement(self) -> None:
        value = word_zipf.measured_zipf("一刀両断")
        self.assertIsNotNone(value)
        self.assertGreater(value, 0)

    def test_rejects_a_score_built_from_split_tokens(self) -> None:
        self.assertIsNone(word_zipf.measured_zipf("一切皆空"))
        self.assertEqual(word_zipf.measure_zipf("一切皆空")[1], "split")

    def test_rejects_an_unseen_whole_token(self) -> None:
        self.assertIsNone(word_zipf.measured_zipf("一倡三歎"))
        self.assertEqual(word_zipf.measure_zipf("一倡三歎")[1], "unseen")

    def test_effective_zipf_prefers_measured_value(self) -> None:
        self.assertEqual(word_zipf.effective_zipf(3.2, 2.9), 3.2)
        self.assertEqual(word_zipf.effective_zipf(None, 2.9), 2.9)
        self.assertIsNone(word_zipf.effective_zipf(None, None))


if __name__ == "__main__":
    unittest.main()

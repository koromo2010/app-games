from __future__ import annotations

import importlib.util
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = ROOT / "scripts"
sys.path.insert(0, str(SCRIPTS))
SCRIPT_PATH = SCRIPTS / "import-word-master.py"
SPEC = importlib.util.spec_from_file_location("import_word_master", SCRIPT_PATH)
assert SPEC and SPEC.loader
importer = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(importer)


def row(surface: str) -> dict[str, str]:
    return {
        "source_entry_id": f"test:{surface}",
        "surface": surface,
        "reading": "テスト",
        "primary_part_of_speech": "名詞",
        "proper_noun_status": "common",
    }


class WordMasterImporterTest(unittest.TestCase):
    def test_split_surface_uses_the_configured_fallback(self) -> None:
        parsed = importer.parse_row(row("一切皆空"), 2, 2.9)
        assert parsed is not None
        self.assertIsNone(parsed["zipf_frequency"])
        self.assertEqual(parsed["zipf_fallback"], 2.9)

    def test_whole_token_measurement_does_not_keep_a_fallback(self) -> None:
        parsed = importer.parse_row(row("一刀両断"), 2, 2.9)
        assert parsed is not None
        self.assertGreater(parsed["zipf_frequency"], 0)
        self.assertIsNone(parsed["zipf_fallback"])


if __name__ == "__main__":
    unittest.main()

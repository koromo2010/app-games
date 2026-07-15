from __future__ import annotations

import importlib.util
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPT_PATH = ROOT / "scripts" / "word_surface_quality_classifier.py"
SPEC = importlib.util.spec_from_file_location("word_surface_quality_classifier", SCRIPT_PATH)
assert SPEC and SPEC.loader
classifier = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(classifier)


def classify(
    surface: str,
    pos: str = "名詞",
    proper_status: str = "common",
    proper_type: str | None = None,
) -> tuple[str, list[str], str]:
    return classifier.classify_surface_quality(surface, pos, proper_status, proper_type)


class WordSurfaceQualityClassifierTest(unittest.TestCase):
    def test_excludes_misclassified_station_name(self) -> None:
        status, flags, version = classify("湯谷石子駅", proper_status="proper", proper_type="other")
        self.assertEqual(status, "exclude")
        self.assertIn("facility_name", flags)
        self.assertEqual(version, classifier.SURFACE_QUALITY_POLICY_VERSION)

    def test_excludes_university_but_not_generic_university_word(self) -> None:
        self.assertIn(
            "facility_name",
            classify("星槎道都大学", proper_status="proper", proper_type="other")[1],
        )
        self.assertEqual(classify("大学", proper_status="common")[0], "clean")

    def test_excludes_place_and_organization_types(self) -> None:
        self.assertIn("place_name", classify("架空町", "名詞", "proper", "place")[1])
        self.assertIn(
            "organization_name",
            classify("架空機構", "名詞", "proper", "organization")[1],
        )

    def test_excludes_non_person_enumeration(self) -> None:
        self.assertIn("enumeration", classify("篆・隷・楷・行・草書")[1])

    def test_keeps_person_full_name_with_separators(self) -> None:
        self.assertEqual(
            classify("モハマド・ユヌス", proper_status="proper", proper_type="person")[0],
            "clean",
        )

    def test_excludes_single_character_repetition(self) -> None:
        self.assertIn("repeated_noise", classify("さささささ", "副詞")[1])

    def test_keeps_ordinary_reduplicated_mimetic_word(self) -> None:
        self.assertEqual(classify("ぽたりぽたり", "副詞")[0], "clean")

    def test_excludes_long_non_interjection_ending_in_small_tsu(self) -> None:
        self.assertIn("truncated_ending", classify("よろよろよろっ", "副詞")[1])
        self.assertNotIn("truncated_ending", classify("わっ", "感動詞")[1])

    def test_excludes_latin_script_and_emoticon_symbols(self) -> None:
        self.assertIn("latin_script", classify("TEST")[1])
        self.assertIn("emoticon_symbols", classify("しょぼーん(´・ω・`)")[1])


if __name__ == "__main__":
    unittest.main()

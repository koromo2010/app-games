from __future__ import annotations

import importlib.util
import unittest
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPT_PATH = ROOT / "scripts" / "import-jmdict-all.py"
SPEC = importlib.util.spec_from_file_location("import_jmdict_all", SCRIPT_PATH)
assert SPEC and SPEC.loader
importer = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(importer)


class JmdictAllImportTest(unittest.TestCase):
    def test_kanji_spellings_link_only_to_compatible_readings(self) -> None:
        entry = ET.fromstring(
            """
            <entry>
              <ent_seq>123</ent_seq>
              <k_ele><keb>一視同仁</keb><ke_pri>ichi1</ke_pri></k_ele>
              <k_ele><keb>一視同人</keb></k_ele>
              <r_ele><reb>いっしどうじん</reb></r_ele>
              <r_ele><reb>いちしどうじん</reb><re_restr>一視同人</re_restr></r_ele>
              <sense><pos>noun (common) (futsuumeishi)</pos></sense>
            </entry>
            """
        )
        rows = importer.entry_form_rows(entry)
        pairs = {(row[1], row[3]) for row in rows}
        self.assertEqual(
            pairs,
            {
                ("一視同仁", "いっしどうじん"),
                ("一視同人", "いっしどうじん"),
                ("一視同人", "いちしどうじん"),
            },
        )
        self.assertLess(rows[0][8], rows[-1][8])

    def test_kana_only_entry_becomes_a_surface(self) -> None:
        entry = ET.fromstring(
            """
            <entry>
              <ent_seq>456</ent_seq>
              <r_ele><reb>あいさつ</reb><re_nokanji /></r_ele>
              <sense><pos>noun (common) (futsuumeishi)</pos></sense>
            </entry>
            """
        )
        rows = importer.entry_form_rows(entry)
        self.assertEqual(rows[0][1:4], ("あいさつ", "あいさつ", "あいさつ"))

    def test_surface_id_is_stable_after_nfkc_normalization(self) -> None:
        normalized = importer.normalize_surface("ＡＢＣ")
        self.assertEqual(normalized, "abc")
        self.assertEqual(
            importer.stable_surface_entry_id(normalized),
            importer.stable_surface_entry_id("abc"),
        )

    def test_part_of_speech_mapping_prefers_lexical_category(self) -> None:
        self.assertEqual(importer.map_primary_part_of_speech(["Ichidan verb"]), "動詞")
        self.assertEqual(importer.map_primary_part_of_speech(["adverb (fukushi)"]), "副詞")
        self.assertEqual(importer.map_primary_part_of_speech([]), "名詞")


if __name__ == "__main__":
    unittest.main()

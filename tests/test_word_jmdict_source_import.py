from __future__ import annotations

import importlib.util
import unittest
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPT_PATH = ROOT / "scripts" / "import-jmdict-source.py"
SPEC = importlib.util.spec_from_file_location("import_jmdict_source", SCRIPT_PATH)
assert SPEC and SPEC.loader
importer = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(importer)


def sample_entry() -> ET.Element:
    return ET.fromstring(
        """
        <entry>
          <ent_seq>123</ent_seq>
          <k_ele>
            <keb>一切皆空</keb>
            <ke_inf>rarely-used kanji form</ke_inf>
            <ke_pri>news1</ke_pri>
          </k_ele>
          <k_ele><keb>切磋琢磨</keb></k_ele>
          <r_ele>
            <reb>いっさいかいくう</reb>
            <re_restr>一切皆空</re_restr>
            <re_pri>ichi1</re_pri>
          </r_ele>
          <sense>
            <pos>noun</pos>
            <misc>yojijukugo</misc>
            <xref>色即是空</xref>
            <gloss xml:lang="eng">all is vanity</gloss>
            <gloss xml:lang="eng" g_type="lit">all is emptiness</gloss>
            <future_field code="kept">future value</future_field>
          </sense>
        </entry>
        """
    )


class JmdictSourceImportTest(unittest.TestCase):
    def test_payload_preserves_repeated_fields_attributes_and_unknown_tags(self) -> None:
        payload = importer.entry_payload(sample_entry())
        self.assertEqual(payload["ent_seq"], ["123"])
        self.assertEqual(len(payload["k_ele"]), 2)
        self.assertEqual(payload["k_ele"][0]["ke_pri"], ["news1"])
        glosses = payload["sense"][0]["gloss"]
        self.assertEqual(glosses[0]["@attributes"]["xml:lang"], "eng")
        self.assertEqual(glosses[1]["@attributes"]["g_type"], "lit")
        self.assertEqual(
            payload["sense"][0]["future_field"][0],
            {"@attributes": {"code": "kept"}, "#text": "future value"},
        )

    def test_links_respect_reading_restrictions(self) -> None:
        self.assertEqual(
            importer.entry_links(sample_entry()),
            {("一切皆空", "いっさいかいくう")},
        )

    def test_yojijukugo_marker_is_required(self) -> None:
        entry = sample_entry()
        self.assertTrue(importer.is_yojijukugo(entry))
        entry.find("./sense/misc").text = "archaism"
        self.assertFalse(importer.is_yojijukugo(entry))


if __name__ == "__main__":
    unittest.main()

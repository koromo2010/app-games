from __future__ import annotations

import importlib.util
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPT_PATH = ROOT / "scripts" / "enrich-wikidata-person-names.py"
SPEC = importlib.util.spec_from_file_location("wikidata_person_enricher", SCRIPT_PATH)
assert SPEC and SPEC.loader
enricher = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = enricher
SPEC.loader.exec_module(enricher)


class WikidataPersonEnricherTest(unittest.TestCase):
    def test_sparql_literal_escapes_quotes(self) -> None:
        self.assertEqual(enricher.sparql_literal('A"B'), '"A\\"B"@ja')

    def test_role_bindings_distinguish_family_and_given_names(self) -> None:
        bindings = [
            {
                "input": {"value": "ルノワール"},
                "kind": {"value": "http://www.wikidata.org/entity/Q101352"},
            },
            {
                "input": {"value": "ピエトロ"},
                "kind": {"value": "http://www.wikidata.org/entity/Q12308941"},
            },
        ]
        roles = enricher.parse_role_bindings(bindings)
        self.assertEqual(roles["ルノワール"], {"surname"})
        self.assertEqual(roles["ピエトロ"], {"given_name"})

    def test_human_bindings_are_deduplicated_and_ranked(self) -> None:
        bindings = [
            {
                "input": {"value": "ルノワール"},
                "person": {"value": "http://www.wikidata.org/entity/Q50713"},
                "personLabel": {"value": "ジャン・ルノワール"},
                "description": {"value": "フランスの映画監督"},
                "article": {"value": "https://ja.wikipedia.org/wiki/test2"},
                "sitelinks": {"value": "70"},
            },
            {
                "input": {"value": "ルノワール"},
                "person": {"value": "http://www.wikidata.org/entity/Q39931"},
                "personLabel": {"value": "ピエール＝オーギュスト・ルノワール"},
                "description": {"value": "フランスの画家"},
                "article": {"value": "https://ja.wikipedia.org/wiki/test1"},
                "sitelinks": {"value": "114"},
            },
        ]
        humans = enricher.parse_human_bindings(bindings)["ルノワール"]
        self.assertEqual([human.qid for human in humans], ["Q39931", "Q50713"])

    def test_status_for_ambiguous_name_role(self) -> None:
        self.assertEqual(
            enricher.status_for_roles({"surname", "given_name"}),
            ("name_only", "name_fragment"),
        )

    def test_guess_reading_removes_name_separators(self) -> None:
        self.assertEqual(
            enricher.guess_reading("ピエール＝オーギュスト・ルノワール"),
            "ピエールオーギュストルノワール",
        )

    def test_foreign_candidate_rejects_full_name(self) -> None:
        self.assertTrue(enricher.looks_like_foreign_candidate("ルノワール"))
        self.assertFalse(enricher.looks_like_foreign_candidate("ジャン・ルノワール"))
        self.assertFalse(enricher.looks_like_foreign_candidate("夏目"))
        self.assertFalse(enricher.looks_like_foreign_candidate("Matt"))

    def test_infers_final_component_as_surname(self) -> None:
        human = enricher.HumanMatch(
            qid="Q5879",
            canonical_name="ヨハン・ヴォルフガング・フォン・ゲーテ",
            description="",
            wikipedia_url="",
            sitelink_count=1,
        )
        self.assertEqual(enricher.infer_roles_from_humans("ゲーテ", [human]), {"surname"})

    def test_keeps_nonfinal_component_role_generic(self) -> None:
        human = enricher.HumanMatch(
            qid="Q5598",
            canonical_name="レンブラント・ファン・レイン",
            description="",
            wikipedia_url="",
            sitelink_count=1,
        )
        self.assertEqual(enricher.infer_roles_from_humans("レンブラント", [human]), {"name_fragment"})

    def test_rejects_alias_that_is_not_a_canonical_name_component(self) -> None:
        human = enricher.HumanMatch(
            qid="Q123",
            canonical_name="とにかく明るい安村",
            description="",
            wikipedia_url="",
            sitelink_count=1,
        )
        self.assertFalse(enricher.human_expands_surface("トニー", human))
        self.assertEqual(enricher.infer_roles_from_humans("トニー", [human]), set())

    def test_queries_use_exact_labels_and_human_items(self) -> None:
        role_query = enricher.build_role_query(["ルノワール"])
        human_query = enricher.build_human_query(["ルノワール"])
        self.assertIn("Q101352", role_query)
        self.assertIn("Q5", human_query)
        self.assertIn("https://ja.wikipedia.org/", human_query)


if __name__ == "__main__":
    unittest.main()

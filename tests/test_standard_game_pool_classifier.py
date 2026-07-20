from __future__ import annotations

import importlib.util
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPT_PATH = ROOT / "scripts" / "classify-standard-game-pool.py"
SPEC = importlib.util.spec_from_file_location("classify_standard_game_pool", SCRIPT_PATH)
assert SPEC and SPEC.loader
classifier = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = classifier
SPEC.loader.exec_module(classifier)


class StandardGamePoolClassifierTest(unittest.TestCase):
    @staticmethod
    def sense(
        categories: frozenset[str] = frozenset({"physical_object"}),
        blocked: frozenset[str] = frozenset(),
        *,
        depth: int | None = 7,
        descendants: int = 0,
        person: bool = False,
        relational_location: bool = False,
    ) -> object:
        return classifier.WordNetSenseEvidence(
            categories=categories,
            blocked_themes=blocked,
            depth=depth,
            descendant_count=descendants,
            is_person=person,
            is_relational_location=relational_location,
        )

    def classify(
        self,
        surface: str,
        *,
        pos: tuple[str, ...] = ("noun (common) (futsuumeishi)",),
        senses: tuple[object, ...] | None = None,
        address_misc: tuple[str, ...] = (),
        blocked_usage_misc: tuple[str, ...] = (),
        priority_entry_count: int = 1,
    ) -> tuple[str, list[str]]:
        if senses is None:
            senses = (self.sense(),)
        return classifier.classify_candidate(
            surface=surface,
            normalized_form=surface,
            jmdict_pos=pos,
            wordnet_senses=senses,
            jmdict_address_misc=address_misc,
            jmdict_blocked_usage_misc=blocked_usage_misc,
            priority_entry_count=priority_entry_count,
        )

    def test_keeps_frequent_unambiguous_physical_noun(self) -> None:
        self.assertEqual(self.classify("りんご"), ("eligible", []))

    def test_does_not_reject_only_for_length_or_zipf(self) -> None:
        self.assertEqual(self.classify("スーパーマーケット"), ("eligible", []))

    def test_selects_more_familiar_display_spelling(self) -> None:
        self.assertEqual(
            classifier.choose_display_surface("きゃべつ", "キャベツ")[0],
            "キャベツ",
        )
        self.assertEqual(
            classifier.choose_display_surface("みかん", "蜜柑")[0],
            "みかん",
        )
        self.assertEqual(
            classifier.choose_display_surface("油画", "油絵")[0],
            "油絵",
        )

    def test_flags_adjectival_nominalization_and_meta_terms(self) -> None:
        self.assertIn("adjectival_nominalization", self.classify("静けさ")[1])
        self.assertIn("deverbal_nominalization", self.classify("持ち出し")[1])
        self.assertIn("deverbal_nominalization", self.classify("冷え")[1])
        self.assertIn("deverbal_nominalization", self.classify("織り")[1])
        self.assertIn("deverbal_nominalization", self.classify("頂き")[1])
        self.assertIn("metalinguistic_term", self.classify("通称")[1])

    def test_excludes_short_kana_surface_but_keeps_three_characters(self) -> None:
        self.assertIn("short_kana_surface", self.classify("イン")[1])
        self.assertIn("short_kana_surface", self.classify("いか")[1])
        self.assertNotIn("short_kana_surface", self.classify("リンゴ")[1])

    def test_excludes_context_dependent_reference(self) -> None:
        self.assertIn("context_dependent_reference", self.classify("自宅")[1])
        self.assertIn("context_dependent_reference", self.classify("現地")[1])
        self.assertIn("context_dependent_reference", self.classify("領空")[1])

    def test_excludes_honorific_reference(self) -> None:
        for surface in ("お客様", "お母様", "お方", "姉さん", "赤ちゃん"):
            with self.subTest(surface=surface):
                self.assertIn("address_or_honorific", self.classify(surface)[1])
        self.assertIn(
            "address_or_honorific",
            self.classify(
                "家内",
                address_misc=("humble (kenjougo) language",),
            )[1],
        )

    def test_excludes_competing_ichi1_entries(self) -> None:
        self.assertIn(
            "ambiguous_surface",
            self.classify("コート", priority_entry_count=2)[1],
        )

    def test_excludes_dated_or_rare_usage(self) -> None:
        self.assertIn(
            "jmdict_misc_dated_term",
            self.classify("養老院", blocked_usage_misc=("dated term",))[1],
        )

    def test_excludes_non_plain_jmdict_noun(self) -> None:
        status, flags = self.classify(
            "転換",
            pos=(
                "noun (common) (futsuumeishi)",
                "noun or participle which takes the aux. verb suru",
            ),
        )
        self.assertEqual(status, "exclude")
        self.assertIn("jmdict_non_plain_noun", flags)

    def test_excludes_missing_abstract_and_mixed_wordnet_senses(self) -> None:
        status, flags = classifier.classify_candidate(
            surface="未知語",
            normalized_form="未知語",
            jmdict_pos=("noun (common) (futsuumeishi)",),
            wordnet_senses=None,
        )
        self.assertEqual(status, "exclude")
        self.assertIn("missing_wordnet_noun", flags)
        self.assertIn(
            "wordnet_no_concrete_sense",
            self.classify(
                "抽象",
                senses=(self.sense(frozenset()),),
            )[1],
        )
        self.assertIn(
            "wordnet_mixed_abstract_senses",
            self.classify(
                "多義語",
                senses=(
                    self.sense(),
                    self.sense(frozenset()),
                ),
            )[1],
        )

    def test_excludes_shallow_category_with_many_descendants(self) -> None:
        flags = self.classify(
            "食物",
            senses=(self.sense(depth=4, descendants=1120),),
        )[1]
        self.assertIn("wordnet_broad_category", flags)
        self.assertNotIn(
            "wordnet_broad_category",
            self.classify(
                "キャベツ",
                senses=(self.sense(depth=9, descendants=2),),
            )[1],
        )

    def test_excludes_person_only_but_keeps_verified_mixed_queen(self) -> None:
        self.assertIn(
            "person_role_or_relation",
            self.classify(
                "詩人",
                senses=(self.sense(person=True),),
            )[1],
        )
        status, flags = self.classify(
            "女王",
            senses=(self.sense(person=True), self.sense()),
        )
        self.assertEqual(status, "eligible")
        self.assertIn("verified_promptable_person", flags)

    def test_excludes_relational_location(self) -> None:
        self.assertIn(
            "relational_location",
            self.classify(
                "最中",
                senses=(self.sense(relational_location=True),),
            )[1],
        )

    def test_excludes_blocked_wordnet_theme_and_jmdict_field(self) -> None:
        status, flags = classifier.classify_candidate(
            surface="戦車",
            normalized_form="戦車",
            jmdict_pos=("noun (common) (futsuumeishi)",),
            jmdict_fields=("military",),
            wordnet_senses=(
                self.sense(
                    blocked=frozenset({"violence_or_weapon"}),
                ),
            ),
        )
        self.assertEqual(status, "exclude")
        self.assertIn("jmdict_field_military", flags)
        self.assertIn("wordnet_theme_violence_or_weapon", flags)

    def test_excludes_curated_heavy_theme_with_reversible_reason(self) -> None:
        status, flags = self.classify("コンドーム")
        self.assertEqual(status, "exclude")
        self.assertIn("curated_adult_theme", flags)
        self.assertIn("curated_violence_or_weapon", self.classify("手錠")[1])
        self.assertIn("curated_death_theme", self.classify("墓地")[1])

    def test_broad_and_format_terms_are_reversible_without_blocking_publications(self) -> None:
        status, flags = self.classify(
            "素材",
            senses=(
                self.sense(frozenset({"matter"})),
                self.sense(frozenset()),
            ),
        )
        self.assertEqual(status, "exclude")
        self.assertIn("wordnet_mixed_abstract_senses", flags)
        self.assertIn("broad_category_term", flags)

        for surface in ("書籍", "生物", "アイテム", "車両", "主体", "食料"):
            with self.subTest(surface=surface):
                status, flags = self.classify(surface)
                self.assertEqual(status, "exclude")
                self.assertIn("broad_category_term", flags)

        self.assertEqual(self.classify("本"), ("eligible", []))
        for surface in ("単行本", "週刊誌"):
            with self.subTest(surface=surface):
                self.assertIn(
                    "format_or_classification_term",
                    self.classify(surface)[1],
                )
        self.assertIn("broad_category_term", self.classify("メディア")[1])
        self.assertIn("broad_category_term", self.classify("ジャーナリズム")[1])
        self.assertIn("uncommon_orthography", self.classify("御飯")[1])
        self.assertIn("relative_direction_or_measure", self.classify("面積")[1])

    def test_requires_exact_ichi1_plain_noun_projection(self) -> None:
        payload = {
            "k_ele": [{"keb": ["単行本"], "ke_pri": ["ichi1", "news1"]}],
            "r_ele": [{"reb": ["たんこうぼん"], "re_pri": ["ichi1"]}],
            "sense": [
                {
                    "pos": ["noun (common) (futsuumeishi)"],
                    "gloss": ["standalone book"],
                }
            ],
        }
        evidence = classifier.jmdict_ichi1_plain_noun_evidence("単行本", payload)
        self.assertIsNotNone(evidence)
        assert evidence is not None
        self.assertEqual(evidence.priorities, frozenset({"ichi1", "news1"}))
        payload["sense"].append(
            {"misc": ["archaic"], "gloss": ["an unrelated old sense"]}
        )
        evidence = classifier.jmdict_ichi1_plain_noun_evidence("単行本", payload)
        assert evidence is not None
        self.assertEqual(evidence.blocked_usage_misc, frozenset())
        self.assertIsNone(
            classifier.jmdict_ichi1_plain_noun_evidence("たんこうぼん", payload)
        )
        payload["sense"][0]["pos"].append(
            "noun or participle which takes the aux. verb suru"
        )
        self.assertIsNone(
            classifier.jmdict_ichi1_plain_noun_evidence("単行本", payload)
        )

    def test_general_pool_difficulty_uses_zipf_and_jmdict_priority(self) -> None:
        self.assertEqual(
            classifier.difficulty_evaluation(4.72, {"ichi1", "gai1"}),
            ("easy", 4.72, ("general_game_pool", "difficulty_easy")),
        )
        self.assertEqual(
            classifier.difficulty_evaluation(3.35, {"ichi1", "gai1"}),
            ("normal", 3.7, ("general_game_pool", "difficulty_normal")),
        )
        self.assertEqual(
            classifier.difficulty_evaluation(0, {"ichi1"}),
            ("hard", 3.2, ("general_game_pool", "difficulty_hard")),
        )
        self.assertEqual(
            classifier.difficulty_evaluation(0, {"ichi1", "news1", "nf10"}),
            ("easy", 4.84, ("general_game_pool", "difficulty_easy")),
        )


if __name__ == "__main__":
    unittest.main()

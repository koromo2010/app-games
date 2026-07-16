from __future__ import annotations

import gzip
import importlib.util
import json
import sqlite3
import tempfile
import unittest
from contextlib import closing
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def load_script(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


adapter = load_script(
    "prepare_japanese_wordnet", ROOT / "scripts" / "prepare-japanese-wordnet.py"
)
analyzer = load_script(
    "analyze_wordwolf_pairs_japanese_wordnet",
    ROOT / "scripts" / "analyze-wordwolf-pairs-japanese-wordnet.py",
)


def word(surface: str) -> dict[str, str]:
    return {"surface": surface, "normalized_form": surface}


class JapaneseWordNetAdapterTest(unittest.TestCase):
    def test_coverage_query_excludes_sensitive_words(self) -> None:
        self.assertIn("content_safety_status <> 'exclude'", adapter.CANDIDATE_QUERY)

    def test_manifest_pins_source_integrity_license_and_attribution(self) -> None:
        manifest = adapter.load_manifest(
            ROOT / "config" / "word-sources" / "japanese-wordnet-1.1.json"
        )
        self.assertEqual(manifest["version"], "1.1")
        self.assertEqual(manifest["asset"]["bytes"], 60390049)
        self.assertEqual(len(manifest["asset"]["sha256"]), 64)
        self.assertIn("Japanese WordNet", manifest["license"])
        self.assertTrue(manifest["attribution_url"].startswith("https://"))

    def test_extract_and_inspect_database(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source_db = root / "source.db"
            with closing(sqlite3.connect(source_db)) as connection:
                connection.executescript(
                    """
                    CREATE TABLE word (wordid integer primary key, lang text, lemma text, pron text, pos text);
                    CREATE TABLE sense (synset text, wordid integer, lang text, rank text, lexid integer, freq integer, src text);
                    CREATE TABLE synset (synset text, pos text, name text, src text);
                    CREATE TABLE synlink (synset1 text, synset2 text, link text, src text);
                    CREATE TABLE synset_def (synset text, lang text, def text, sid text);
                    INSERT INTO word VALUES (1, 'jpn', '犬', NULL, 'n');
                    INSERT INTO sense VALUES ('dog', 1, 'jpn', NULL, NULL, NULL, NULL);
                    INSERT INTO synset VALUES ('dog', 'n', 'dog', NULL);
                    """
                )
                connection.commit()
            archive = root / "source.db.gz"
            with source_db.open("rb") as source, gzip.open(archive, "wb") as output:
                output.write(source.read())
            extracted = root / "extracted.db"
            adapter.extract_database(archive, extracted, source_db.stat().st_size)
            summary = adapter.inspect_database(extracted)
            self.assertEqual(summary["japanese_word_count"], 1)
            self.assertEqual(summary["japanese_sense_count"], 1)
            self.assertEqual(summary["japanese_synset_count"], 1)
            self.assertEqual(summary["synset_count"], 1)

    def test_relation_priority_and_sibling_detection(self) -> None:
        graph = analyzer.WordNetGraph(
            lemmas={
                "同じa": {"same"},
                "同じb": {"same"},
                "子": {"child"},
                "親": {"parent"},
                "兄": {"brother"},
                "弟": {"younger"},
                "近似a": {"similar-a"},
                "近似b": {"similar-b"},
                "無関係": {"other"},
            },
            hypernyms={
                "child": {"parent"},
                "brother": {"family"},
                "younger": {"family"},
            },
            similar={"similar-a": {"similar-b"}},
            definitions={"family": "同じ親概念"},
        )
        self.assertEqual(
            graph.relation(word("同じa"), word("同じb"))["relation"], "same_synset"
        )
        hierarchy = graph.relation(word("子"), word("親"))
        self.assertEqual(hierarchy["relation"], "direct_hypernym")
        self.assertEqual(hierarchy["directions"], ["left_is_hyponym"])
        sibling = graph.relation(word("兄"), word("弟"))
        self.assertEqual(sibling["relation"], "sibling")
        self.assertEqual(sibling["common_hypernyms"][0]["synset"], "family")
        self.assertEqual(
            graph.relation(word("近似a"), word("近似b"))["relation"], "similar_to"
        )
        self.assertEqual(
            graph.relation(word("兄"), word("無関係"))["relation"],
            "no_direct_relation",
        )
        self.assertEqual(graph.relation(word("未登録"), word("弟"))["relation"], "no_match")

    def test_analyze_report_excludes_only_too_close_or_hierarchical_pairs(self) -> None:
        graph = analyzer.WordNetGraph(
            lemmas={"a": {"same"}, "b": {"same"}, "c": {"c"}, "d": {"d"}},
            hypernyms={"c": {"parent"}, "d": {"parent"}},
            similar={},
        )
        result = analyzer.analyze_report(
            {
                "filter_policy_version": "previous",
                "kept_pairs": [
                    {"left": word("a"), "right": word("b")},
                    {"left": word("c"), "right": word("d")},
                ],
            },
            graph,
        )
        self.assertEqual(result["excluded_pair_count"], 1)
        self.assertEqual(result["kept_pair_count"], 1)
        self.assertEqual(result["relation_counts"], {"same_synset": 1, "sibling": 1})
        self.assertEqual(result["kept_pairs"][0]["wordnet"]["relation"], "sibling")


if __name__ == "__main__":
    unittest.main()

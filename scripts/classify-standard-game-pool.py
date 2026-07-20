#!/usr/bin/env python3
"""Build a conservative, reversible standard-game vocabulary evaluation."""

from __future__ import annotations

import argparse
import os
import random
import re
import sqlite3
import unicodedata
from collections import Counter, defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable

import psycopg
from wordfreq import zipf_frequency
from wordfreq.tokens import lossy_tokenize


POOL_KEY = "standard-game"
POLICY_VERSION = "standard-game-ichi1-safe-v3"
DIFFICULTY_POLICY_VERSION = "standard-game-familiarity-v1"
GENERAL_POOL_FLAG = "general_game_pool"
DIFFICULTY_THRESHOLDS = {
    "easy": 4.5,
    "normal": 3.6,
}

WORDNET_ROOTS = {
    "physical_object": "00002684-n",
    "matter": "00020827-n",
    "location": "00027167-n",
}

WORDNET_ENTITY_ROOT = "00001740-n"
WORDNET_PERSON_ROOT = "00007846-n"
WORDNET_RELATIONAL_LOCATION_ROOTS = {
    "08620061-n",  # point/location
    "08621598-n",  # position/location
    "08679972-n",  # direction/location
}
BROAD_MAX_DEPTH = 6
BROAD_MIN_DESCENDANTS = 100

BLOCKED_WORDNET_ROOTS = {
    "violence_or_weapon": {
        "00788973-n",  # battle
        "00801125-n",  # war
        "00953559-n",  # battle
        "00958896-n",  # battle
        "03764276-n",  # military vehicle
        "04565375-n",  # weapon
        "03304730-n",  # explosive
    },
    "gambling": {
        "00430140-n",  # gambling
        "00491713-n",  # casino
        "00507673-n",  # gambling game
        "00459465-n",  # pachinko
    },
    "medical_or_death": {
        "00661091-n",  # therapy
        "01024392-n",  # medical procedure
        "03247620-n",  # drug
        "05217859-n",  # dead body
        "05218119-n",  # cadaver
        "14070360-n",  # disease
    },
    "political_ideology": {
        "05779568-n",  # ideology
        "06212839-n",  # political orientation
    },
}

BLOCKED_JMDICT_FIELDS = {
    "anatomy",
    "chemistry",
    "criminology",
    "dentistry",
    "law",
    "medicine",
    "military",
    "pathology",
    "pharmacology",
    "physiology",
    "politics",
    "psychiatry",
    "psychoanalysis",
}

PLAIN_NOUN_POS = {
    "noun (common) (futsuumeishi)",
}

ADDRESS_MISC = {
    "honorific or respectful (sonkeigo) language",
    "polite (teineigo) language",
    "humble (kenjougo) language",
}

BLOCKED_JMDICT_MISC = {
    "archaic",
    "dated term",
    "historical term",
    "Internet slang",
    "manga slang",
    "obsolete term",
    "poetical term",
    "rare term",
    "slang",
}

METALINGUISTIC_TERMS = {
    "愛称",
    "異称",
    "一般名",
    "学名",
    "旧称",
    "敬称",
    "原題",
    "呼称",
    "俗称",
    "総称",
    "題名",
    "通称",
    "定義",
    "名称",
    "別称",
    "別名",
    "略称",
}

CURATED_THEME_FLAGS: dict[str, tuple[str, ...]] = {
    "愛人": ("curated_adult_theme",),
    "マゾ": ("curated_adult_theme",),
    "コンドーム": ("curated_adult_theme",),
    "ワクチン": ("curated_medical_theme",),
    "病棟": ("curated_medical_theme",),
    "患者": ("curated_medical_theme",),
    "療法": ("curated_medical_theme",),
    "被験者": ("curated_medical_theme",),
    "墓場": ("curated_death_theme",),
    "墓地": ("curated_death_theme",),
    "遺体": ("curated_death_theme",),
    "核ミサイル": ("curated_violence_or_weapon",),
    "戦車": ("curated_violence_or_weapon",),
    "要塞": ("curated_violence_or_weapon",),
    "元帥": ("curated_violence_or_weapon",),
    "兵士": ("curated_violence_or_weapon",),
    "兵隊": ("curated_violence_or_weapon",),
    "軍人": ("curated_violence_or_weapon",),
    "将軍": ("curated_violence_or_weapon",),
    "戦士": ("curated_violence_or_weapon",),
    "武将": ("curated_violence_or_weapon",),
    "騎士": ("curated_violence_or_weapon",),
    "傭兵": ("curated_violence_or_weapon",),
    "トリガー": ("curated_violence_or_weapon",),
    "ブレード": ("curated_violence_or_weapon",),
    "手錠": ("curated_violence_or_weapon",),
    "カジノ": ("curated_gambling",),
    "パチンコ": ("curated_gambling",),
    "テキーラ": ("curated_alcohol_or_drug",),
    "白人": ("curated_discrimination_or_politics",),
    "ファシスト": ("curated_discrimination_or_politics",),
    "いじめ": ("curated_harm_or_illegal",),
    "非合法": ("curated_harm_or_illegal",),
}

CONTEXT_DEPENDENT_TERMS = {
    "自宅",
    "実家",
    "自室",
    "自席",
    "自国",
    "自社",
    "本人",
    "個人",
    "当人",
    "自分",
    "他人",
    "相手",
    "当事者",
    "第三者",
    "現地",
    "地元",
    "当地",
    "各地",
    "地方",
    "地区",
    "地域",
    "現場",
    "職場",
    "本国",
    "本店",
    "本社",
    "支店",
    "支社",
    "上司",
    "部下",
    "内部",
    "外部",
    "上部",
    "下部",
    "中部",
    "中央",
    "周辺",
    "付近",
    "近所",
    "奥",
    "手前",
    "向こう",
    "東部",
    "西部",
    "南部",
    "北部",
    "遠方",
    "近郊",
    "都心",
    "沿岸",
    "緯度",
    "経度",
    "領空",
    "領土",
    "国土",
    "本線",
    "中流",
    "関門",
}

VERIFIED_PROMPTABLE_TERMS = {
    "女王": "person",
}

BROAD_CATEGORY_TERMS = {
    "素材",
    "書籍",
    "生物",
    "物質",
    "要素",
    "構造",
    "パターン",
    "ジャンル",
    "分野",
    "アイテム",
    "カテゴリ",
    "種類",
    "メディア",
    "ジャーナリズム",
    "人間",
    "人類",
    "商品",
    "食品",
    "車両",
    "装備",
    "機械",
    "マシン",
    "建物",
    "土地",
    "主体",
    "貨物",
    "航空機",
    "機体",
    "履物",
    "繊維",
    "家具",
    "食料",
    "調味料",
    "飲料水",
    "図書",
    "著書",
    "材木",
    "船舶",
    "乗り物",
    "人体",
    "身体",
    "肉体",
}

RELATIVE_DIRECTION_OR_MEASURE_TERMS = {
    "東部",
    "西部",
    "南部",
    "北部",
    "面積",
    "体積",
    "容積",
}

FORMAT_OR_CLASSIFICATION_TERMS = {
    "単行本",
    "週刊誌",
    "月刊誌",
    "季刊誌",
    "文庫本",
    "全集",
    "叢書",
    "増刊号",
}

EVALUATIVE_NOUNS = {
    "名作",
    "名著",
}

UNCOMMON_ORTHOGRAPHY_TERMS = {
    "御飯",
}

ADJECTIVAL_NOMINALIZATION = re.compile(r"[一-龯々].*さ$")
DEVERBAL_NOMINALIZATION = re.compile(r"[一-龯々].*[みしえりき]$")
KANA_ONLY_SURFACE = re.compile(r"[ぁ-んァ-ヶー]+")
HONORIFIC_REFERENCE = re.compile(r"(?:.*(?:さん|ちゃん|くん|君|様|殿)|お方)$")


BASE_CANDIDATE_QUERY = """
SELECT
  word.id,
  word.surface,
  word.normalized_form,
  word.reading,
  COALESCE(word.zipf_frequency, word.zipf_fallback) AS effective_zipf,
  word_source.source_key,
  entry.id AS source_entry_row_id,
  entry.entry_payload
FROM words word
JOIN word_sources word_source ON word_source.id = word.source_id
JOIN word_source_entry_links link ON link.word_id = word.id
JOIN word_source_entries entry ON entry.id = link.source_entry_row_id
JOIN word_sources entry_source ON entry_source.id = entry.source_id
WHERE word.active
  AND word.form_status <> 'inflected'
  AND word.surface_quality_status = 'clean'
  AND word.content_safety_status <> 'exclude'
  AND NOT word.is_name_fragment
  AND word.proper_noun_status = 'common'
  AND word.primary_part_of_speech = '名詞'
  AND char_length(word.surface) >= 2
  AND char_length(word.normalized_form) >= 2
  AND word.normalized_form !~ '^[0-9０-９]+$'
  AND entry.active
  AND entry_source.source_key = 'jmdict'
  AND NOT EXISTS (
    SELECT 1
    FROM words linked_word
    JOIN word_source_entry_links sensitive_link
      ON sensitive_link.word_id = linked_word.id
    JOIN word_source_entries sensitive_entry
      ON sensitive_entry.id = sensitive_link.source_entry_row_id
    JOIN word_sources sensitive_source
      ON sensitive_source.id = sensitive_entry.source_id
    CROSS JOIN LATERAL jsonb_array_elements(
      COALESCE(sensitive_entry.entry_payload->'sense', '[]'::jsonb)
    ) sense
    WHERE linked_word.active
      AND linked_word.normalized_form = word.normalized_form
      AND sensitive_entry.active
      AND sensitive_source.source_key = 'jmdict'
      AND COALESCE(sense->'misc', '[]'::jsonb)
        ?| ARRAY['sensitive', 'vulgar expression or word', 'derogatory']
  )
ORDER BY word.id, entry.id
"""


def normalize(value: str) -> str:
    return unicodedata.normalize("NFKC", value).strip().lower()


def choose_display_surface(surface: str, normalized_form: str) -> tuple[str, float]:
    """Choose the more familiar spelling without changing the shared word row."""
    forms = tuple(dict.fromkeys((surface.strip(), normalized_form.strip())))
    ranked = []
    for form in forms:
        if not form:
            continue
        score = (
            float(zipf_frequency(form, "ja"))
            if lossy_tokenize(form, "ja") == [form]
            else 0.0
        )
        ranked.append((score, form == normalized_form, form))
    score, _is_normalized, selected = max(ranked)
    return selected, score


@dataclass(frozen=True)
class JmdictPriorityEvidence:
    priorities: frozenset[str]
    pos: frozenset[str]
    fields: frozenset[str]
    misc: frozenset[str]
    address_misc: frozenset[str]
    blocked_usage_misc: frozenset[str]
    glosses: tuple[str, ...]


@dataclass(frozen=True)
class WordNetSenseEvidence:
    categories: frozenset[str]
    blocked_themes: frozenset[str]
    depth: int | None = None
    descendant_count: int = 0
    is_person: bool = False
    is_relational_location: bool = False


def _payload_strings(payload: dict[str, Any], key: str) -> set[str]:
    values = payload.get(key, [])
    return {
        str(value).strip()
        for value in values
        if isinstance(value, str) and str(value).strip()
    }


def jmdict_ichi1_plain_noun_evidence(
    normalized_form: str,
    payload: dict[str, Any],
) -> JmdictPriorityEvidence | None:
    """Return evidence only when this exact projected form is an ichi1 plain noun."""
    senses = [sense for sense in payload.get("sense", []) if isinstance(sense, dict)]
    pos = frozenset(
        value
        for sense in senses
        for value in _payload_strings(sense, "pos")
    )
    if pos != frozenset(PLAIN_NOUN_POS):
        return None

    kanji_elements = [
        element for element in payload.get("k_ele", []) if isinstance(element, dict)
    ]
    reading_elements = [
        element for element in payload.get("r_ele", []) if isinstance(element, dict)
    ]
    projected: list[tuple[str, set[str]]] = []
    if kanji_elements:
        projected.extend(
            (
                str(element.get("keb", [""])[0]),
                _payload_strings(element, "ke_pri"),
            )
            for element in kanji_elements
            if element.get("keb")
        )
        projected.extend(
            (
                str(element.get("reb", [""])[0]),
                _payload_strings(element, "re_pri"),
            )
            for element in reading_elements
            if element.get("reb") and "re_nokanji" in element
        )
    else:
        projected.extend(
            (
                str(element.get("reb", [""])[0]),
                _payload_strings(element, "re_pri"),
            )
            for element in reading_elements
            if element.get("reb")
        )

    exact_priorities = frozenset(
        priority
        for form, priorities in projected
        if normalize(form) == normalized_form
        for priority in priorities
    )
    if "ichi1" not in exact_priorities:
        return None

    misc_by_sense = [_payload_strings(sense, "misc") for sense in senses]
    address_misc = (
        frozenset().union(*(values & ADDRESS_MISC for values in misc_by_sense))
        if misc_by_sense
        and all(values & ADDRESS_MISC for values in misc_by_sense)
        else frozenset()
    )
    blocked_usage_misc = (
        frozenset().union(
            *(values & BLOCKED_JMDICT_MISC for values in misc_by_sense)
        )
        if misc_by_sense
        and all(values & BLOCKED_JMDICT_MISC for values in misc_by_sense)
        else frozenset()
    )

    return JmdictPriorityEvidence(
        priorities=exact_priorities,
        pos=pos,
        fields=frozenset(
            value
            for sense in senses
            for value in _payload_strings(sense, "field")
        ),
        misc=frozenset(
            value
            for sense in senses
            for value in _payload_strings(sense, "misc")
        ),
        address_misc=address_misc,
        blocked_usage_misc=blocked_usage_misc,
        glosses=tuple(
            value
            for sense in senses
            for value in _payload_strings(sense, "gloss")
        ),
    )


def familiarity_score(
    display_zipf: float | None,
    jmdict_priorities: Iterable[str],
) -> float:
    """Combine whole-token Zipf and JMdict priority signals for game familiarity."""
    priorities = set(jmdict_priorities)
    priority_score = 3.2  # every candidate already has ichi1
    for priority in priorities:
        if re.fullmatch(r"nf\d{2}", priority):
            rank = int(priority[2:])
            priority_score = max(priority_score, 5.2 - 0.04 * (rank - 1))
    if "news1" in priorities:
        priority_score = max(priority_score, 4.2)
    if "news2" in priorities:
        priority_score = max(priority_score, 3.4)
    if priorities & {"gai1", "spec1", "spec2"}:
        priority_score = max(priority_score, 3.7)
    return round(max(float(display_zipf or 0.0), priority_score), 2)


def difficulty_evaluation(
    display_zipf: float | None,
    jmdict_priorities: Iterable[str],
) -> tuple[str, float, tuple[str, str]]:
    """Return the reversible general-pool tier and its positive flags."""
    score = familiarity_score(display_zipf, jmdict_priorities)
    if score >= DIFFICULTY_THRESHOLDS["easy"]:
        tier = "easy"
    elif score >= DIFFICULTY_THRESHOLDS["normal"]:
        tier = "normal"
    else:
        tier = "hard"
    return tier, score, (GENERAL_POOL_FLAG, f"difficulty_{tier}")


def load_wordnet_categories(
    database_path: Path,
) -> dict[str, tuple[WordNetSenseEvidence, ...]]:
    """Map each Japanese noun lemma to the promptability roots of every sense."""
    connection = sqlite3.connect(database_path)
    try:
        root_by_synset = {synset: name for name, synset in WORDNET_ROOTS.items()}
        blocked_theme_by_synset = {
            synset: theme
            for theme, synsets in BLOCKED_WORDNET_ROOTS.items()
            for synset in synsets
        }
        categories_by_synset: dict[str, set[str]] = defaultdict(set)
        blocked_by_synset: dict[str, set[str]] = defaultdict(set)
        for root_name, root_synset in WORDNET_ROOTS.items():
            categories_by_synset[root_synset].add(root_name)
        for root_synset, theme in blocked_theme_by_synset.items():
            blocked_by_synset[root_synset].add(theme)
        all_roots = tuple(root_by_synset) + tuple(blocked_theme_by_synset)
        placeholders = ",".join("?" for _ in all_roots)
        for descendant, ancestor in connection.execute(
            f"SELECT synset1, synset2 FROM ancestor WHERE synset2 IN ({placeholders})",
            all_roots,
        ):
            ancestor = str(ancestor)
            descendant = str(descendant)
            if ancestor in root_by_synset:
                categories_by_synset[descendant].add(root_by_synset[ancestor])
            if ancestor in blocked_theme_by_synset:
                blocked_by_synset[descendant].add(blocked_theme_by_synset[ancestor])

        depth_by_synset = {WORDNET_ENTITY_ROOT: 0}
        depth_by_synset.update(
            {
                str(synset): int(hops)
                for synset, hops in connection.execute(
                    "SELECT synset1, hops FROM ancestor WHERE synset2 = ?",
                    (WORDNET_ENTITY_ROOT,),
                )
            }
        )
        descendant_count_by_synset = {
            str(synset): int(count)
            for synset, count in connection.execute(
                "SELECT synset2, COUNT(*) FROM ancestor GROUP BY synset2"
            )
        }
        person_synsets = {WORDNET_PERSON_ROOT}
        person_synsets.update(
            str(synset)
            for (synset,) in connection.execute(
                "SELECT synset1 FROM ancestor WHERE synset2 = ?",
                (WORDNET_PERSON_ROOT,),
            )
        )
        relational_location_synsets = set(WORDNET_RELATIONAL_LOCATION_ROOTS)
        placeholders = ",".join("?" for _ in WORDNET_RELATIONAL_LOCATION_ROOTS)
        relational_location_synsets.update(
            str(synset)
            for (synset,) in connection.execute(
                f"SELECT synset1 FROM ancestor WHERE synset2 IN ({placeholders})",
                tuple(WORDNET_RELATIONAL_LOCATION_ROOTS),
            )
        )

        senses_by_lemma: dict[str, list[WordNetSenseEvidence]] = defaultdict(list)
        for lemma, synset in connection.execute(
            """
            SELECT word.lemma, sense.synset
            FROM word
            JOIN sense ON sense.wordid = word.wordid
            WHERE word.lang = 'jpn' AND word.pos = 'n' AND sense.lang = 'jpn'
            ORDER BY word.lemma, sense.synset
            """
        ):
            synset = str(synset)
            senses_by_lemma[normalize(str(lemma))].append(
                WordNetSenseEvidence(
                    categories=frozenset(categories_by_synset.get(synset, set())),
                    blocked_themes=frozenset(blocked_by_synset.get(synset, set())),
                    depth=depth_by_synset.get(synset),
                    descendant_count=descendant_count_by_synset.get(synset, 0),
                    is_person=synset in person_synsets,
                    is_relational_location=synset
                    in relational_location_synsets,
                )
            )
        return {lemma: tuple(senses) for lemma, senses in senses_by_lemma.items()}
    finally:
        connection.close()


def classify_candidate(
    *,
    surface: str,
    normalized_form: str,
    jmdict_pos: Iterable[str],
    wordnet_senses: tuple[WordNetSenseEvidence, ...] | None,
    jmdict_fields: Iterable[str] = (),
    jmdict_address_misc: Iterable[str] = (),
    jmdict_blocked_usage_misc: Iterable[str] = (),
    priority_entry_count: int = 1,
) -> tuple[str, list[str]]:
    flags: list[str] = []
    normalized_surface = normalize(surface)
    pos = set(jmdict_pos)
    fields = set(jmdict_fields)
    address_misc = set(jmdict_address_misc)
    blocked_usage_misc = set(jmdict_blocked_usage_misc)

    if len(normalized_surface) < 3 and KANA_ONLY_SURFACE.fullmatch(normalized_surface):
        flags.append("short_kana_surface")
    if HONORIFIC_REFERENCE.fullmatch(normalized_surface) or address_misc:
        flags.append("address_or_honorific")
    if priority_entry_count > 1:
        flags.append("ambiguous_surface")
    if ADJECTIVAL_NOMINALIZATION.fullmatch(normalized_form):
        flags.append("adjectival_nominalization")
    if DEVERBAL_NOMINALIZATION.fullmatch(normalized_form):
        flags.append("deverbal_nominalization")
    if normalized_form in METALINGUISTIC_TERMS:
        flags.append("metalinguistic_term")
    if normalized_form in CONTEXT_DEPENDENT_TERMS:
        flags.append("context_dependent_reference")
    if normalized_form in BROAD_CATEGORY_TERMS:
        flags.append("broad_category_term")
    if normalized_form in RELATIVE_DIRECTION_OR_MEASURE_TERMS:
        flags.append("relative_direction_or_measure")
    if normalized_form in FORMAT_OR_CLASSIFICATION_TERMS:
        flags.append("format_or_classification_term")
    if normalized_form in EVALUATIVE_NOUNS:
        flags.append("evaluative_noun")
    if normalized_form in UNCOMMON_ORTHOGRAPHY_TERMS:
        flags.append("uncommon_orthography")
    flags.extend(CURATED_THEME_FLAGS.get(normalized_form, ()))

    if not pos:
        flags.append("missing_jmdict_pos")
    elif pos - PLAIN_NOUN_POS:
        flags.append("jmdict_non_plain_noun")
    for field in sorted(fields & BLOCKED_JMDICT_FIELDS):
        flags.append(f"jmdict_field_{field.replace('/', '_').replace(' ', '_')}")
    for usage in sorted(blocked_usage_misc):
        flags.append(
            f"jmdict_misc_{usage.lower().replace('/', '_').replace(' ', '_')}"
        )

    if not wordnet_senses:
        flags.append("missing_wordnet_noun")
    else:
        promptable = [bool(sense.categories) for sense in wordnet_senses]
        if not any(promptable):
            flags.append("wordnet_no_concrete_sense")
        elif not all(promptable):
            flags.append("wordnet_mixed_abstract_senses")
        if any(
            sense.categories
            and sense.depth is not None
            and sense.depth <= BROAD_MAX_DEPTH
            and sense.descendant_count >= BROAD_MIN_DESCENDANTS
            for sense in wordnet_senses
        ):
            flags.append("wordnet_broad_category")
        if all(sense.is_person for sense in wordnet_senses):
            flags.append("person_role_or_relation")
        if any(sense.is_relational_location for sense in wordnet_senses):
            flags.append("relational_location")
        blocked_themes = {
            theme
            for sense in wordnet_senses
            for theme in sense.blocked_themes
        }
        for theme in sorted(blocked_themes):
            flags.append(f"wordnet_theme_{theme}")

    verified_category = VERIFIED_PROMPTABLE_TERMS.get(normalized_form)
    if verified_category:
        flags.append(f"verified_promptable_{verified_category}")

    exclusion_flags = [
        flag for flag in flags if not flag.startswith("verified_promptable_")
    ]
    return ("eligible" if not exclusion_flags else "exclude", flags)


def ensure_schema(connection: psycopg.Connection[Any]) -> None:
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS word_pool_evaluations (
          word_id BIGINT NOT NULL REFERENCES words(id) ON DELETE RESTRICT,
          pool_key TEXT NOT NULL,
          eligibility_status TEXT NOT NULL
            CHECK (eligibility_status IN ('eligible', 'review', 'exclude')),
          eligibility_flags TEXT[] NOT NULL DEFAULT '{}',
          policy_version TEXT NOT NULL,
          evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
          active BOOLEAN NOT NULL DEFAULT TRUE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          PRIMARY KEY (word_id, pool_key)
        )
        """
    )
    connection.execute(
        """
        CREATE INDEX IF NOT EXISTS word_pool_evaluations_pool_status_idx
        ON word_pool_evaluations (pool_key, active, eligibility_status, word_id)
        """
    )


def evaluate(
    database_url: str,
    wordnet_database: Path,
    *,
    apply: bool,
    sample_size: int,
    seed: int,
) -> tuple[Counter[str], list[tuple[str, str, float | None, list[str]]]]:
    wordnet = load_wordnet_categories(wordnet_database)
    counts: Counter[str] = Counter()
    eligible_rows: list[tuple[str, str, float | None, list[str]]] = []

    with psycopg.connect(database_url) as connection:
        if apply:
            ensure_schema(connection)
            connection.execute(
                """
                UPDATE word_pool_evaluations
                SET active = FALSE, updated_at = NOW()
                WHERE pool_key = %s AND active
                """,
                (POOL_KEY,),
            )

        with connection.cursor() as cursor:
            cursor.execute(BASE_CANDIDATE_QUERY)
            rows = cursor.fetchall()

        candidates: dict[int, dict[str, Any]] = {}
        for (
            word_id,
            surface,
            normalized_form,
            reading,
            zipf,
            source_key,
            source_entry_row_id,
            entry_payload,
        ) in rows:
            normalized = normalize(str(normalized_form))
            priority = jmdict_ichi1_plain_noun_evidence(
                normalized,
                dict(entry_payload),
            )
            if priority is None:
                continue
            candidate = candidates.setdefault(
                int(word_id),
                {
                    "surface": str(surface),
                    "normalized_form": normalized,
                    "reading": str(reading),
                    "zipf": float(zipf) if zipf is not None else None,
                    "source_key": str(source_key),
                    "entry_ids": set(),
                    "priorities": set(),
                    "pos": set(),
                    "fields": set(),
                    "misc": set(),
                    "address_misc": set(),
                    "blocked_usage_misc": set(),
                    "glosses": set(),
                },
            )
            candidate["entry_ids"].add(int(source_entry_row_id))
            candidate["priorities"].update(priority.priorities)
            candidate["pos"].update(priority.pos)
            candidate["fields"].update(priority.fields)
            candidate["misc"].update(priority.misc)
            candidate["address_misc"].update(priority.address_misc)
            candidate["blocked_usage_misc"].update(priority.blocked_usage_misc)
            candidate["glosses"].update(priority.glosses)

        staged: list[tuple[Any, ...]] = []
        for word_id, candidate in sorted(candidates.items()):
            surface = candidate["surface"]
            normalized = candidate["normalized_form"]
            reading = candidate["reading"]
            zipf = candidate["zipf"]
            display_surface, display_zipf = choose_display_surface(surface, normalized)
            source_key = candidate["source_key"]
            jmdict_priorities = candidate["priorities"]
            jmdict_pos = candidate["pos"]
            jmdict_fields = candidate["fields"]
            jmdict_misc = candidate["misc"]
            jmdict_address_misc = candidate["address_misc"]
            jmdict_blocked_usage_misc = candidate["blocked_usage_misc"]
            priority_entry_count = len(candidate["entry_ids"])
            senses = wordnet.get(normalized)
            status, flags = classify_candidate(
                surface=display_surface,
                normalized_form=normalized,
                jmdict_pos=jmdict_pos,
                jmdict_fields=jmdict_fields,
                jmdict_address_misc=jmdict_address_misc,
                jmdict_blocked_usage_misc=jmdict_blocked_usage_misc,
                priority_entry_count=priority_entry_count,
                wordnet_senses=senses,
            )
            difficulty_tier: str | None = None
            familiarity: float | None = None
            if status == "eligible":
                difficulty_tier, familiarity, pool_flags = difficulty_evaluation(
                    display_zipf,
                    jmdict_priorities,
                )
                flags.extend(pool_flags)
            counts["evaluated"] += 1
            counts[status] += 1
            for flag in flags:
                counts[f"flag:{flag}"] += 1
            if status == "eligible":
                eligible_rows.append((display_surface, reading, display_zipf, flags))
            if apply:
                evidence = {
                    "effective_zipf": zipf,
                    "display_surface": display_surface,
                    "display_zipf": display_zipf,
                    "source_key": source_key,
                    "jmdict_priority": "ichi1",
                    "jmdict_priorities": sorted(jmdict_priorities),
                    "jmdict_pos": sorted(jmdict_pos),
                    "jmdict_fields": sorted(jmdict_fields),
                    "jmdict_misc": sorted(jmdict_misc),
                    "jmdict_priority_entry_count": priority_entry_count,
                    "wordnet_sense_count": len(senses or ()),
                    "allowed_wordnet_roots": sorted(WORDNET_ROOTS),
                    "broad_max_depth": BROAD_MAX_DEPTH,
                    "broad_min_descendants": BROAD_MIN_DESCENDANTS,
                    "maximum_length": None,
                    "pool_key": POOL_KEY if status == "eligible" else None,
                    "difficulty_tier": difficulty_tier,
                    "familiarity_score": familiarity,
                    "difficulty_policy_version": (
                        DIFFICULTY_POLICY_VERSION if status == "eligible" else None
                    ),
                }
                staged.append(
                    (
                        int(word_id),
                        POOL_KEY,
                        status,
                        flags,
                        POLICY_VERSION,
                        psycopg.types.json.Jsonb(evidence),
                    )
                )

        if apply and staged:
            with connection.cursor() as cursor:
                cursor.executemany(
                    """
                    INSERT INTO word_pool_evaluations (
                      word_id, pool_key, eligibility_status, eligibility_flags,
                      policy_version, evidence, active, updated_at
                    )
                    VALUES (%s, %s, %s, %s, %s, %s, TRUE, NOW())
                    ON CONFLICT (word_id, pool_key) DO UPDATE SET
                      eligibility_status = EXCLUDED.eligibility_status,
                      eligibility_flags = EXCLUDED.eligibility_flags,
                      policy_version = EXCLUDED.policy_version,
                      evidence = EXCLUDED.evidence,
                      active = TRUE,
                      updated_at = NOW()
                    """,
                    staged,
                )
        if apply:
            connection.commit()

    rng = random.Random(seed)
    sample = rng.sample(eligible_rows, min(sample_size, len(eligible_rows)))
    return counts, sample


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--database-url", default=os.getenv("DATABASE_URL"))
    parser.add_argument("--wordnet-database", required=True, type=Path)
    parser.add_argument("--sample-size", type=int, default=20)
    parser.add_argument("--seed", type=int, default=20260719)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()

    if not args.database_url:
        parser.error("--database-url or DATABASE_URL is required")
    if not args.wordnet_database.is_file():
        parser.error(f"WordNet database does not exist: {args.wordnet_database}")

    counts, sample = evaluate(
        args.database_url,
        args.wordnet_database,
        apply=args.apply,
        sample_size=args.sample_size,
        seed=args.seed,
    )
    print("standard-game pool evaluation applied" if args.apply else "standard-game pool dry run")
    for key in sorted(counts):
        print(f"{key}: {counts[key]}")
    print("sample:")
    for surface, reading, zipf, _flags in sample:
        zipf_text = f"{zipf:.2f}" if zipf is not None else "n/a"
        print(f"{surface}\t{reading}\t{zipf_text}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

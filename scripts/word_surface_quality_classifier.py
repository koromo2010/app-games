#!/usr/bin/env python3
"""Classify lexical surfaces that are unsuitable as standalone game words."""

from __future__ import annotations

import re
import unicodedata

SURFACE_QUALITY_POLICY_VERSION = "surface-quality-v2"

FACILITY_SUFFIXES = (
    "高等学校",
    "中等教育学校",
    "特別支援学校",
    "市役所",
    "区役所",
    "町役場",
    "村役場",
    "大学校",
    "中学校",
    "小学校",
    "幼稚園",
    "保育園",
    "診療所",
    "大学",
    "高校",
    "学校",
    "学院",
    "病院",
    "医院",
    "空港",
    "公園",
    "競技場",
    "体育館",
    "美術館",
    "博物館",
    "図書館",
    "記念館",
    "資料館",
    "水族館",
    "動物園",
    "植物園",
    "駅",
)

ENUMERATION_SEPARATOR = re.compile(r"[・･/／、,，]+")
REPEATED_SINGLE_CHARACTER = re.compile(r"^(.)\1{3,}$")
LATIN_SCRIPT = re.compile(r"[A-Za-zＡ-Ｚａ-ｚ]")
EMOTICON_SYMBOL = re.compile(
    r"[\(\)（）\[\]［］<>＜＞\\:：;；=＝^＾_＿@＠#＃♪☆★♡♥ωДд∀▽△▼→←↑↓]"
)
KANJI_ONLY = re.compile(r"[一-龯々〆ヵヶ]+")


def normalize_surface(surface: str) -> str:
    return unicodedata.normalize("NFKC", surface).strip()


def is_facility_name(surface: str, proper_noun_status: str, proper_noun_type: str | None) -> bool:
    if proper_noun_status != "proper" or proper_noun_type == "person":
        return False
    return any(
        surface.endswith(suffix) and len(surface) - len(suffix) >= 2
        for suffix in FACILITY_SUFFIXES
    )


def is_enumeration(surface: str, proper_noun_type: str | None) -> bool:
    if proper_noun_type == "person":
        return False
    components = [part for part in ENUMERATION_SEPARATOR.split(surface) if part]
    return len(components) >= 3


def classify_surface_quality(
    surface: str,
    primary_part_of_speech: str,
    proper_noun_status: str,
    proper_noun_type: str | None,
    token_count: int = 1,
) -> tuple[str, list[str], str]:
    """Return status, stable reason flags, and the policy version."""
    normalized = normalize_surface(surface)
    flags: list[str] = []

    if proper_noun_type == "place":
        flags.append("place_name")
    if proper_noun_type == "organization":
        flags.append("organization_name")
    if is_facility_name(normalized, proper_noun_status, proper_noun_type):
        flags.append("facility_name")
    if is_enumeration(normalized, proper_noun_type):
        flags.append("enumeration")
    if REPEATED_SINGLE_CHARACTER.fullmatch(normalized):
        flags.append("repeated_noise")
    if len(normalized) >= 4 and normalized.endswith("っ") and primary_part_of_speech != "感動詞":
        flags.append("truncated_ending")
    if LATIN_SCRIPT.search(normalized):
        flags.append("latin_script")
    if EMOTICON_SYMBOL.search(normalized):
        flags.append("emoticon_symbols")
    if (
        proper_noun_status != "proper"
        and token_count >= 2
        and not KANJI_ONLY.fullmatch(normalized)
    ):
        flags.append("non_kanji_compound")

    return (
        "exclude" if flags else "clean",
        flags,
        SURFACE_QUALITY_POLICY_VERSION,
    )

"""Deterministic Japanese dictionary-form classification."""

from __future__ import annotations

from typing import Iterable

FORM_POLICY_VERSION = "jp-conjugation-form-v1"
INFLECTING_PARTS_OF_SPEECH = frozenset({"動詞", "形容詞", "助動詞"})
CONJUGATION_FORM_PREFIXES = (
    "終止形",
    "未然形",
    "連用形",
    "仮定形",
    "命令形",
    "連体形",
    "已然形",
    "意志推量形",
    "語幹",
    "ク語法",
)


def find_conjugation_form(details: Iterable[str]) -> str | None:
    """Find the Sudachi conjugation-form label without relying on array position."""
    for detail in reversed(tuple(details)):
        if detail.startswith(CONJUGATION_FORM_PREFIXES):
            return detail
    return None


def classify_word_form(primary_part_of_speech: str, details: Iterable[str]) -> tuple[str, str, str]:
    """Return form status, auditable reason, and policy version."""
    if primary_part_of_speech not in INFLECTING_PARTS_OF_SPEECH:
        return (
            "non_inflecting",
            f"non-inflecting-pos:{primary_part_of_speech}",
            FORM_POLICY_VERSION,
        )

    conjugation_form = find_conjugation_form(details)
    if conjugation_form is None:
        return (
            "unknown",
            "missing-conjugation-form",
            FORM_POLICY_VERSION,
        )
    if conjugation_form.startswith("終止形"):
        return (
            "dictionary",
            f"terminal:{conjugation_form}",
            FORM_POLICY_VERSION,
        )
    return (
        "inflected",
        f"non-terminal:{conjugation_form}",
        FORM_POLICY_VERSION,
    )

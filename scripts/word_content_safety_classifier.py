#!/usr/bin/env python3
"""Classify obvious standalone sensitive words for party-game selection.

This deliberately uses a small exact-match policy.  It is a cheap first pass,
not a complete moderation system: words not listed here remain unreviewed and
are judged in the same LLM request that proposes a Wordwolf partner.
"""

from __future__ import annotations

import unicodedata

CONTENT_SAFETY_POLICY_VERSION = "word-content-safety-v1"

# Exact standalone forms only.  Substring matching would incorrectly reject
# neutral compounds such as scientific names that merely contain one form.
EXACT_EXCLUDE_FLAGS: dict[str, tuple[str, ...]] = {
    "ホモ": ("identity_slur",),
    "レズ": ("identity_slur",),
    "オカマ": ("identity_slur",),
    "エロ": ("sexual_slang",),
    "おっぱい": ("sexual_body_term",),
    "ちんこ": ("sexual_explicit",),
    "ちんぽ": ("sexual_explicit",),
    "まんこ": ("sexual_explicit",),
    "セックス": ("sexual_explicit",),
    "ポルノ": ("sexual_explicit",),
    "レイプ": ("sexual_violence",),
    "強姦": ("sexual_violence",),
}


def normalize_safety_form(value: str) -> str:
    return unicodedata.normalize("NFKC", value).strip().casefold()


def classify_content_safety(
    surface: str,
    normalized_form: str | None = None,
) -> tuple[str, list[str], str]:
    """Return status, stable flags and policy version for a lexical entry."""
    forms = {
        normalize_safety_form(surface),
        normalize_safety_form(normalized_form or surface),
    }
    flags = sorted(
        {
            flag
            for form in forms
            for flag in EXACT_EXCLUDE_FLAGS.get(form, ())
        }
    )
    return (
        "exclude" if flags else "unreviewed",
        flags,
        CONTENT_SAFETY_POLICY_VERSION,
    )


__all__ = [
    "CONTENT_SAFETY_POLICY_VERSION",
    "EXACT_EXCLUDE_FLAGS",
    "classify_content_safety",
    "normalize_safety_form",
]

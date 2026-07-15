"""Deterministic classification of Sudachi person-name entries."""

from __future__ import annotations

from typing import Iterable

PERSON_NAME_POLICY_VERSION = "sudachi-person-name-v1"


def classify_person_name(
    proper_noun_status: str,
    proper_noun_type: str | None,
    details: Iterable[str],
) -> tuple[str, bool, str]:
    """Return person-name status, fragment exclusion flag, and policy version.

    Only Sudachi entries explicitly marked as a surname or given name are
    fragments. General person entries remain available for later notability
    matching.
    """
    if proper_noun_status != "proper" or proper_noun_type != "person":
        return "not_person", False, PERSON_NAME_POLICY_VERSION

    detail_set = set(details)
    is_surname = "姓" in detail_set
    is_given_name = "名" in detail_set
    if is_surname and not is_given_name:
        return "surname_only", True, PERSON_NAME_POLICY_VERSION
    if is_given_name and not is_surname:
        return "given_name_only", True, PERSON_NAME_POLICY_VERSION
    if "一般" in detail_set:
        return "general_person", False, PERSON_NAME_POLICY_VERSION

    # Ambiguous or unsupported metadata is kept for review instead of being
    # excluded automatically.
    return "unknown", False, PERSON_NAME_POLICY_VERSION


__all__ = ["PERSON_NAME_POLICY_VERSION", "classify_person_name"]

"""Shared wordfreq measurement rules for the word master."""

from __future__ import annotations

from wordfreq import zipf_frequency
from wordfreq.tokens import lossy_tokenize


def measure_zipf(surface: str) -> tuple[float | None, str]:
    """Return a whole-token Zipf value and its measurement status."""
    if lossy_tokenize(surface, "ja") != [surface]:
        return None, "split"
    value = float(zipf_frequency(surface, "ja"))
    return (value, "measured") if value > 0 else (None, "unseen")


def measured_zipf(surface: str) -> float | None:
    """Return Zipf only when wordfreq recognizes the whole surface as one token."""
    return measure_zipf(surface)[0]


def effective_zipf(measured: float | None, fallback: float | None) -> float | None:
    """Prefer a whole-token measurement and otherwise use the explicit fallback."""
    return measured if measured is not None else fallback

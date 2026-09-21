"""Anthropic — scrapes the public pricing page (SSR HTML, no JS needed).

Card structure (verified): an <h3> with the model name, inside a container
whose text contains 'Input $X / MTok', 'Output $Y / MTok', optional
'Read'/'Write' cache prices and context/max-output figures.
"""
import re

from bs4 import BeautifulSoup

from .base import fetch, clean, parse_price, parse_tokens, model_row

URL = "https://www.anthropic.com/pricing"
NAME_RE = re.compile(r"^(Opus|Sonnet|Haiku|Fable)\s*[0-9.]*$")

# Prices come from the page; capability data does not — Anthropic does not publish it
# there. These are curated per tier and surfaced in the UI as "curated", not "live".
CAPS = {"vision": True, "audio": False, "tools": True, "reasoning": True,
        "caching": True, "batch": True, "fine_tune": False, "open_weights": False}

FAMILY_FEATURES = {
    "Opus": [
        "Top tier for complex, multi-step reasoning",
        "Strongest Claude for agentic coding and long tool chains",
        "Extended thinking mode for harder prompts",
        "Text and image input, text output",
        "Prompt caching and batch API both supported",
    ],
    "Sonnet": [
        "Balanced speed and quality — the everyday workhorse",
        "Strong coding and agent performance at mid-tier price",
        "Extended thinking mode available",
        "Text and image input, text output",
        "Prompt caching and batch API both supported",
    ],
    "Haiku": [
        "Fastest and cheapest Claude tier",
        "Built for high-volume, latency-sensitive workloads",
        "Good at classification, extraction and routing",
        "Text and image input, text output",
        "Prompt caching keeps repeated context cheap",
    ],
    "Fable": [
        "Tuned for long-form creative and narrative writing",
        "Holds voice and style across long passages",
        "Premium tier — not intended as a bulk workhorse",
        "Text and image input, text output",
        "Prompt caching and batch API both supported",
    ],
}


def _card_for(h3) -> "BeautifulSoup | None":
    """Smallest ancestor whose text has Input+Output prices."""
    node = h3
    while node is not None and node.name != "body":
        node = node.parent
        if node is None:
            break
        text = clean(node.get_text(" "))
        if "Input" in text and "Output" in text and "$" in text:
            return node
    return None


def _price_after(text: str, label: str) -> float | None:
    m = re.search(re.escape(label) + r"\s*\$([0-9][0-9,]*(?:\.[0-9]+)?)\s*/\s*MTok", text)
    return float(m.group(1).replace(",", "")) if m else None


def fetch_models() -> list[dict]:
    soup = BeautifulSoup(fetch(URL).text, "html.parser")
    rows, seen = [], set()
    for h3 in soup.find_all("h3"):
        name = clean(h3.get_text())
        if not NAME_RE.match(name):
            continue
        card = _card_for(h3)
        if card is None:
            continue
        text = clean(card.get_text(" "))
        key = (name, _price_after(text, "Input"), _price_after(text, "Output"))
        if key in seen:
            continue
        seen.add(key)

        ctx = re.search(r"Context\s*([0-9][0-9,.]*\s*[KkMm]?)", text)
        mx = re.search(r"Max output\s*([0-9][0-9,.]*\s*[KkMm]?)", text)
        tag = re.search(re.escape(name) + r"\s*(.*?)\s*Input\b", text)
        best_for = tag.group(1) if tag and len(tag.group(1)) < 160 else None
        category = "coding" if best_for and "coding" in best_for.lower() else "general"
        rows.append(model_row(
            "anthropic",
            "claude-" + name.lower().replace(" ", "-"),
            f"Claude {name}",
            input_price=_price_after(text, "Input"),
            output_price=_price_after(text, "Output"),
            cache_read_price=_price_after(text, "Read"),
            cache_write_price=_price_after(text, "Write"),
            context_window=parse_tokens(ctx.group(1)) if ctx else None,
            max_output=parse_tokens(mx.group(1)) if mx else None,
            category=category,
            best_for=best_for,
            modalities="text+image in · text out",
            features=FAMILY_FEATURES.get(name.split()[0]),
            capabilities=CAPS,
            url=URL,
        ))
    return rows

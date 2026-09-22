"""Together AI — source for open-weight families (Qwen, Gemma).

Qwen and Gemma have no single vendor pricing page: they are open weights served
by many hosts at different rates. Together publishes a machine-readable pricing
table covering both, so it is used as the reference host. Prices are therefore
"as served by Together", not a universal rate, and the row says so.
"""
import re

from bs4 import BeautifulSoup

from .base import fetch, clean, model_row

URL = "https://www.together.ai/pricing"
PRICE_RE = re.compile(r"\$\s?([0-9]*\.?[0-9]+)")

FAMILIES = {
    "qwen": {
        "label": "Qwen",
        "category": "general",
        "best_for": "Strong open-weight quality, especially multilingual and coding",
        "features": [
            "Open weights — self-hostable or portable between providers",
            "Strong multilingual coverage, including CJK languages",
            "Competitive coding and reasoning for an open model",
            "Served here by Together; other hosts price it differently",
            "Apache-style licensing on most releases",
        ],
    },
    "gemma": {
        "label": "Gemma",
        "category": "general",
        "best_for": "Google's small open models — cheap, fast, easy to self-host",
        "features": [
            "Open weights from Google, built on Gemini research",
            "Small enough to run on a single GPU or locally",
            "Good instruction following for its size",
            "Served here by Together; also free via Google AI Studio",
            "Permissive licence allowing commercial use",
        ],
    },
}

# Model-size hints that imply a vision-capable release
VISION_HINT = re.compile(r"\b(vl|vision|multimodal)\b", re.I)

# Image/video/audio generators are billed per image or per second, so their
# numbers are not comparable with per-token pricing and are excluded.
NON_TEXT_RE = re.compile(r"\b(image|video|audio|tts|whisper|embed|rerank|guard)\b", re.I)


def _family(name: str):
    low = name.lower()
    for key, meta in FAMILIES.items():
        if low.startswith(key):
            return key, meta
    return None, None


def _context_lengths() -> dict:
    """Context windows are absent from the pricing page. The models API has
    them but needs a key, so this enriches only when TOGETHER_API_KEY is set;
    otherwise context stays null rather than being guessed."""
    import os
    key = os.environ.get("TOGETHER_API_KEY")
    if not key:
        return {}
    try:
        import httpx
        r = httpx.get("https://api.together.xyz/v1/models",
                      headers={"Authorization": f"Bearer {key}"}, timeout=20)
        r.raise_for_status()
        data = r.json()
        data = data.get("data", data) if isinstance(data, dict) else data
        return {m["id"].lower(): m.get("context_length") for m in data if m.get("id")}
    except Exception:
        return {}


def fetch_models() -> list[dict]:
    soup = BeautifulSoup(fetch(URL).text, "html.parser")
    ctx_by_id = _context_lengths()
    rows, seen = [], set()

    for tr in soup.find_all("tr"):
        link = tr.find("a", class_="pricing_model-link")
        if not link:
            continue
        name = clean(link.get_text(" "))
        key, meta = _family(name)
        if not key or name in seen or NON_TEXT_RE.search(name):
            continue

        prices = []
        for td in tr.find_all("td")[1:]:
            m = PRICE_RE.search(clean(td.get_text(" ")))
            if m:
                prices.append(float(m.group(1)))
        if not prices:
            continue
        seen.add(name)

        vision = bool(VISION_HINT.search(name))
        slug = (link.get("href") or "").rsplit("/", 1)[-1] or name.lower().replace(" ", "-")

        rows.append(model_row(
            "together",
            slug,
            name,
            input_price=prices[0],
            output_price=prices[1] if len(prices) > 1 else prices[0],
            context_window=next((v for k, v in ctx_by_id.items() if slug in k or name.lower() in k), None),
            category=meta["category"],
            best_for=meta["best_for"],
            modalities="text+image in · text out" if vision else "text in · text out",
            features=meta["features"],
            capabilities={
                "vision": vision, "audio": False, "tools": True, "reasoning": False,
                "caching": False, "batch": True, "fine_tune": True, "open_weights": True,
            },
            url=URL,
        ))
    return rows

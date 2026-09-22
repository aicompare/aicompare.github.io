"""DeepSeek — parses the pricing table in the API docs.

The table is transposed (models are columns, attributes are rows), so rows are
read into a label -> [per-model values] map and then pivoted.

DeepSeek bills different rates at peak and off-peak hours. We publish the PEAK
rate, which is the worst case and the honest number to budget against; the
off-peak discount is called out in the feature list instead.
"""
import re

from bs4 import BeautifulSoup

from .base import fetch, clean, parse_tokens, model_row

URL = "https://api-docs.deepseek.com/quick_start/pricing"
PRICE_RE = re.compile(r"\$\s?([0-9]*\.?[0-9]+)")


def _row_map(table) -> list[list[str]]:
    out = []
    for tr in table.find_all("tr"):
        cells = [clean(c.get_text(" ")) for c in tr.find_all(["th", "td"])]
        if any(cells):
            out.append(cells)
    return out


def _find(rows, label):
    """Peak per-model prices for a pricing label.

    The label can sit in any cell of its row, because the first column is
    sometimes occupied by a rowspan header like "PRICING (2)":
        ['PRICING (2)', '1M INPUT TOKENS (CACHE HIT)', 'OFF-PEAK', '$0.003', '$0.022']
        ['PEAK', '$0.006', '$0.044']
    """
    lab = label.lower()
    for i, r in enumerate(rows):
        if not any(lab in c.lower() for c in r):
            continue
        nxt = rows[i + 1] if i + 1 < len(rows) else []
        vals = nxt if (nxt and "peak" in nxt[0].lower()) else r
        prices = [float(m.group(1)) for c in vals if (m := PRICE_RE.search(c))]
        if prices:
            return prices
    return []


def _scalar(rows, label):
    for r in rows:
        if r and label.lower() in r[0].lower():
            rest = [c for c in r[1:] if c]
            if rest:
                return rest[0]
    return None


def fetch_models() -> list[dict]:
    soup = BeautifulSoup(fetch(URL).text, "html.parser")
    table = soup.find("table")
    if table is None:
        raise RuntimeError("pricing table not found")
    rows = _row_map(table)

    header = rows[0][1:] if rows else []
    ids = [h.split("(")[0].strip() for h in header if h]
    if not ids:
        raise RuntimeError("no model columns found")

    versions = [v for v in (rows[3][1:] if len(rows) > 3 else []) if v]
    inputs = _find(rows, "CACHE MISS")
    outputs = _find(rows, "1M OUTPUT TOKENS")
    cached = _find(rows, "CACHE HIT")

    ctx = parse_tokens(_scalar(rows, "CONTEXT LENGTH") or "")
    maxout = parse_tokens((_scalar(rows, "MAX OUTPUT") or "").replace("MAXIMUM:", ""))

    vision_row = next((r for r in rows if r and r[0].strip().lower() == "vision"), [])
    vision_vals = vision_row[1:] if vision_row else []

    out = []
    for i, mid in enumerate(ids):
        has_vision = i < len(vision_vals) and "✓" in vision_vals[i]
        name = versions[i] if i < len(versions) else mid
        out.append(model_row(
            "deepseek",
            mid,
            name,
            input_price=inputs[i] if i < len(inputs) else None,
            output_price=outputs[i] if i < len(outputs) else None,
            cache_read_price=cached[i] if i < len(cached) else None,
            context_window=ctx,
            max_output=maxout,
            category="reasoning",
            best_for="Frontier-class quality at a fraction of US-vendor pricing",
            modalities="text+image in · text out" if has_vision else "text in · text out",
            features=[
                "Among the cheapest frontier-tier models tracked here",
                "Switchable thinking and non-thinking modes",
                "Cache hits cost a small fraction of a fresh input token",
                "Off-peak hours are billed at roughly half the peak rate",
                "Reads text and images" if has_vision else "Text only — no image input",
            ],
            capabilities={
                "vision": has_vision, "audio": False, "tools": True, "reasoning": True,
                "caching": True, "batch": False, "fine_tune": False, "open_weights": True,
            },
            url=URL,
        ))
    return out

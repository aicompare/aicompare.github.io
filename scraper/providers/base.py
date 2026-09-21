"""Common scraper plumbing: HTTP fetch + price/number parsing helpers."""
import re
import html as html_mod
import httpx

UA = ("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0 Safari/537.36")
TIMEOUT = 20


def fetch(url: str) -> httpx.Response:
    r = httpx.get(url, headers={"User-Agent": UA}, timeout=TIMEOUT, follow_redirects=True)
    r.raise_for_status()
    return r


def clean(text: str) -> str:
    """Collapse whitespace and strip stray comment nodes."""
    text = re.sub(r"<!--.*?-->", "", text, flags=re.S)
    return re.sub(r"\s+", " ", text).strip()


PRICE_RE = re.compile(r"\$\s?([0-9][0-9,]*(?:\.[0-9]+)?)")


def parse_price(text: str) -> float | None:
    m = PRICE_RE.search(text)
    return float(m.group(1).replace(",", "")) if m else None


def parse_tokens(text: str) -> int | None:
    """Parse '1M', '200K', '128k', '1,048,576' style numbers."""
    t = clean(text).lower().replace(",", "")
    m = re.match(r"^([0-9.]+)\s*([km]?)", t)
    if not m:
        return None
    n = float(m.group(1))
    if m.group(2) == "k":
        n *= 1_000
    elif m.group(2) == "m":
        n *= 1_000_000
    return int(n)


def model_row(provider, model_id, name, input_price=None, output_price=None,
              context_window=None, max_output=None, cache_read_price=None,
              cache_write_price=None, free_tier=None, category=None,
              best_for=None, modalities=None, features=None, capabilities=None,
              url=None, source="live"):
    return {
        "provider": provider, "model_id": model_id, "name": name,
        "input_price": input_price, "output_price": output_price,
        "context_window": context_window, "max_output": max_output,
        "cache_read_price": cache_read_price,
        "cache_write_price": cache_write_price,
        "free_tier": free_tier, "category": category, "best_for": best_for,
        "modalities": modalities, "features": features,
        "capabilities": capabilities, "url": url, "source": source,
    }

"""xAI (Grok) — parses the __XAI_PUBLIC_MODELS__ payload on the docs models page.

The page ships a complete model catalogue as a JS global, so pricing, context
and feature flags all come from the vendor rather than a curated snapshot.
Token prices are published in hundred-thousandths of a dollar per 1M tokens:
20000 renders as "$2.00 / 1M tokens", hence the /1e4.
"""
import json
import re

from .base import fetch, model_row

URL = "https://docs.x.ai/docs/models"
PAYLOAD_RE = re.compile(r"globalThis\.__XAI_PUBLIC_MODELS__=(\{.*?\});?</script>", re.S)
PRICE_SCALE = 1e4

# Beta/experimental channels are skipped outright; dated and reasoning-mode
# variants collapse onto their base name so each family appears once.
SKIP_RE = re.compile(r"(beta|experimental)")
NORMALISE_RE = re.compile(r"-\d{4}(?=-|$)|-(?:non-)?reasoning$|-latest$")


def _base_name(name: str) -> str:
    prev = None
    while prev != name:
        prev = name
        name = NORMALISE_RE.sub("", name)
    return name


def _price(v):
    try:
        return int(v) / PRICE_SCALE
    except (TypeError, ValueError):
        return None


def fetch_models() -> list[dict]:
    html = fetch(URL).text
    m = PAYLOAD_RE.search(html)
    if not m:
        raise RuntimeError("__XAI_PUBLIC_MODELS__ payload not found")
    data = json.loads(m.group(1))

    seen, rows = {}, []
    for cluster in data.get("clusterConfigs", []):
        for lm in cluster.get("languageModels", []):
            raw = lm.get("name")
            if not raw or SKIP_RE.search(raw):
                continue
            name = _base_name(raw)
            # xAI prices the same model differently per cluster; publish the
            # lowest (standard) rate so the figure is stable and not a premium.
            cur = seen.get(name)
            if cur is None or _price(lm.get("promptTextTokenPrice")) < _price(cur.get("promptTextTokenPrice")):
                seen[name] = lm

    for name, lm in sorted(seen.items()):
        f = lm.get("features") or {}
        mods_in = [x.lower() for x in lm.get("inputModalities", [])]
        vision = "image" in mods_in
        audio = "audio" in mods_in
        reasoning = bool(f.get("reasoning"))

        caps = {
            "vision": vision, "audio": audio,
            "tools": bool(f.get("functionCalling")),
            "reasoning": reasoning,
            "caching": _price(lm.get("cachedPromptTokenPrice")) is not None,
            "batch": False, "fine_tune": False, "open_weights": False,
        }

        feats = [
            f"Context window of {int(lm['maxPromptLength']) // 1000}K tokens"
            if lm.get("maxPromptLength") else "Large context window",
            "Reads text and images" if vision else "Text input only",
        ]
        if reasoning:
            efforts = (f.get("reasoningEffortOptions") or {}).get("supportedEfforts") or []
            feats.append("Reasoning mode" + (f" with {len(efforts)} effort levels" if efforts else ""))
        if f.get("functionCalling"):
            feats.append("Function calling and structured outputs")
        if caps["caching"]:
            feats.append("Cached input billed at a large discount")
        feats.append("Real-time X/web search available on the platform")

        rows.append(model_row(
            "xai",
            name,
            "Grok " + name.replace("grok-", "").replace("-", " ").title(),
            input_price=_price(lm.get("promptTextTokenPrice")),
            output_price=_price(lm.get("completionTextTokenPrice")),
            cache_read_price=_price(lm.get("cachedPromptTokenPrice")),
            context_window=lm.get("maxPromptLength"),
            category="reasoning" if reasoning else "general",
            best_for="Frontier reasoning with very large context and live search",
            modalities=("text+image in · text out" if vision else "text in · text out"),
            features=feats[:5],
            capabilities=caps,
            url="https://docs.x.ai/docs/models",
        ))
    return rows

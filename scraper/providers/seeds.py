"""Seed-based providers: curated pricing loaded from seed.json.

Used for pages that are client-rendered or bot-blocked. If the provider has a
public model-list API and an API key is set in the environment (GROQ_API_KEY /
MISTRAL_API_KEY), the roster is cross-checked live and delisted models are
dropped; pricing still comes from the seed until a live pricing source exists.
"""
import json
import os
from pathlib import Path

from .base import model_row

SEED_PATH = Path(__file__).resolve().parent.parent / "seed.json"

_seed_cache = None


def _seed() -> dict:
    global _seed_cache
    if _seed_cache is None:
        _seed_cache = json.loads(SEED_PATH.read_text())
    return _seed_cache


def live_model_ids(base_url: str, api_key_env: str) -> set[str] | None:
    key = os.environ.get(api_key_env)
    if not key:
        return None
    try:
        import httpx
        r = httpx.get(base_url, headers={"Authorization": f"Bearer {key}"}, timeout=20)
        r.raise_for_status()
        return {m["id"] for m in r.json()["data"]}
    except Exception:
        return None


def seed_models(provider: str, roster_url: str | None = None,
                api_key_env: str | None = None) -> list[dict]:
    rows = []
    for entry in _seed().get(provider, []):
        row = model_row(provider, source="seed", **{
            k: v for k, v in entry.items() if k != "_comment"
        })
        rows.append(row)

    live_ids = live_model_ids(roster_url, api_key_env) if roster_url and api_key_env else None
    if live_ids is not None:
        rows = [r for r in rows if r["model_id"] in live_ids]
    return rows


def fetch_openai() -> list[dict]:
    return seed_models("openai")


def fetch_google() -> list[dict]:
    return seed_models("google")


def fetch_groq() -> list[dict]:
    return seed_models("groq", "https://api.groq.com/openai/v1/models", "GROQ_API_KEY")


def fetch_mistral() -> list[dict]:
    return seed_models("mistral", "https://api.mistral.ai/v1/models", "MISTRAL_API_KEY")

"""Backfill release dates from OpenRouter's public model catalogue.

No vendor we scrape publishes a release date on its pricing page, but
OpenRouter's public (no-auth) /api/v1/models exposes a `created` timestamp for
most of the same models. This runs after the scrapers and fills `released`
where a confident name match exists; unmatched models keep a null date and
sort last under "Latest".

Usage:  python3 -m scraper.enrich
"""
import re
from datetime import datetime, timezone

import httpx

from . import db

URL = "https://openrouter.ai/api/v1/models"
TIMEOUT = 25


def _norm(s: str) -> str:
    return re.sub(r"[^a-z0-9]", "", (s or "").lower())


def _index(catalogue: list[dict]) -> dict:
    idx = {}
    for m in catalogue:
        created = m.get("created")
        if not created:
            continue
        for key in (m["id"].split("/")[-1], m.get("name", "").split(":")[-1]):
            k = _norm(key)
            # first writer wins; the catalogue lists canonical ids first
            if k and k not in idx:
                idx[k] = created
    return idx


def _lookup(idx: dict, model_id: str, name: str):
    for k in (_norm(model_id), _norm(name)):
        if k in idx:
            return idx[k]
    # substring match, guarded so short ids cannot match everything
    k = _norm(model_id)
    if len(k) >= 8:
        for cand, created in idx.items():
            if len(cand) >= 8 and (cand in k or k in cand) and abs(len(cand) - len(k)) < 6:
                return created
    return None


def main() -> None:
    try:
        r = httpx.get(URL, timeout=TIMEOUT)
        r.raise_for_status()
        catalogue = r.json().get("data", [])
    except Exception as e:
        print(f"[skip]     release dates: {e}")
        return

    idx = _index(catalogue)
    conn = db.connect()
    try:
        rows = db.get_models(conn)
        hits = 0
        for m in rows:
            created = _lookup(idx, m["model_id"], m["name"])
            if not created:
                continue
            iso = datetime.fromtimestamp(created, timezone.utc).date().isoformat()
            conn.execute("UPDATE models SET released = ? WHERE provider = ? AND model_id = ?",
                         (iso, m["provider"], m["model_id"]))
            hits += 1
        conn.commit()
        print(f"[ok]       release dates: {hits}/{len(rows)} matched")
    finally:
        conn.close()


if __name__ == "__main__":
    main()

"""Run all providers and upsert into SQLite. Entry point for cron.

Usage:  python3 -m scraper.main          # run all
        python3 -m scraper.main anthropic openai   # run specific
"""
import sys
from datetime import datetime, timezone

from . import db
from .providers import PROVIDERS


def run(provider: str, fetch_fn) -> None:
    conn = db.connect()
    started = datetime.now(timezone.utc).isoformat()
    try:
        rows = fetch_fn()
        if not rows:
            raise RuntimeError("no models returned")
        db.upsert_models(conn, rows)
        db.record_run(conn, provider, "ok", len(rows), started_at=started)
        print(f"[ok]       {provider}: {len(rows)} models")
    except Exception as e:
        db.record_run(conn, provider, "failed", 0, message=str(e)[:300],
                      started_at=started)
        print(f"[failed]   {provider}: {e}", file=sys.stderr)
    finally:
        conn.close()


def main() -> None:
    names = sys.argv[1:] or list(PROVIDERS)
    unknown = [n for n in names if n not in PROVIDERS]
    if unknown:
        sys.exit(f"unknown provider(s): {', '.join(unknown)}")
    for name in names:
        run(name, PROVIDERS[name])

    from . import enrich
    enrich.main()


if __name__ == "__main__":
    main()

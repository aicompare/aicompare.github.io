"""SQLite storage for LLMRadar. One shared DB, one row per (provider, model)."""
import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).resolve().parent.parent / "data" / "llmradar.db"

SCHEMA = """
CREATE TABLE IF NOT EXISTS models (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider TEXT NOT NULL,
  model_id TEXT NOT NULL,
  name TEXT NOT NULL,
  context_window INTEGER,
  max_output INTEGER,
  input_price REAL,
  output_price REAL,
  cache_read_price REAL,
  cache_write_price REAL,
  free_tier TEXT,
  category TEXT,
  best_for TEXT,
  modalities TEXT,
  features TEXT,
  capabilities TEXT,
  url TEXT,
  source TEXT NOT NULL DEFAULT 'live',
  scraped_at TEXT,
  UNIQUE(provider, model_id)
);

CREATE TABLE IF NOT EXISTS scrape_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider TEXT NOT NULL,
  status TEXT NOT NULL,
  models_found INTEGER,
  message TEXT,
  started_at TEXT,
  finished_at TEXT
);
"""


def connect() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.executescript(SCHEMA)
    for col in ("category", "best_for", "modalities", "features", "capabilities"):
        try:
            conn.execute(f"ALTER TABLE models ADD COLUMN {col} TEXT")
        except sqlite3.OperationalError:
            pass
    return conn


def _json(value):
    """Store list/dict columns as JSON text; pass through None and plain strings."""
    if value is None or isinstance(value, str):
        return value
    import json
    return json.dumps(value)


def upsert_models(conn: sqlite3.Connection, rows: list[dict]) -> int:
    """Insert or refresh model rows. Returns number written."""
    from datetime import datetime, timezone

    now = datetime.now(timezone.utc).isoformat()
    for r in rows:
        conn.execute(
            """
            INSERT INTO models (provider, model_id, name, context_window, max_output,
                                input_price, output_price, cache_read_price,
                                cache_write_price, free_tier, category, best_for,
                                modalities, features, capabilities, url, source, scraped_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(provider, model_id) DO UPDATE SET
              name = excluded.name,
              context_window = excluded.context_window,
              max_output = excluded.max_output,
              input_price = excluded.input_price,
              output_price = excluded.output_price,
              cache_read_price = excluded.cache_read_price,
              cache_write_price = excluded.cache_write_price,
              free_tier = excluded.free_tier,
              category = excluded.category,
              best_for = excluded.best_for,
              modalities = excluded.modalities,
              features = excluded.features,
              capabilities = excluded.capabilities,
              url = excluded.url,
              source = excluded.source,
              scraped_at = excluded.scraped_at
            """,
            (
                r["provider"], r["model_id"], r["name"], r.get("context_window"),
                r.get("max_output"), r.get("input_price"), r.get("output_price"),
                r.get("cache_read_price"), r.get("cache_write_price"),
                r.get("free_tier"), r.get("category"), r.get("best_for"),
                r.get("modalities"), _json(r.get("features")), _json(r.get("capabilities")),
                r.get("url"), r.get("source", "live"), now,
            ),
        )
    conn.commit()
    return len(rows)


def record_run(conn, provider, status, models_found, message="", started_at=None):
    from datetime import datetime, timezone

    conn.execute(
        "INSERT INTO scrape_runs (provider, status, models_found, message, started_at, finished_at) "
        "VALUES (?, ?, ?, ?, ?, ?)",
        (provider, status, models_found, message,
         started_at or datetime.now(timezone.utc).isoformat(),
         datetime.now(timezone.utc).isoformat()),
    )
    conn.commit()


def get_models(conn) -> list[dict]:
    import json

    rows = []
    for r in conn.execute("SELECT * FROM models ORDER BY provider, name").fetchall():
        d = dict(r)
        for col in ("features", "capabilities"):
            if d.get(col):
                try:
                    d[col] = json.loads(d[col])
                except (ValueError, TypeError):
                    d[col] = None
        rows.append(d)
    return rows


def get_last_runs(conn) -> list[dict]:
    """Latest run per provider."""
    return [dict(r) for r in conn.execute(
        """
        SELECT provider, status, models_found, message, finished_at FROM scrape_runs
        WHERE id IN (SELECT MAX(id) FROM scrape_runs GROUP BY provider)
        ORDER BY provider
        """,
    ).fetchall()]

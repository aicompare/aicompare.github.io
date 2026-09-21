"""Export the database to static JSON + assemble a deployable site directory.

Used by CI: the scraper runs, this writes site/ , GitHub Pages serves it.

Usage:  python3 -m scraper.export [outdir]     (default: site)
"""
import json
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path

from . import db

ROOT = Path(__file__).resolve().parent.parent
STATIC = ROOT / "static"


def main() -> None:
    out = Path(sys.argv[1] if len(sys.argv) > 1 else "site")
    if out.exists():
        shutil.rmtree(out)
    shutil.copytree(STATIC, out)

    conn = db.connect()
    try:
        models = db.get_models(conn)
        runs = db.get_last_runs(conn)
    finally:
        conn.close()

    api = out / "api"
    api.mkdir(parents=True, exist_ok=True)
    (api / "models.json").write_text(json.dumps(models, separators=(",", ":")))
    (api / "status.json").write_text(json.dumps(runs, separators=(",", ":")))

    # Pages must not run these through Jekyll
    (out / ".nojekyll").write_text("")

    live = sum(1 for m in models if m.get("source") == "live")
    print(f"exported {len(models)} models ({live} live) to {out}/")

    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    (out / "api" / "build.json").write_text(json.dumps({"built": stamp}))


if __name__ == "__main__":
    main()

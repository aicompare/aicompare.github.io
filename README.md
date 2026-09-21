# LLMRadar

Independent AI model price & spec tracker. Scrapes provider pricing pages on a
cron schedule and renders a sortable comparison table. Built to grow into a
sellable niche site (affiliate links, SEO, email alerts).

## Stack

- **Scraper** — Python 3, `httpx` + `beautifulsoup4`, one module per provider
- **Storage** — SQLite (zero setup, swap for Supabase/Postgres when scaling)
- **Web** — FastAPI serving a dependency-free static frontend

## Run

```bash
pip install -r requirements.txt
./scrape.sh            # populate/refresh the DB (run once by hand first)
./run.sh               # serves on http://localhost:8000
```

## Deployment — GitHub Pages

`.github/workflows/deploy.yml` runs the scraper every 6 hours, exports the
database to static JSON and publishes the site. No server, no database to host.

- Site: `https://nikilrao18.github.io/llmradar/`
- JSON endpoint: `https://nikilrao18.github.io/llmradar/api/models.json`

One-time setup: repo **Settings → Pages → Source: GitHub Actions**.

The frontend resolves its data path from the location of `core.js`, so the same
build works at a project path (`/llmradar/`) or a domain root (a custom domain
later) with no changes.

## Local cron (only if self-hosting instead of Pages)

```cron
17 */6 * * * /path/to/llmradar/scrape.sh >> /path/to/llmradar/data/cron.log 2>&1
```

## Data sources

| Provider  | Mode      | Notes |
|-----------|-----------|-------|
| anthropic | **live**  | SSR pricing page, parsed per model card |
| openai    | seed      | page is bot-blocked (Cloudflare); curated in `scraper/seed.json` |
| google    | seed      | client-rendered; curated in `scraper/seed.json` |
| groq      | seed      | client-rendered; optional `GROQ_API_KEY` cross-checks model roster |
| mistral   | seed      | client-rendered; optional `MISTRAL_API_KEY` cross-checks model roster |

The UI shows a **live** (scraped <2d), **verified** (seed <30d) or **stale**
badge per row, so data honesty is visible to visitors.

## Adding a provider

1. `scraper/providers/<name>.py` with `fetch_models() -> list[dict]`
   (row shape: `provider, model_id, name, input_price, output_price, …`)
2. Register in `scraper/providers/__init__.py`
3. Run `./scrape.sh <name>`

## Monetization roadmap

1. **Affiliate/referral links** on each provider's "Get API key" button
   (OpenAI/Anthropic/Google/Mistral all have referral or partner programs)
2. **Price-drop alerts** — email signup, compare consecutive scrapes
   (add an `INSERT INTO price_history …` step in `db.upsert_models`)
3. **SEO pages** — static `/compare/gpt-vs-claude` style pages from the same DB
4. **Sponsored "featured" slot** once traffic is established

## Legal note

Pricing pages are public; scraping them for personal reference/comparison is
low-risk, but before charging money or scaling, review each provider's ToS on
automation and consider official APIs/partner data feeds first.

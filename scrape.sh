#!/usr/bin/env bash
# Cron entry point: refresh all provider data.
# crontab:  */6 * * * * /home/nirao/gitrepo/work/test-personal/llmradar/scrape.sh >> /home/nirao/gitrepo/work/test-personal/llmradar/data/cron.log 2>&1
cd "$(dirname "$0")"
exec python3 -m scraper.main "$@"

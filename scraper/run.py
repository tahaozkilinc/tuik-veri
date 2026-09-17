"""Günlük scrape işini uçtan uca çalıştıran CLI giriş noktası.

Kullanım:
    python -m scraper.run                # varsayılan: mevcut + önceki 2 yıl
    python -m scraper.run --full-history  # config'teki tüm yıl aralığını çeker (tek seferlik backfill)
"""

from __future__ import annotations

import argparse
import sys
from datetime import date
from itertools import product
from pathlib import Path

import yaml

from loader.supabase_loader import (
    finish_run,
    get_client,
    save_daily_report,
    start_run,
    upsert_trade_stats,
)
from reports.daily_report import build_report
from scraper.biruni_client import BiruniScrapeError, QueryTarget, fetch_records
from scraper.parser import normalize

CONFIG_PATH = Path(__file__).resolve().parent.parent / "config" / "targets.yaml"


def load_config() -> dict:
    with open(CONFIG_PATH, encoding="utf-8") as f:
        return yaml.safe_load(f)


def build_targets(config: dict, full_history: bool) -> list[QueryTarget]:
    current_year = date.today().year
    if full_history:
        years = range(config["years"]["start"], config["years"]["end"] + 1)
    else:
        years = range(current_year - 2, current_year + 1)

    gtip_codes = config.get("gtip_codes") or [None]
    ports = config.get("ports") or [None]
    flows = config.get("flows") or ["export", "import"]

    targets = []
    for year, flow, gtip, port in product(years, flows, gtip_codes, ports):
        targets.append(QueryTarget(year=year, flow=flow, gtip_code=gtip, port_name=port))
    return targets


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--full-history", action="store_true")
    args = parser.parse_args()

    config = load_config()
    targets = build_targets(config, args.full_history)
    print(f"{len(targets)} sorgu hedefi oluşturuldu.")

    client = get_client()
    run_id = start_run(client)

    try:
        raw_records = fetch_records(targets)
        normalized = normalize(raw_records)
        rows_upserted = upsert_trade_stats(client, normalized) if normalized else 0
        print(f"{rows_upserted} satır upsert edildi.")

        report_md = build_report(client, date.today().year)
        save_daily_report(client, date.today().isoformat(), report_md)
        print(report_md)

        finish_run(client, run_id, status="success", rows_upserted=rows_upserted)
        return 0

    except BiruniScrapeError as exc:
        finish_run(client, run_id, status="failed", error_message=str(exc))
        print(f"HATA: {exc}", file=sys.stderr)
        return 1
    except Exception as exc:  # noqa: BLE001
        finish_run(client, run_id, status="failed", error_message=str(exc))
        raise


if __name__ == "__main__":
    raise SystemExit(main())

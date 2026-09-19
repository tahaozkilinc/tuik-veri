"""Günlük scrape işini uçtan uca çalıştıran CLI giriş noktası.

Kullanım:
    python -m scraper.run

Not: Qlik Engine hypercube sorgusu config'teki tüm GTİP kodları için
ülke/yıl/yön kırılımındaki veriyi TEK seferde çeker (yıl aralığı ayrıca
belirtilmez — veri modelinde ne varsa gelir).
"""

from __future__ import annotations

import sys
from datetime import date
from pathlib import Path

import yaml

from loader.supabase_loader import (
    finish_run,
    get_client,
    replace_trade_stats,
    save_daily_report,
    start_run,
)
from reports.daily_report import build_report
from scraper.qlik_client import QlikClientError, fetch_trade_stats

CONFIG_PATH = Path(__file__).resolve().parent.parent / "config" / "targets.yaml"


def load_config() -> dict:
    with open(CONFIG_PATH, encoding="utf-8") as f:
        return yaml.safe_load(f)


def main() -> int:
    config = load_config()
    gtip_entries = config.get("gtip_codes") or []
    gtip_codes = [entry["code"] for entry in gtip_entries if entry.get("code")]
    print(f"{len(gtip_codes)} GTİP kodu için veri çekilecek: {gtip_codes}")

    client = get_client()
    run_id = start_run(client)

    try:
        records = fetch_trade_stats(gtip_codes)
        # DB'deki gtip_code sütunu noktasız/rakam-only (Qlik'in ISTPOZ'u) —
        # silme filtresi de aynı formatta olmalı.
        digit_codes = ["".join(ch for ch in c if ch.isdigit()) for c in gtip_codes]
        rows_written = replace_trade_stats(client, digit_codes, records) if records else 0
        print(f"{rows_written} satır yazıldı (eski satırlar silinip yenilendi).")

        report_md = build_report(client, date.today().year)
        save_daily_report(client, date.today().isoformat(), report_md)
        print(report_md)

        finish_run(client, run_id, status="success", rows_upserted=rows_written)
        return 0

    except QlikClientError as exc:
        finish_run(client, run_id, status="failed", error_message=str(exc))
        print(f"HATA: {exc}", file=sys.stderr)
        return 1
    except Exception as exc:  # noqa: BLE001
        finish_run(client, run_id, status="failed", error_message=str(exc))
        raise


if __name__ == "__main__":
    raise SystemExit(main())

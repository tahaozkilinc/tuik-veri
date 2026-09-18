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
    delete_stale_annual_rows,
    finish_run,
    get_client,
    save_daily_report,
    start_run,
    upsert_trade_stats,
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
        rows_upserted = upsert_trade_stats(client, records) if records else 0
        print(f"{rows_upserted} satır upsert edildi.")

        if rows_upserted:
            # Kaynak artık aylık (AY) kırılım döndürüyor; period_month'u NULL
            # olan eski yıllık-toplam satırlar artık üretilmiyor ve upsert'in
            # ON CONFLICT'i onları güncellemiyor (farklı anahtar) — silinmezse
            # yıllık toplamlar iki katına çıkar. Sadece yeni veri başarıyla
            # yazıldıysa temizle.
            deleted = delete_stale_annual_rows(client)
            if deleted:
                print(f"{deleted} eski yıllık-toplam (period_month IS NULL) satır silindi.")

        report_md = build_report(client, date.today().year)
        save_daily_report(client, date.today().isoformat(), report_md)
        print(report_md)

        finish_run(client, run_id, status="success", rows_upserted=rows_upserted)
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

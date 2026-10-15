"""KTB günlük bülten verisini çekip Supabase'e yükleyen CLI giriş noktası.

Kullanım:
    python -m ktb.run                       # bugünü çek ve yükle
    python -m ktb.run --date 2026-10-13      # belirli bir günü çek
    python -m ktb.run --backfill-days 365    # son N günü tek tek çekip yükle

KTB hafta sonu/tatil günlerinde işlem yapmıyor — o günler için GetGunlukBulten
boş liste döner, bu bir hata değildir, sadece atlanır.
"""

from __future__ import annotations

import argparse
import datetime as dt
import sys
import time

from ktb import records as ktb_records
from loader.supabase_loader import finish_run, get_client, replace_ktb_bulletin, start_run

TR_TZ = dt.timezone(dt.timedelta(hours=3))


def _today_tr() -> dt.date:
    return dt.datetime.now(TR_TZ).date()


def fetch_and_load_day(client, trade_date: dt.date) -> int:
    recs = ktb_records.fetch_day(trade_date)
    if not recs:
        return 0
    return replace_ktb_bulletin(client, trade_date.isoformat(), recs)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--date", type=str, default=None, help="YYYY-MM-DD, tek gün çek")
    parser.add_argument("--backfill-days", type=int, default=0, help="Son N günü tek tek çek (bugün dahil)")
    args = parser.parse_args()

    client = get_client()
    run_id = start_run(client, source="ktb")

    try:
        if args.backfill_days > 0:
            end = _today_tr()
            total_rows = 0
            days_with_data = 0
            errors = 0
            for i in range(args.backfill_days, -1, -1):
                day = end - dt.timedelta(days=i)
                try:
                    rows = fetch_and_load_day(client, day)
                    if rows:
                        total_rows += rows
                        days_with_data += 1
                        print(f"{day.isoformat()}: {rows} satır")
                except Exception as exc:  # noqa: BLE001
                    errors += 1
                    print(f"{day.isoformat()}: HATA — {exc}", file=sys.stderr)
                time.sleep(0.2)
            print(f"Backfill tamam: {days_with_data} işlem günü, {total_rows} satır, {errors} hata.")
            finish_run(client, run_id, status="success" if errors == 0 else "failed", rows_upserted=total_rows,
                       error_message=(f"{errors} günde hata oluştu" if errors else None))
            return 0

        day = dt.date.fromisoformat(args.date) if args.date else _today_tr()
        rows = fetch_and_load_day(client, day)
        print(f"{day.isoformat()}: {rows} satır yazıldı.")
        finish_run(client, run_id, status="success", rows_upserted=rows)
        return 0

    except Exception as exc:  # noqa: BLE001
        finish_run(client, run_id, status="failed", error_message=str(exc))
        print(f"HATA: {exc}", file=sys.stderr)
        raise


if __name__ == "__main__":
    raise SystemExit(main())

"""TCMB günlük USD/TRY kurunu çekip Supabase'e yükleyen CLI giriş noktası.

Kullanım:
    python -m tcmb.run                       # son 7 günü çek ve yükle
    python -m tcmb.run --date 2026-10-13      # belirli bir günü çek
    python -m tcmb.run --backfill-days 365    # son N günü tek tek çekip yükle

Hafta sonu/resmi tatil günlerinde TCMB yayın yapmıyor — o günler için
fetch_date None döner, bu bir hata değildir, sadece atlanır.
"""

from __future__ import annotations

import argparse
import datetime as dt
import sys
import time

from loader.supabase_loader import finish_run, get_client, replace_tcmb_rate, start_run
from tcmb import client

TR_TZ = dt.timezone(dt.timedelta(hours=3))


def _today_tr() -> dt.date:
    return dt.datetime.now(TR_TZ).date()


def fetch_and_load_day(sb_client, trade_date: dt.date) -> int:
    record = client.fetch_date(trade_date)
    if not record:
        return 0
    return replace_tcmb_rate(sb_client, record["trade_date"], record)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--date", type=str, default=None, help="YYYY-MM-DD, tek gün çek")
    parser.add_argument("--backfill-days", type=int, default=0, help="Son N günü tek tek çek (bugün dahil)")
    args = parser.parse_args()

    sb_client = get_client()
    run_id = start_run(sb_client, source="tcmb")

    try:
        if args.backfill_days > 0:
            end = _today_tr()
            total_rows = 0
            days_with_data = 0
            errors = 0
            for i in range(args.backfill_days, -1, -1):
                day = end - dt.timedelta(days=i)
                try:
                    rows = fetch_and_load_day(sb_client, day)
                    if rows:
                        total_rows += rows
                        days_with_data += 1
                        print(f"{day.isoformat()}: {rows} satır")
                except Exception as exc:  # noqa: BLE001
                    errors += 1
                    print(f"{day.isoformat()}: HATA — {exc}", file=sys.stderr)
                time.sleep(0.2)
            print(f"Backfill tamam: {days_with_data} iş günü, {total_rows} satır, {errors} hata.")
            finish_run(sb_client, run_id, status="success" if errors == 0 else "failed", rows_upserted=total_rows,
                       error_message=(f"{errors} günde hata oluştu" if errors else None))
            return 0

        if args.date:
            days = [dt.date.fromisoformat(args.date)]
        else:
            # Son 7 gün (bugün dahil): GitHub zamanlayıcısı bu görevi
            # saatlerce geciktirip TR gece yarısından SONRA çalıştırabiliyor
            # (gözlemlendi: 19:00 TR görevi 02:00-03:00 TR'de çalıştı). Tek
            # "bugün" çekilince henüz yayınlanmamış günün dosyası 404 dönüyor
            # ve görev 0 satırla "başarılı" bitiyordu — kur 30 Ekim'de takılı
            # kalmıştı. Örtüşen pencere her çalışmada eksik günleri tamamlar.
            today = _today_tr()
            days = [today - dt.timedelta(days=i) for i in range(6, -1, -1)]

        total_rows = 0
        written: list[str] = []
        day_errors: list[str] = []
        for day in days:
            try:
                rows = fetch_and_load_day(sb_client, day)
            except Exception as exc:  # noqa: BLE001
                day_errors.append(f"{day.isoformat()}: {exc}")
                print(f"UYARI {day.isoformat()}: {exc}")
                continue
            if rows:
                total_rows += rows
                written.append(day.isoformat())
            print(f"{day.isoformat()}: {rows} satır yazıldı.")
        warnings = list(day_errors)
        if not args.date and not written and not day_errors:
            warnings.append("son 7 günde yayınlanmış kur bulunamadı")
        if len(day_errors) == len(days):
            # Kaynağa hiç ulaşılamadı — görev düşmez, bir sonraki çalışmanın
            # 7 günlük penceresi boşluğu kapatır.
            print("UYARI: TCMB'ye ulaşılamadı — bir sonraki çalışmada tekrar denenecek.")
        finish_run(sb_client, run_id, status="success", rows_upserted=total_rows,
                   error_message=("; ".join(warnings)[:2000] or None))
        return 0

    except Exception as exc:  # noqa: BLE001
        finish_run(sb_client, run_id, status="failed", error_message=str(exc))
        print(f"HATA: {exc}", file=sys.stderr)
        raise


if __name__ == "__main__":
    raise SystemExit(main())

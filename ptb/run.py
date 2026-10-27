"""PTB günlük bülten verisini çekip Supabase'e yükleyen CLI giriş noktası.

Kullanım:
    python -m ptb.run                       # son 3 günü (bugün dahil) çek
                                             # (ÇTB'deki aynı güvenlik
                                             # önlemi — bkz. aşağıdaki not)
    python -m ptb.run --date 2026-10-13      # belirli bir günü çek
    python -m ptb.run --backfill-days 365    # son N günü tek tek çekip yükle

PTB hafta sonu/tatil günlerinde işlem yapmıyor — o günler için boş/sentinel
satır döner, bu bir hata değildir, sadece atlanır.

NOT: Kullanıcının açık talebi her akşam 18:00'da çekilmesi. Kaynağın kendi
yayın saati bağımsız doğrulanmadığından (KTB'de yaşanan "geç yayın"
riskine karşı), varsayılan çalışma HEM bugünü HEM dünü çeker ve ikisini de
yazar (sil-ve-ekle) — 18:00'dan sonra kaydedilen geç işlemler ertesi günün
çalıştırmasında otomatik düzeltiliyor.
"""

from __future__ import annotations

import argparse
import datetime as dt
import sys
import time

from loader.supabase_loader import finish_run, get_client, replace_ptb_fiyat, start_run
from ptb import records as ptb_records

TR_TZ = dt.timezone(dt.timedelta(hours=3))


def _today_tr() -> dt.date:
    return dt.datetime.now(TR_TZ).date()


def fetch_and_load_day(client, trade_date: dt.date) -> int:
    recs = ptb_records.fetch_day(trade_date)
    if not recs:
        return 0
    return replace_ptb_fiyat(client, trade_date.isoformat(), recs)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--date", type=str, default=None, help="YYYY-MM-DD, tek gün çek")
    parser.add_argument("--backfill-days", type=int, default=0, help="Son N günü tek tek çek (bugün dahil)")
    args = parser.parse_args()

    client = get_client()
    run_id = start_run(client, source="ptb")

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
            finish_run(
                client,
                run_id,
                status="success" if errors == 0 else "failed",
                rows_upserted=total_rows,
                error_message=(f"{errors} günde hata oluştu" if errors else None),
            )
            return 0

        if args.date:
            days = [dt.date.fromisoformat(args.date)]
        else:
            today = _today_tr()
            days = [today - dt.timedelta(days=2), today - dt.timedelta(days=1), today]

        total_rows = 0
        for day in days:
            rows = fetch_and_load_day(client, day)
            print(f"{day.isoformat()}: {rows} satır yazıldı.")
            total_rows += rows
        finish_run(client, run_id, status="success", rows_upserted=total_rows)
        return 0

    except Exception as exc:  # noqa: BLE001
        finish_run(client, run_id, status="failed", error_message=str(exc))
        print(f"HATA: {exc}", file=sys.stderr)
        raise


if __name__ == "__main__":
    raise SystemExit(main())

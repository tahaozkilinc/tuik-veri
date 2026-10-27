"""KTB günlük bülten verisini çekip Supabase'e yükleyen CLI giriş noktası.

Kullanım:
    python -m ktb.run                       # son 3 günü (dün dahil) çek ve yükle
    python -m ktb.run --date 2026-10-13      # belirli bir günü çek
    python -m ktb.run --backfill-days 365    # son N günü tek tek çekip yükle

KTB hafta sonu/tatil günlerinde işlem yapmıyor — o günler için GetGunlukBulten
boş liste döner, bu bir hata değildir, sadece atlanır.

NOT (2026-10-19'da bulunan gerçek hata): varsayılan tarih kasıtlı olarak
BUGÜN değil DÜN — KTB'nin günlük bülteni, kaynağın kendi yayın sürecine göre
aynı günün akşamı geç saatlerde (gözlemlenen: ~23:30 TR civarı, bazen daha
geç) yayınlanıyor. Cron ister akşam ister gece erken saatte çalışsın, "bugünü"
istemek yayından önce yakalanıp hep 0 satır dönme riski taşıyor — ve bu satır
bir daha asla tekrar denenmediği için o gün kalıcı olarak eksik kalıyor
(nitekim ilk üç günlük cron çalışması da tam bunu yaşadı). "Dünü" istemek,
cron ertesi sabah çalıştığı sürece yayının çoktan kesinleşmiş olmasını garanti
eder (bkz. .github/workflows/ktb-daily.yml'deki zamanlama açıklaması).

NOT 2: GitHub Actions'ın zamanlanmış çalıştırması ard arda günler boyunca
hiç tetiklenmeyebiliyor (bkz. gtb/run.py, turib/run.py'deki aynı önlem).
Varsayılan çalışma bu yüzden tek gün (dün) değil, dün dahil son 3 günü
yeniden çekip yazıyor (sil-ve-ekle, zararsız) — ardışık 1-2 günlük cron
atlaması kendiliğinden telafi ediliyor.
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


def _yesterday_tr() -> dt.date:
    return _today_tr() - dt.timedelta(days=1)


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

        if args.date:
            days = [dt.date.fromisoformat(args.date)]
        else:
            yesterday = _yesterday_tr()
            days = [yesterday - dt.timedelta(days=2), yesterday - dt.timedelta(days=1), yesterday]

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

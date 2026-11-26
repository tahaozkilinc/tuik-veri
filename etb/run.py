"""ETB (Eskişehir Ticaret Borsası) günlük bültenini çekip Supabase'e yükler.

Kullanım:
    python -m etb.run                         # son 4 günü (bugün dahil) çek
    python -m etb.run --date 2026-11-25        # tek gün
    python -m etb.run --since 2023-01-01       # o tarihten bugüne her günü çek (geçmiş doldurma)

Neden son 4 gün: GitHub Actions zamanlanmış görevleri saatlerce gecikebiliyor
(gözlemlendi: 18:00 TR görevi gece yarısından sonra çalışabiliyor) ve kaynak
geç kaydedilen işlemleri sonradan ekleyebiliyor. Her çalışma örtüşen bir
pencereyi sil-ve-ekle ile yeniden yazdığı için atlanan/geciken günler
kendiliğinden düzeliyor.

Hata politikası (kullanıcının açık talebi: "fail olma"):
  - İşlem olmayan gün (hafta sonu/tatil) hata değildir, 0 satır yazılır.
  - Tek bir günün geçici hatası görevi düşürmez (bir sonraki çalışma telafi
    eder). Kaynağa hiç ulaşılamazsa da düşmez (uyarı yazar). Görev sadece
    sayfa yapısı bozulduğunda (ayrıştırma hatası) ya da yazma
    doğrulanamadığında düşer — bunlar gerçek arızadır.
  - Yazılan her gün veritabanından geri okunup satır sayısı doğrulanır.
"""

from __future__ import annotations

import argparse
import concurrent.futures as cf
import datetime as dt
import sys
import threading

from etb import records as etb_records
from etb.client import EtbSession
from loader.supabase_loader import count_rows_for_date, finish_run, get_client, replace_rows_for_date, start_run

TABLE = "etb_fiyat"
TR_TZ = dt.timezone(dt.timedelta(hours=3))
_local = threading.local()


def _today_tr() -> dt.date:
    return dt.datetime.now(TR_TZ).date()


def _fetch(day: dt.date) -> tuple[dt.date, list[dict] | None, str | None, bool]:
    """(gün, kayıtlar, hata, ağ_hatası_mı). Ağ hatası = kaynağa ulaşılamadı
    (geçici); diğerleri = sayfa beklenen yapıda değil (gerçek arıza)."""
    sess = getattr(_local, "sess", None)
    if sess is None:
        sess = _local.sess = EtbSession()
    try:
        html = sess.fetch_day_html(day)
    except Exception as exc:  # noqa: BLE001
        return day, None, str(exc), True
    try:
        return day, etb_records.parse_day(html, day), None, False
    except Exception as exc:  # noqa: BLE001
        return day, None, str(exc), False


def _write(client, day: dt.date, recs: list[dict]) -> int:
    n = replace_rows_for_date(client, TABLE, day.isoformat(), recs)
    got = count_rows_for_date(client, TABLE, day.isoformat())
    if got != len(recs):
        raise RuntimeError(f"{day}: {len(recs)} satır yazıldı ama veritabanında {got} satır var")
    return n


def run_days(client, days: list[dt.date], workers: int) -> tuple[int, int, list[str], bool]:
    total = days_with_data = 0
    errors: list[str] = []
    only_network = True
    with cf.ThreadPoolExecutor(max_workers=workers) as pool:
        for day, recs, err, is_net in pool.map(_fetch, days):
            if err:
                only_network = only_network and is_net
                errors.append(f"{day}: {err}")
                print(f"UYARI {day}: {err}", file=sys.stderr)
                continue
            try:
                n = _write(client, day, recs or [])
            except Exception as exc:  # noqa: BLE001
                only_network = False
                errors.append(f"{day}: yazma — {exc}")
                print(f"UYARI {day}: yazma — {exc}", file=sys.stderr)
                continue
            if n:
                days_with_data += 1
                total += n
                print(f"{day}: {n} satır")
    return total, days_with_data, errors, only_network


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--date", default=None, help="YYYY-MM-DD, tek gün")
    ap.add_argument("--since", default=None, help="YYYY-MM-DD, bu tarihten bugüne her gün")
    args = ap.parse_args()

    today = _today_tr()
    if args.since:
        start = dt.date.fromisoformat(args.since)
        days = [start + dt.timedelta(days=i) for i in range((today - start).days + 1)]
        workers = 6
    elif args.date:
        days = [dt.date.fromisoformat(args.date)]
        workers = 1
    else:
        days = [today - dt.timedelta(days=i) for i in range(3, -1, -1)]
        workers = 2

    client = get_client()
    run_id = start_run(client, source="etb")
    try:
        total, with_data, errors, only_network = run_days(client, days, workers)
        print(f"Tamam: {len(days)} gün tarandı, {with_data} işlem günü, {total} satır, {len(errors)} hata.")
        if len(errors) == len(days) and not only_network:
            raise RuntimeError("Tüm günler hata verdi: " + " | ".join(errors[:5]))
        if len(errors) == len(days):
            # Kaynak geçici olarak erişilemez: görev düşmez, bir sonraki
            # çalışma (örtüşen pencere) eksik günleri tamamlar.
            print("UYARI: kaynağa ulaşılamadı — bir sonraki çalışmada tekrar denenecek.")
        finish_run(client, run_id, status="success", rows_upserted=total,
                   error_message=("; ".join(errors)[:2000] or None))
        return 0
    except Exception as exc:  # noqa: BLE001
        finish_run(client, run_id, status="failed", error_message=str(exc)[:2000])
        print(f"HATA: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())

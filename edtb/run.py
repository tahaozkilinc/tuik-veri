"""EDTB (Edirne Ticaret Borsası) yağlık ayçiçeği günlük fiyatlarını yükler.

Kullanım:
    python -m edtb.run              # son 30 günü yeniden yaz (günlük görev)
    python -m edtb.run --days 366   # son 1 yılı yaz (ilk doldurma)

Kaynak tek sayfa açılışında tüm günlük geçmişi verdiği için her çalışma
penceredeki günleri kaynaktan yeniden yazar (sil-ve-ekle): geciken/atlanan
çalışmalar ve kaynağın sonradan düzelttiği günler kendiliğinden düzelir.

Hata politikası ("fail olma"):
  - Kaynağa ulaşılamazsa görev düşmez (uyarı yazar, 30 günlük pencere bir
    sonraki çalışmada boşluğu kapatır).
  - Görev sadece kaynak yapısı değiştiğinde (ayrıştırma hatası) ya da
    yazılan veri veritabanından geri okunup doğrulanamadığında düşer.
"""

from __future__ import annotations

import argparse
import datetime as dt
import sys

from edtb import records as edtb_records
from edtb.client import EdtbFetchError, fetch_daily_list
from loader.supabase_loader import finish_run, get_client

TABLE = "edtb_fiyat"
TR_TZ = dt.timezone(dt.timedelta(hours=3))


def _write_window(client, start: str, recs: list[dict]) -> None:
    client.table(TABLE).delete().gte("trade_date", start).execute()
    for i in range(0, len(recs), 500):
        client.table(TABLE).insert(recs[i : i + 500]).execute()


def _verify(client, start: str, recs: list[dict]) -> None:
    got = client.table(TABLE).select("trade_date,ort_fiyat,toplam_kilo").gte("trade_date", start).execute().data
    want = {r["trade_date"]: r for r in recs}
    have = {r["trade_date"]: r for r in got}
    if set(want) != set(have):
        raise RuntimeError(f"doğrulama: {len(want)} gün yazıldı, veritabanında {len(have)} gün var")
    for d, r in want.items():
        h = have[d]
        if abs(float(h["ort_fiyat"]) - r["ort_fiyat"]) > 1e-6 or abs(float(h["toplam_kilo"]) - r["toplam_kilo"]) > 1e-6:
            raise RuntimeError(f"doğrulama: {d} değerleri kaynakla eşleşmiyor")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--days", type=int, default=30, help="Bugünden geriye kaç gün yazılsın")
    args = ap.parse_args()

    today = dt.datetime.now(TR_TZ).date()
    start = (today - dt.timedelta(days=args.days)).isoformat()

    client = get_client()
    run_id = client.table("scrape_runs").insert({"status": "running", "source": "edtb"}).execute().data[0]["id"]
    try:
        try:
            raw = fetch_daily_list()
        except EdtbFetchError as exc:
            print(f"UYARI: {exc} — bir sonraki çalışmada tekrar denenecek.")
            finish_run(client, run_id, status="success", rows_upserted=0, error_message=f"UYARI: {exc}"[:2000])
            return 0

        recs, warnings = edtb_records.parse_rows(raw)
        all_dates = [r["trade_date"] for r in recs]
        print(f"Kaynak: {len(recs)} işlem günü ({all_dates[0] if all_dates else '-'} → {all_dates[-1] if all_dates else '-'})")
        window = [r for r in recs if r["trade_date"] >= start]
        if not window:
            msg = f"UYARI: {start} sonrasında işlem yok (son işlem: {all_dates[-1] if all_dates else '-'})"
            print(msg)
            finish_run(client, run_id, status="success", rows_upserted=0, error_message=msg)
            return 0
        if all_dates and (today - dt.date.fromisoformat(all_dates[-1])).days > 14:
            warnings.append(f"son işlem {all_dates[-1]} — 14 günden eski")

        _write_window(client, start, window)
        _verify(client, start, window)
        print(f"{len(window)} gün yazıldı ({window[0]['trade_date']} → {window[-1]['trade_date']}); veritabanıyla birebir doğrulandı.")
        for w in warnings:
            print("UYARI:", w)
        finish_run(client, run_id, status="success", rows_upserted=len(window),
                   error_message=("; ".join(warnings)[:2000] or None))
        return 0
    except Exception as exc:  # noqa: BLE001
        finish_run(client, run_id, status="failed", error_message=str(exc)[:2000])
        print(f"HATA: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())

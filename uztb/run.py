"""UZTB (Uzunköprü Ticaret Borsası) günlük fiyat özetini çekip Supabase'e
yükleyen CLI giriş noktası.

Kullanım:
    python -m uztb.run                # bugünü (bireysel satırlardan hesaplanan
                                       # özet, rutubet dahil) çek ve yükle
    python -m uztb.run --backfill     # kaynağın elindeki ~1 aylık geçmiş
                                       # günlük özeti (rutubet hariç) çek ve yükle

Kaynakta tarih parametreli bir geçmiş API bulunmuyor — bu yüzden 1 yıllık
tam backfill mümkün değil, sadece kaynağın kendi tuttuğu son birkaç hafta
geriye dönük doldurulabiliyor. Her gün 18:00'da varsayılan mod çalıştıkça
gerçek (rutubet dahil) günlük geçmiş kendiliğinden birikir.
"""

from __future__ import annotations

import datetime as dt
import sys

from loader.supabase_loader import finish_run, get_client, replace_uztb_fiyat, start_run
from uztb import client, records

URUN_KODU = "99992"  # kullanıcının belirttiği UZTB ürünü (AYÇİÇEK/çekirdek)
TR_TZ = dt.timezone(dt.timedelta(hours=3))


def main() -> int:
    backfill = "--backfill" in sys.argv
    today = dt.datetime.now(TR_TZ).date()

    db_client = get_client()
    run_id = start_run(db_client, source="uztb")

    try:
        if backfill:
            raw = client.fetch_daily_summary(URUN_KODU)
            recs = records.parse_daily_summary(raw, URUN_KODU, today)
            print(f"{len(recs)} günlük özet satırı çekildi (kaynağın elindeki geçmiş).")
            total = 0
            for rec in recs:
                total += replace_uztb_fiyat(db_client, rec["trade_date"], URUN_KODU, rec)
            print(f"{total} satır yazıldı.")
            finish_run(db_client, run_id, status="success", rows_upserted=total)
            return 0

        raw = client.fetch_today_rows(URUN_KODU)
        rec = records.summarize_today(raw, URUN_KODU, today)
        if rec is None:
            print("Bugün için henüz Salon Satışı verisi yok.")
            finish_run(db_client, run_id, status="success", rows_upserted=0)
            return 0
        total = replace_uztb_fiyat(db_client, rec["trade_date"], URUN_KODU, rec)
        print(f"{rec['trade_date']}: {total} satır yazıldı ({rec['islem_adet']} işlem).")
        finish_run(db_client, run_id, status="success", rows_upserted=total)
        return 0

    except Exception as exc:  # noqa: BLE001
        finish_run(db_client, run_id, status="failed", error_message=str(exc))
        print(f"HATA: {exc}", file=sys.stderr)
        raise


if __name__ == "__main__":
    raise SystemExit(main())

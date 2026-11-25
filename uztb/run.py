"""UZTB (Uzunköprü Ticaret Borsası) günlük bültenini çekip Supabase'e
yükleyen ve yazdığını kaynağa karşı doğrulayan CLI giriş noktası.

Kullanım:
    python -m uztb.run

Her çalıştırma kaynağın elindeki ~1 aylık bülten penceresinin TAMAMINI
yeniden yazar, sonra DB'den geri okuyup kaynakla alan alan karşılaştırır.
Pencere her gün baştan yazıldığı için bir günün kaçması (bayram, kaynağın
geç güncellenmesi, geçici erişim sorunu) ertesi çalıştırmada kendiliğinden
telafi edilir — bu yüzden "veri yok"/"kaynağa ulaşılamadı" durumları görevi
düşürmez, sadece uyarı olarak loglanır. Görev yalnızca DB'ye yazma/geri
okuma tekrar denemelere rağmen tutmuyorsa (gerçek altyapı arızası) düşer.
"""

from __future__ import annotations

import datetime as dt
import sys
import time

from loader.supabase_loader import finish_run, get_client, read_uztb_fiyat, replace_uztb_fiyat, start_run
from uztb import client, records

URUN_KODU = "99992"  # kullanıcının belirttiği UZTB ürünü (AYÇİÇEK/çekirdek)
TR_TZ = dt.timezone(dt.timedelta(hours=3))
RETRY_WAITS = (10, 30, 60)
# Bayram tatilleri ~9 güne kadar işlem yapılmayan dönem yaratabiliyor.
STALE_WARN_DAYS = 12
VERIFY_FIELDS = ("min_fiyat", "max_fiyat", "ort_fiyat", "toplam_kilo", "islem_adet", "ort_yag")


def _same(a, b) -> bool:
    if a is None or b is None:
        return a is None and b is None
    return abs(float(a) - float(b)) < 1e-6


def _verify(db_client, recs: list[dict]) -> list[str]:
    stored = {r["trade_date"]: r for r in read_uztb_fiyat(db_client, URUN_KODU, [r["trade_date"] for r in recs])}
    problems = []
    for rec in recs:
        row = stored.get(rec["trade_date"])
        if row is None:
            problems.append(f"{rec['trade_date']}: DB'de satır yok")
            continue
        problems += [f"{rec['trade_date']}.{f}: kaynak={rec[f]} db={row[f]}" for f in VERIFY_FIELDS if not _same(rec[f], row[f])]
    return problems


def _fetch_with_retry() -> list[dict] | None:
    for attempt, wait in enumerate((0,) + RETRY_WAITS):
        time.sleep(wait)
        try:
            return client.fetch_daily_summary(URUN_KODU)
        except Exception as exc:  # noqa: BLE001
            print(f"Kaynak denemesi {attempt + 1} başarısız: {exc}")
    return None


def main() -> int:
    today = dt.datetime.now(TR_TZ).date()
    db_client = get_client()
    run_id = start_run(db_client, source="uztb")
    warnings = []

    raw = _fetch_with_retry()
    if raw is None:
        warnings.append("kaynağa ulaşılamadı (bir sonraki çalıştırma ~1 aylık pencereyi baştan yazacak)")
    recs = records.parse_daily_summary(raw or [], URUN_KODU, today)
    if raw is not None and not recs:
        warnings.append("kaynak bülten boş döndü")

    total = 0
    if recs:
        latest = max(r["trade_date"] for r in recs)
        stale_days = (today - dt.date.fromisoformat(latest)).days
        if stale_days > STALE_WARN_DAYS:
            warnings.append(f"kaynaktaki en yeni gün {latest} ({stale_days} gün önce)")
        no_yag = [r["trade_date"] for r in recs if r["ort_yag"] is None]
        if no_yag:
            warnings.append(f"yağ oranı olmayan günler: {no_yag}")

        problems: list[str] = []
        for attempt, wait in enumerate((0,) + RETRY_WAITS):
            time.sleep(wait)
            try:
                total = replace_uztb_fiyat(db_client, URUN_KODU, recs)
                problems = _verify(db_client, recs)
            except Exception as exc:  # noqa: BLE001
                problems = [f"DB hatası: {exc}"]
            if not problems:
                break
            print(f"Yazma/doğrulama denemesi {attempt + 1} başarısız: {problems[:5]}")
        if problems:
            msg = "DB yazma/doğrulama tekrar denemelere rağmen başarısız: " + "; ".join(problems[:10])
            finish_run(db_client, run_id, status="failed", error_message=msg)
            print(f"HATA: {msg}", file=sys.stderr)
            return 1
        print(f"{total} gün yazıldı ({min(r['trade_date'] for r in recs)} → {latest}); tüm alanlar kaynakla birebir eşleşiyor.")

    for w in warnings:
        print(f"UYARI: {w}")
    finish_run(db_client, run_id, status="success", rows_upserted=total, error_message="; ".join(warnings) or None)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

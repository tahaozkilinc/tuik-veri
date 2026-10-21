"""Geçici araştırma scripti: GTB/ÇTB/PTB'nin 5 yıl öncesine kadar gerçekten
veri/erişim sağlayıp sağlamadığını (hata vermeden, makul şekilde boş/dolu
dönüp dönmediğini) doğrular — 365 günlük backfill'i 5 yıla (1825 gün)
çıkarmadan önce boşa uzun bir çalıştırma yapmamak için."""
import datetime as dt

print("=" * 20, "GTB — 5/3/1 yıl önce", "=" * 20)
from gtb.client import fetch_salon_satis_html, parse_rows

for years_ago in [5, 3, 1]:
    day = dt.date(2026, 10, 21) - dt.timedelta(days=365 * years_ago)
    try:
        html = fetch_salon_satis_html(day)
        rows = parse_rows(html)
        print(f"{years_ago} yıl önce ({day}): {len(rows)} satır")
    except Exception as exc:
        print(f"{years_ago} yıl önce ({day}): HATA — {exc}")

print("\n" + "=" * 20 + " ÇTB — 5/3/1 yıl önce " + "=" * 20)
from ctb.client import fetch_aralik

for years_ago in [5, 3, 1]:
    day = dt.date(2026, 10, 21) - dt.timedelta(days=365 * years_ago)
    try:
        urunler = fetch_aralik(day, day)
        print(f"{years_ago} yıl önce ({day}): {len(urunler)} ürün")
    except Exception as exc:
        print(f"{years_ago} yıl önce ({day}): HATA — {exc}")

print("\n" + "=" * 20 + " PTB — 5/3/1 yıl önce " + "=" * 20)
from ptb.client import fetch_gunluk_bulten

for years_ago in [5, 3, 1]:
    day = dt.date(2026, 10, 21) - dt.timedelta(days=365 * years_ago)
    try:
        rows = fetch_gunluk_bulten(day)
        real_rows = [r for r in rows if (r.get("UrunAdi") or "").strip() and r.get("OrtFiyat") not in (None, "0")]
        print(f"{years_ago} yıl önce ({day}): {len(rows)} ham satır, {len(real_rows)} gerçek ürün satırı")
    except Exception as exc:
        print(f"{years_ago} yıl önce ({day}): HATA — {exc}")

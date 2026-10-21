"""Geçici araştırma scripti v2: ÇTB ve PTB'nin gerçek geçmiş sınırını
(hangi yıldan itibaren veri/erişim var) ince taneli olarak buluyor —
ilk denemede 1 yıl çalışıp 3-5 yıl 0/hata döndüğü görüldü, aradaki
noktalar (6 ay, 1.5/2/2.5/3 yıl) test ediliyor."""
import datetime as dt

REF = dt.date(2026, 10, 21)

print("=" * 20, "ÇTB — ince taneli geçmiş testi", "=" * 20)
from ctb.client import fetch_aralik

for months_ago in [12, 18, 24, 30, 36, 48, 60]:
    day = REF - dt.timedelta(days=30 * months_ago // 1)
    # haftasonu riskini azaltmak için en yakın iş gününe (Pzt-Cum) kaydır
    while day.weekday() >= 5:
        day -= dt.timedelta(days=1)
    try:
        urunler = fetch_aralik(day, day)
        print(f"{months_ago} ay önce ({day}, {day.strftime('%A')}): {len(urunler)} ürün")
    except Exception as exc:
        print(f"{months_ago} ay önce ({day}): HATA — {exc}")

print("\n" + "=" * 20 + " PTB — ince taneli geçmiş testi " + "=" * 20)
from ptb.client import fetch_gunluk_bulten

for months_ago in [12, 18, 24, 30, 36, 48, 60]:
    day = REF - dt.timedelta(days=30 * months_ago // 1)
    while day.weekday() >= 5:
        day -= dt.timedelta(days=1)
    try:
        rows = fetch_gunluk_bulten(day)
        real_rows = [r for r in rows if (r.get("UrunAdi") or "").strip() and r.get("OrtFiyat") not in (None, "0")]
        print(f"{months_ago} ay önce ({day}, {day.strftime('%A')}): {len(rows)} ham satır, {len(real_rows)} gerçek ürün")
    except Exception as exc:
        print(f"{months_ago} ay önce ({day}): HATA — {exc}")

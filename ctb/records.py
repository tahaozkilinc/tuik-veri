"""ÇTB /Bulten/Aralik API yanıtını Supabase kayıtlarına çevirir.

"ortalamaKgFiyat" (= toplamFiyat/toplamTonaj) ağırlıklı ortalama fiyat —
UZTB/KTB'deki ort_fiyat ile aynı anlamda kullanılıyor. API'nin ayrıca
döndürdüğü "ortalamaFiyat" alanı işlem-bazlı (ağırlıksız) bir ortalama,
kullanılmıyor.
"""

from __future__ import annotations

import datetime as dt


def parse_records(urunler: list[dict], trade_date: dt.date) -> list[dict]:
    records = []
    for u in urunler:
        urun_adi = u.get("urunAdi")
        if not urun_adi:
            continue
        records.append(
            {
                "trade_date": trade_date.isoformat(),
                "urun_adi": urun_adi,
                "min_fiyat": u.get("enAzFiyat"),
                "max_fiyat": u.get("enCokFiyat"),
                "ort_fiyat": u.get("ortalamaKgFiyat"),
                "toplam_kilo": u.get("toplamTonaj"),
                "islem_adet": int(u["islemAdedi"]) if u.get("islemAdedi") is not None else None,
            }
        )
    return records


def fetch_day(trade_date: dt.date) -> list[dict]:
    from ctb.client import fetch_aralik

    urunler = fetch_aralik(trade_date, trade_date)
    return parse_records(urunler, trade_date)

"""KTB GetGunlukBulten API yanıtını Supabase kayıtlarına çevirir.

Kaynağın kendi alan adları (GrupAdi, UrunGrubuKodu, SinifAdi, MinFiyat, ...)
korunuyor, sadece Türkçe sayı formatı (1.234,56 -> 1234.56) ayrıştırılıyor.
"""

from __future__ import annotations

import datetime as dt


def _parse_turkish_number(s) -> float | None:
    if s is None:
        return None
    if isinstance(s, (int, float)):
        return float(s)
    s = s.strip()
    if not s or s == "-":
        return None
    s = s.replace(".", "").replace(",", ".")
    try:
        return float(s)
    except ValueError:
        return None


def parse_records(data: list[dict], trade_date: dt.date) -> list[dict]:
    # Kaynak nadiren aynı (grup, sınıf) için aynı günde iki satır döndürüyor
    # (örn. 2026-03-04'te STANDART DIŞI KIRMIZI SERT EKMEKLİK BUĞDAYLAR) —
    # (trade_date, grup_kodu, sinif_adi) unique constraint'i bozmaması için
    # burada miktar ağırlıklı birleştiriyoruz, tüm günün INSERT'i tek bir
    # satırın çakışmasından dolayı başarısız olmasın diye.
    merged: dict[tuple[str, str], dict] = {}
    for row in data:
        grup_kodu = row.get("UrunGrubuKodu")
        grup_adi = row.get("GrupAdi")
        sinif_adi = row.get("SinifAdi")
        if not grup_kodu or not grup_adi or not sinif_adi:
            continue
        key = (grup_kodu, sinif_adi)
        rec = {
            "trade_date": trade_date.isoformat(),
            "grup_kodu": grup_kodu,
            "grup_adi": grup_adi,
            "sinif_adi": sinif_adi,
            "min_fiyat": _parse_turkish_number(row.get("MinFiyat")),
            "ort_fiyat": _parse_turkish_number(row.get("OrtFiyat")),
            "max_fiyat": _parse_turkish_number(row.get("MaxFiyat")),
            "miktar": _parse_turkish_number(row.get("Miktar")),
            "islem_sayisi": int(row["IslemSayisi"]) if row.get("IslemSayisi") is not None else None,
            "grup_min_fiyat": _parse_turkish_number(row.get("GrupMinFiyat")),
            "grup_ort_fiyat": _parse_turkish_number(row.get("GrupOrtFiyat")),
            "grup_max_fiyat": _parse_turkish_number(row.get("GrupMaxFiyat")),
        }
        existing = merged.get(key)
        if existing is None:
            merged[key] = rec
            continue
        qty_a = existing["miktar"] or 0
        qty_b = rec["miktar"] or 0
        total_qty = qty_a + qty_b
        if total_qty > 0 and existing["ort_fiyat"] is not None and rec["ort_fiyat"] is not None:
            existing["ort_fiyat"] = (existing["ort_fiyat"] * qty_a + rec["ort_fiyat"] * qty_b) / total_qty
        existing["min_fiyat"] = min(v for v in (existing["min_fiyat"], rec["min_fiyat"]) if v is not None) \
            if existing["min_fiyat"] is not None or rec["min_fiyat"] is not None else None
        existing["max_fiyat"] = max(v for v in (existing["max_fiyat"], rec["max_fiyat"]) if v is not None) \
            if existing["max_fiyat"] is not None or rec["max_fiyat"] is not None else None
        existing["miktar"] = total_qty or None
        existing["islem_sayisi"] = (existing["islem_sayisi"] or 0) + (rec["islem_sayisi"] or 0)
    return list(merged.values())


def fetch_day(trade_date: dt.date) -> list[dict]:
    from ktb.client import fetch_gunluk_bulten

    data = fetch_gunluk_bulten(trade_date)
    return parse_records(data, trade_date)

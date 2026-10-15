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
    records = []
    for row in data:
        grup_kodu = row.get("UrunGrubuKodu")
        grup_adi = row.get("GrupAdi")
        sinif_adi = row.get("SinifAdi")
        if not grup_kodu or not grup_adi or not sinif_adi:
            continue
        records.append({
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
        })
    return records


def fetch_day(trade_date: dt.date) -> list[dict]:
    from ktb.client import fetch_gunluk_bulten

    data = fetch_gunluk_bulten(trade_date)
    return parse_records(data, trade_date)

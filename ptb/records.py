"""PTB BultenGunluk.ashx yanıtını Supabase kayıtlarına çevirir.

Kaynağın kendi sayı formatı KTB ile aynı Türkçe biçim (virgül ondalık,
nokta binlik ayracı — örn. "1.234,56") — bu yüzden aynı ayrıştırıcı mantığı
kullanılıyor (ktb/records.py'deki _parse_turkish_number ile aynı, ayrı
paket olduğu için burada tekrarlanıyor).

Kategori/toplam satırları (TARIMSAL, HUBUBAT, BUĞDAY gibi — Kirilim ağacının
ara düğümleri) MinFiyat/MaxFiyat/OrtFiyat hep "0" ve gerçek bir işlem
temsil etmiyor — bu yüzden OrtFiyat 0 olan veya UrunAdi boş olan satırlar
atlanıyor.
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


def parse_records(rows: list[dict], trade_date: dt.date) -> list[dict]:
    records = []
    for row in rows:
        urun_adi = (row.get("UrunAdi") or "").strip()
        if not urun_adi:
            continue
        ort_fiyat = _parse_turkish_number(row.get("OrtFiyat"))
        if not ort_fiyat:
            continue  # kategori/toplam satırı — gerçek işlem değil
        records.append(
            {
                "trade_date": trade_date.isoformat(),
                "urun_adi": urun_adi,
                "min_fiyat": _parse_turkish_number(row.get("MinFiyat")),
                "max_fiyat": _parse_turkish_number(row.get("MaxFiyat")),
                "ort_fiyat": ort_fiyat,
                "toplam_kilo": _parse_turkish_number(row.get("Miktar")),
                "islem_adet": int(row["MuamAd"]) if row.get("MuamAd") not in (None, "") else None,
                "islem_tutari_tl": _parse_turkish_number(row.get("IslTut")),
            }
        )
    return records


def fetch_day(trade_date: dt.date) -> list[dict]:
    from ptb.client import fetch_gunluk_bulten

    rows = fetch_gunluk_bulten(trade_date)
    return parse_records(rows, trade_date)

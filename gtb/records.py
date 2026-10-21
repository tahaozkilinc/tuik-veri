"""GTB salon satış HTML'inden ayrıştırılan satırları Supabase kayıtlarına çevirir.

Kaynakta ortalama/ağırlıklı ortalama fiyat YOK — kullanıcının açık talimatı
üzerine ("bazal olarak direkt ortlama olarak al") ort_fiyat = (min+max)/2
olarak TÜRETİLİYOR, kaynaktan gelmiyor.

Sayı formatı KTB'den FARKLI: GTB'de "19,500" virgül BİNLİK ayracı anlamına
geliyor (yani 19500), KTB'nin "1.234,56" Türkçe formatındaki (nokta binlik,
virgül ondalık) gibi değil — bu yüzden ktb/records.py'deki
_parse_turkish_number burada KULLANILAMAZ, ayrı bir ayrıştırıcı gerekiyor.
"""

from __future__ import annotations

import datetime as dt


def _parse_gtb_number(s) -> float | None:
    if s is None:
        return None
    if isinstance(s, (int, float)):
        return float(s)
    s = s.strip()
    if not s or s == "-":
        return None
    s = s.replace(",", "")
    try:
        return float(s)
    except ValueError:
        return None


def parse_records(rows: list[dict], trade_date: dt.date) -> list[dict]:
    records = []
    for row in rows:
        min_fiyat = _parse_gtb_number(row.get("min_fiyat_raw"))
        max_fiyat = _parse_gtb_number(row.get("max_fiyat_raw"))
        if min_fiyat is None and max_fiyat is None:
            continue
        if min_fiyat is not None and max_fiyat is not None:
            ort_fiyat = (min_fiyat + max_fiyat) / 2
        else:
            ort_fiyat = min_fiyat if min_fiyat is not None else max_fiyat
        records.append(
            {
                "trade_date": trade_date.isoformat(),
                "urun_kodu": row["urun_kodu"],
                "urun_adi": row["urun_adi"],
                "min_fiyat": min_fiyat,
                "max_fiyat": max_fiyat,
                "ort_fiyat": ort_fiyat,
            }
        )
    return records


def fetch_day(trade_date: dt.date) -> list[dict]:
    from gtb.client import fetch_salon_satis_html, parse_rows

    html = fetch_salon_satis_html(trade_date)
    rows = parse_rows(html)
    return parse_records(rows, trade_date)

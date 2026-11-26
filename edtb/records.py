"""EDTB günlük özet satırlarını edtb_fiyat kayıtlarına çevirir.

Kaynak satırı (canlı doğrulandı, 2026-11-26):
  {"Tarih": "2026-11-25", "MinFiyat": 33.51, "MaxFiyat": 37.66,
   "OrtFiyat": 36.36, "TahminiMiktar": 147500, "Adet": 19,
   "IslemHacmi": 5363075, ...}
Fiyatlar TL/kg, TahminiMiktar kg, IslemHacmi TL. OrtFiyat kaynağın kendi
ağırlıklı ortalaması (IslemHacmi / TahminiMiktar ile tutarlı).
"""

from __future__ import annotations

import datetime as dt

URUN_ADI = "YAĞLIK AYÇİÇEKLER"


def _f(v) -> float | None:
    try:
        return None if v is None else float(v)
    except (TypeError, ValueError):
        return None


def parse_rows(rows: list[dict]) -> tuple[list[dict], list[str]]:
    """(kayıtlar, uyarılar). Aynı tarih iki kez gelirse birleştirilir."""
    by_date: dict[str, dict] = {}
    warnings: list[str] = []
    for r in rows:
        tarih = (r.get("Tarih") or "")[:10]
        try:
            dt.date.fromisoformat(tarih)
        except ValueError:
            raise ValueError(f"EDTB satırında geçersiz tarih: {r.get('Tarih')!r}")
        rec = {
            "trade_date": tarih,
            "urun_adi": URUN_ADI,
            "min_fiyat": _f(r.get("MinFiyat")),
            "max_fiyat": _f(r.get("MaxFiyat")),
            "ort_fiyat": _f(r.get("OrtFiyat")),
            "toplam_kilo": _f(r.get("TahminiMiktar")),
            "islem_adet": int(_f(r.get("Adet")) or 0),
            "islem_tutari_tl": _f(r.get("IslemHacmi")),
        }
        if not rec["ort_fiyat"] or not rec["toplam_kilo"]:
            warnings.append(f"{tarih}: fiyat/miktar boş, atlandı")
            continue
        if tarih in by_date:
            e = by_date[tarih]
            e["min_fiyat"] = min(e["min_fiyat"], rec["min_fiyat"])
            e["max_fiyat"] = max(e["max_fiyat"], rec["max_fiyat"])
            e["toplam_kilo"] += rec["toplam_kilo"]
            e["islem_tutari_tl"] = (e["islem_tutari_tl"] or 0) + (rec["islem_tutari_tl"] or 0)
            e["islem_adet"] += rec["islem_adet"]
            e["ort_fiyat"] = round(e["islem_tutari_tl"] / e["toplam_kilo"], 4)
            continue
        by_date[tarih] = rec

    # Kendi kendini doğrulama: ortalama, tutar/miktar ile %2 içinde olmalı.
    bad = 0
    for rec in by_date.values():
        if rec["islem_tutari_tl"]:
            implied = rec["islem_tutari_tl"] / rec["toplam_kilo"]
            if abs(implied - rec["ort_fiyat"]) > 0.02 * rec["ort_fiyat"]:
                bad += 1
                warnings.append(f"{rec['trade_date']}: ort {rec['ort_fiyat']} ≠ tutar/miktar {implied:.3f}")
    if by_date and bad > 0.1 * len(by_date):
        raise ValueError(f"EDTB: {bad}/{len(by_date)} günde ortalama fiyat tutar/miktar ile tutarsız — alan anlamları değişmiş olabilir.")
    return sorted(by_date.values(), key=lambda x: x["trade_date"]), warnings

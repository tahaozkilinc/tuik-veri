"""UZTB günlük bülten satırlarını (gunluk_bulten_detay.asp) günlük özet
kayıtlarına (bir gün = bir satır) çevirir.

Bülten, kaynağın kendi hesapladığı min/maks/ağırlıklı ortalama fiyat, toplam
kilo, işlem adedi ve ORTALAMA YAĞ ORANINI ("Deger" alanı — sitedeki "Ort.
Yağ" kolonu) son ~1 ay için verir. Deger, o günün bireysel işlemlerindeki
yağ oranlarının kiloyla ağırlıklı ortalamasıdır (salon-satis.php'deki
Index1_YagOrani'ndan hesaplanıp birebir eşleştiği doğrulandı).
"""

from __future__ import annotations

import datetime as dt


def _infer_ddmm_date(ddmm: str, today: dt.date) -> str | None:
    """'16.09' gibi yılsız bir tarihi, bugüne göre en olası yılı seçerek
    tam tarihe çevirir (gelecekte kalıyorsa bir önceki yıl kabul edilir —
    kaynak sadece son birkaç haftayı döndürdüğü için bu güvenli)."""
    try:
        d, m = ddmm.strip().split(".")
        d, m = int(d), int(m)
    except (ValueError, AttributeError):
        return None
    candidate = dt.date(today.year, m, d)
    if candidate > today:
        candidate = dt.date(today.year - 1, m, d)
    return candidate.isoformat()


def _tr_decimal(v) -> float | None:
    """Kaynak bazı sayıları '42,727' gibi virgül ondalıklı metin olarak
    veriyor (aynı alan başka uçta float gelebiliyor)."""
    if v is None or v == "":
        return None
    if isinstance(v, (int, float)):
        return float(v)
    return float(str(v).replace(",", "."))


def parse_daily_summary(rows: list[dict], urun_kodu: str, today: dt.date) -> list[dict]:
    records = []
    for r in rows:
        trade_date = _infer_ddmm_date(r.get("TARIH", ""), today)
        if not trade_date:
            continue
        records.append({
            "trade_date": trade_date,
            "urun_kodu": r.get("MAL") or urun_kodu,
            "urun_adi": r.get("MALADI") or urun_kodu,
            "min_fiyat": r.get("MinFiyat"),
            "max_fiyat": r.get("MaxFiyat"),
            "ort_fiyat": r.get("OrtFiyat"),
            "toplam_kilo": r.get("Kilo"),
            "islem_adet": r.get("IslemAdet"),
            "ort_yag": _tr_decimal(r.get("Deger")),
        })
    return records

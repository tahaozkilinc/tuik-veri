"""UZTB API yanıtlarını günlük özet kayıtlarına (bir gün = bir satır) çevirir.

İki farklı kaynaktan geliyor:
- Bugünün bireysel satırları (salon-satis.php) → min/maks/ağırlıklı
  ortalama fiyat + toplam kilo + ORTALAMA RUTUBET kendimiz hesaplıyoruz
  (kaynak zaten aynı hesabı sayfanın kendi JS'inde yapıyor, biz
  tekrarlıyoruz).
- Geçmiş günlerin özeti (gunluk_bulten_detay.asp) → kaynağın kendi
  hazır hesapladığı min/maks/ortalama fiyat + toplam kilo + işlem adedi;
  bu günler için rutubet bilgisi YOK (kaynakta bulunmuyor), bu yüzden
  ort_rutubet alanı bilerek None bırakılıyor — sahte veri üretmiyoruz.
"""

from __future__ import annotations

import datetime as dt


def _parse_ddmmyyyy(s: str) -> str | None:
    s = s.strip()
    try:
        d, m, y = s.split(".")
        return dt.date(int(y), int(m), int(d)).isoformat()
    except (ValueError, AttributeError):
        return None


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


def summarize_today(rows: list[dict], urun_kodu: str, today: dt.date) -> dict | None:
    if not rows:
        return None
    prices = [r["FIYAT"] for r in rows if r.get("FIYAT")]
    toplam_kilo = sum(r.get("KILO") or 0 for r in rows)
    weighted_sum = sum((r.get("FIYAT") or 0) * (r.get("KILO") or 0) for r in rows)
    ort_fiyat = weighted_sum / toplam_kilo if toplam_kilo else None
    rutubet_vals = [r["Rutubet"] for r in rows if r.get("Rutubet") and r["Rutubet"] > 0]
    ort_rutubet = sum(rutubet_vals) / len(rutubet_vals) if rutubet_vals else None
    trade_date = _parse_ddmmyyyy(rows[0].get("TARIH", "")) or today.isoformat()
    urun_adi = rows[0].get("MALADI") or urun_kodu
    return {
        "trade_date": trade_date,
        "urun_kodu": urun_kodu,
        "urun_adi": urun_adi,
        "min_fiyat": min(prices) if prices else None,
        "max_fiyat": max(prices) if prices else None,
        "ort_fiyat": ort_fiyat,
        "toplam_kilo": toplam_kilo or None,
        "islem_adet": len(rows),
        "ort_rutubet": ort_rutubet,
    }


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
            "ort_rutubet": None,
        })
    return records

"""Tüm ticaret borsası tablolarında son 1 yılın (365 gün) gerçekten
eksiksiz çekilip çekilmediğini kontrol eden geçici script.

Her tablo için: toplam satır, en eski/en yeni trade_date, son 365 günde
kaç farklı gün için veri var (hafta sonu/tatil atlamaları normal, ama
büyük ardışık boşluklar anormal) ve en uzun ardışık boşluk kaç gün.
"""

from __future__ import annotations

import datetime as dt
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from loader.supabase_loader import get_client

TABLES = ["turib_bulletin", "uztb_fiyat", "ktb_bulletin", "gtb_fiyat", "ctb_fiyat", "ptb_fiyat"]


def fetch_all_dates(client, table: str) -> list[str]:
    dates: list[str] = []
    page_size = 1000
    offset = 0
    while True:
        resp = (
            client.table(table)
            .select("trade_date")
            .order("trade_date", desc=False)
            .range(offset, offset + page_size - 1)
            .execute()
        )
        batch = resp.data or []
        dates.extend(r["trade_date"] for r in batch)
        if len(batch) < page_size:
            break
        offset += page_size
    return dates


def main() -> None:
    client = get_client()
    today = dt.date.today()
    one_year_ago = today - dt.timedelta(days=365)

    for table in TABLES:
        print(f"\n=== {table} ===")
        try:
            dates = fetch_all_dates(client, table)
        except Exception as exc:  # noqa: BLE001
            print(f"  HATA: {exc}")
            continue

        if not dates:
            print("  TABLO BOŞ")
            continue

        uniq_dates = sorted(set(dates))
        print(f"  toplam satır: {len(dates)}, benzersiz gün: {len(uniq_dates)}")
        print(f"  en eski: {uniq_dates[0]}  en yeni: {uniq_dates[-1]}")

        # Son 1 yıl penceresindeki benzersiz günler
        last_year_days = [d for d in uniq_dates if d >= one_year_ago.isoformat()]
        print(f"  son 365 gün penceresinde veri olan gün sayısı: {len(last_year_days)} "
              f"(pencere: {one_year_ago.isoformat()} .. {today.isoformat()})")

        # Ardışık boşlukları bul (takvim günü bazında, hafta sonu normal
        # kısa boşluklar olabilir — >=5 takvim günü boşluk rapor ediliyor)
        parsed = [dt.date.fromisoformat(d) for d in uniq_dates if d >= one_year_ago.isoformat()]
        gaps = []
        for i in range(1, len(parsed)):
            delta = (parsed[i] - parsed[i - 1]).days
            if delta >= 5:
                gaps.append((parsed[i - 1].isoformat(), parsed[i].isoformat(), delta))
        if parsed and (today - parsed[-1]).days >= 5:
            gaps.append((parsed[-1].isoformat(), today.isoformat(), (today - parsed[-1]).days))
        if gaps:
            print(f"  >=5 günlük boşluklar (son 1 yılda): {len(gaps)}")
            for a, b, d in gaps[:15]:
                print(f"    {a} -> {b}  ({d} gün boşluk)")
        else:
            print("  son 1 yılda >=5 günlük boşluk yok")


if __name__ == "__main__":
    main()

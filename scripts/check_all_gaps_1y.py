"""Tüm borsa tablolarında son 365 günde EKSİK iş günlerini (hafta sonu
hariç) bulan kapsamlı kontrol. Bir hafta içi gün SADECE bir tabloda
eksikse gerçek bir boşluktur (o borsaya özel sorun); TÜM tablolarda aynı
gün eksikse muhtemelen resmi tatildir (gerçek boşluk değil).
"""

from __future__ import annotations

import datetime as dt
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from loader.supabase_loader import get_client

TABLES = ["turib_bulletin", "ktb_bulletin", "gtb_fiyat", "ctb_fiyat", "ptb_fiyat", "uztb_fiyat"]


def fetch_dates(client, table: str) -> set[str]:
    dates: set[str] = set()
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
        dates.update(r["trade_date"] for r in batch)
        if len(batch) < page_size:
            break
        offset += page_size
    return dates


def weekdays_in_range(start: dt.date, end: dt.date) -> list[str]:
    days = []
    d = start
    while d <= end:
        if d.weekday() < 5:  # 0=Mon..4=Fri
            days.append(d.isoformat())
        d += dt.timedelta(days=1)
    return days


def main() -> None:
    client = get_client()
    today = dt.date.today()
    start = today - dt.timedelta(days=365)
    all_weekdays = set(weekdays_in_range(start, today))

    table_dates: dict[str, set[str]] = {}
    for table in TABLES:
        table_dates[table] = fetch_dates(client, table)
        # tablonun kendi gerçek başlangıcından önceki günleri "eksik" sayma
        earliest = min(table_dates[table]) if table_dates[table] else today.isoformat()
        missing = sorted(d for d in all_weekdays if d not in table_dates[table] and d >= earliest)
        print(f"\n=== {table} ===")
        print(f"  en eski tarih: {earliest}, toplam benzersiz gün: {len(table_dates[table])}")
        print(f"  son 365 gün penceresinde eksik hafta içi gün sayısı: {len(missing)}")
        for d in missing:
            print(f"    EKSIK: {d} ({dt.date.fromisoformat(d).strftime('%a')})")

    # Çapraz kontrol: bir gün TÜM tablolarda (kendi başlangıcından sonra) eksikse
    # muhtemelen resmi tatildir.
    print("\n=== çapraz analiz: her tabloda aynı gün eksik mi (muhtemel tatil) ===")
    all_missing: dict[str, list[str]] = {}
    for table in TABLES:
        earliest = min(table_dates[table]) if table_dates[table] else today.isoformat()
        for d in all_weekdays:
            if d >= earliest and d not in table_dates[table]:
                all_missing.setdefault(d, []).append(table)
    for d in sorted(all_missing):
        tables_missing = all_missing[d]
        tag = "TATİL OLABİLİR (çoğu/tümü eksik)" if len(tables_missing) >= 4 else "GERÇEK BOŞLUK (sadece bazı borsalarda)"
        print(f"  {d}: eksik olan {len(tables_missing)} tablo -> {tables_missing}  [{tag}]")


if __name__ == "__main__":
    main()

"""Geçici kontrol: gtb_fiyat/ctb_fiyat/ptb_fiyat tablolarında gerçekten
son 1 yıllık veri var mı, yoksa sadece eski (backfill'in en baştaki)
günler mi dolu — aylık satır sayısı + en son/en eski tarih + toplam
ürün sayısı raporlanıyor.
"""

from __future__ import annotations

import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from loader.supabase_loader import get_client


def report(client, table: str) -> None:
    print(f"\n=== {table} ===")
    all_rows: list[dict] = []
    page_size = 1000
    offset = 0
    while True:
        resp = (
            client.table(table)
            .select("trade_date,urun_adi" if table != "gtb_fiyat" else "trade_date,urun_adi,urun_kodu")
            .range(offset, offset + page_size - 1)
            .execute()
        )
        batch = resp.data or []
        all_rows.extend(batch)
        if len(batch) < page_size:
            break
        offset += page_size

    print(f"toplam satır: {len(all_rows)}")
    if not all_rows:
        print("TABLO BOŞ")
        return

    dates = sorted(r["trade_date"] for r in all_rows)
    print(f"en eski tarih: {dates[0]}  en yeni tarih: {dates[-1]}")

    by_month = Counter(d[:7] for d in dates)
    print("aylık satır sayısı:")
    for month in sorted(by_month):
        print(f"  {month}: {by_month[month]}")

    products = sorted({r["urun_adi"] for r in all_rows})
    print(f"ürün sayısı: {len(products)}")
    for p in products:
        prows = [r for r in all_rows if r["urun_adi"] == p]
        pdates = sorted(r["trade_date"] for r in prows)
        print(f"  {p}: {len(prows)} satır, {pdates[0]} .. {pdates[-1]}")


def main() -> None:
    client = get_client()
    for table in ("gtb_fiyat", "ctb_fiyat", "ptb_fiyat"):
        try:
            report(client, table)
        except Exception as exc:  # noqa: BLE001
            print(f"{table}: HATA — {exc}")


if __name__ == "__main__":
    main()

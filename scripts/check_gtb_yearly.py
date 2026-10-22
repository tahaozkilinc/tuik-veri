"""Geçici kontrol: GTB'de kullanıcı 2024/2025 verisi görünmüyor diyor.
Önceki kontrol sadece ürün başına ilk/son tarihi gösterdi (aradaki
boşlukları gizleyebilir) — bu script her ürün için YIL BAZINDA satır
sayısını basıyor, böylece hangi ürün/yıl kombinasyonunda gerçek bir
boşluk olduğu netleşiyor.
"""

from __future__ import annotations

import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from loader.supabase_loader import get_client


def main() -> None:
    client = get_client()

    all_rows: list[dict] = []
    page_size = 1000
    offset = 0
    while True:
        resp = (
            client.table("gtb_fiyat")
            .select("trade_date,urun_adi,urun_kodu")
            .range(offset, offset + page_size - 1)
            .execute()
        )
        batch = resp.data or []
        all_rows.extend(batch)
        if len(batch) < page_size:
            break
        offset += page_size

    print(f"toplam satır: {len(all_rows)}")

    # urun_adi + urun_kodu kombinasyonlarını da ayrı göster (kod değişmiş mi?)
    codes_by_name: dict[str, set[str]] = defaultdict(set)
    for r in all_rows:
        codes_by_name[r["urun_adi"]].add(r["urun_kodu"])

    by_product_year: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    for r in all_rows:
        year = r["trade_date"][:4]
        by_product_year[r["urun_adi"]][year] += 1

    years = sorted({r["trade_date"][:4] for r in all_rows})
    print(f"\ntablodaki yıllar: {years}")

    print("\nürün bazında yıllık satır sayısı:")
    for product in sorted(by_product_year):
        codes = codes_by_name[product]
        code_note = f" [kod(lar): {sorted(codes)}]" if len(codes) > 1 else f" [kod: {sorted(codes)[0]}]"
        row = " ".join(f"{y}={by_product_year[product].get(y, 0)}" for y in years)
        print(f"  {product}{code_note}: {row}")


if __name__ == "__main__":
    main()

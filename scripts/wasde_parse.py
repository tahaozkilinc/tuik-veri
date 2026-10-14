"""Manuel/keşif amaçlı: en son WASDE yayınını çekip ayrıştırılmış tabloları
ekrana basar — Supabase'e hiçbir şey yazmaz. Gerçek ayrıştırma mantığı
`wasde/parser.py`'de; production yükleme `python -m wasde.run` ile yapılır.
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from wasde import parser


def main() -> None:
    report_date, txt_url = parser.find_latest_release()
    print(f"En son WASDE yayını: {report_date} — {txt_url}", file=sys.stderr)
    text = parser.fetch(txt_url)
    release_number = parser.extract_release_number(text)
    print(f"WASDE-{release_number}, txt uzunluğu: {len(text)}", file=sys.stderr)

    print("\n=== U.S. CORN (Million Bushels, fiyat $/bu) ===")
    corn_periods, corn_rows = parser.parse_us_corn(text)
    print(f"dönemler: {corn_periods}")
    for label, vals in corn_rows.items():
        print(f"{label:35s} {vals}")

    print("\n=== U.S. SOYBEANS / OIL / MEAL ===")
    soy_periods, soy_tables = parser.parse_us_soy(text)
    print(f"dönemler: {soy_periods}")
    for sub, rows in soy_tables.items():
        print(f"--- {sub} ---")
        for label, vals in rows.items():
            print(f"{label:35s} {vals}")

    print("\n=== WORLD CORN (Million Metric Tons: BegStocks,Prod,Imports,Feed,DomTotal,Exports,EndStocks) ===")
    world_corn, world_corn_slots = parser.parse_world_corn(text)
    print(f"dönem etiketleri: {world_corn_slots}")
    for region, series in world_corn.items():
        print(f"-- {region} --")
        for period, vals in series.items():
            print(f"  {period:20s} {vals}")

    print("\n=== WORLD SOYBEAN (Million Metric Tons: BegStocks,Prod,Imports,Crush,DomTotal,Exports,EndStocks) ===")
    world_soy, world_soy_slots = parser.parse_world_soy(text)
    print(f"dönem etiketleri: {world_soy_slots}")
    for region, series in world_soy.items():
        print(f"-- {region} --")
        for period, vals in series.items():
            print(f"  {period:20s} {vals}")

    print("\n=== WORLD SOYBEAN MEAL (Million Metric Tons: BegStocks,Prod,Imports,DomTotal,Exports,EndStocks) ===")
    world_soymeal, world_soymeal_slots = parser.parse_world_soymeal(text)
    print(f"dönem etiketleri: {world_soymeal_slots}")
    for region, series in world_soymeal.items():
        print(f"-- {region} --")
        for period, vals in series.items():
            print(f"  {period:20s} {vals}")


if __name__ == "__main__":
    main()

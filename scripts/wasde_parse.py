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
    for label, vals in parser.parse_us_corn(text).items():
        print(f"{label:35s} {vals}")

    print("\n=== U.S. SOYBEANS / OIL / MEAL ===")
    for sub, rows in parser.parse_us_soy(text).items():
        print(f"--- {sub} ---")
        for label, vals in rows.items():
            print(f"{label:35s} {vals}")

    print("\n=== WORLD CORN (Million Metric Tons: BegStocks,Prod,Imports,Feed,DomTotal,Exports,EndStocks) ===")
    for region, series in parser.parse_world_corn(text).items():
        print(f"-- {region} --")
        for period, vals in series.items():
            print(f"  {period:20s} {vals}")

    print("\n=== WORLD SOYBEAN (Million Metric Tons: BegStocks,Prod,Imports,Crush,DomTotal,Exports,EndStocks) ===")
    for region, series in parser.parse_world_soy(text).items():
        print(f"-- {region} --")
        for period, vals in series.items():
            print(f"  {period:20s} {vals}")

    print("\n=== WORLD SOYBEAN MEAL (Million Metric Tons: BegStocks,Prod,Imports,DomTotal,Exports,EndStocks) ===")
    for region, series in parser.parse_world_soymeal(text).items():
        print(f"-- {region} --")
        for period, vals in series.items():
            print(f"  {period:20s} {vals}")


if __name__ == "__main__":
    main()

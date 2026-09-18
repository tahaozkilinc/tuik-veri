"""AY (ay/month) boyutu eklenmiş qlik_client.fetch_trade_stats()'ı canlı
kaynağa karşı çalıştırıp Supabase'e hiçbir şey yazmadan sonucu özetler.
Tek amaç: production'a dokunmadan aylık kırılımın gerçekten çalıştığını
ve veri şeklini doğrulamak.
"""

from __future__ import annotations

import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from scraper.qlik_client import fetch_trade_stats


def main() -> None:
    codes = ["100590000019", "120190000000", "110430900011", "230400000000", "120600990019"]
    records = fetch_trade_stats(codes)

    print(f"toplam satır: {len(records)}", file=sys.stderr)

    month_counter = Counter(r["period_month"] for r in records)
    print(f"period_month dağılımı: {dict(sorted(month_counter.items(), key=lambda kv: (kv[0] is None, kv[0])))}", file=sys.stderr)

    with_month = [r for r in records if r["period_month"] is not None]
    without_month = [r for r in records if r["period_month"] is None]
    print(f"ay bilgisi olan satır: {len(with_month)}", file=sys.stderr)
    print(f"ay bilgisi olmayan (None) satır: {len(without_month)}", file=sys.stderr)

    years_with_month = sorted({r["period_year"] for r in with_month})
    years_without_month = sorted({r["period_year"] for r in without_month})
    print(f"aylık veri olan yıllar: {years_with_month}", file=sys.stderr)
    print(f"aylık veri OLMAYAN (yıllık kalan) yıllar: {years_without_month}", file=sys.stderr)

    print("\nörnek satırlar (ay bilgisiyle):", file=sys.stderr)
    for r in with_month[:8]:
        print(f"  {r['period_year']}-{r['period_month']:02d} {r['flow']} {r['gtip_code']} {r['country_name']} ${r['value_usd']}", file=sys.stderr)

    if without_month:
        print("\nörnek satırlar (ay bilgisi YOK):", file=sys.stderr)
        for r in without_month[:5]:
            print(f"  {r['period_year']} {r['flow']} {r['gtip_code']} {r['country_name']} ${r['value_usd']}", file=sys.stderr)


if __name__ == "__main__":
    main()

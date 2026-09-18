"""trade_stats tablosundaki tüm satırları kompakt JSON olarak stdout'a
basar (rapor artifact'ı için tek seferlik veri anlık görüntüsü).

Her satır [yil, flow, gtip_kodu, ulke_kodu, ulke_adi, value_usd, weight_kg]
dizisi olarak çıkar (flow: 0=export, 1=import) — sütun adlarını tekrar
tekrar yazmamak için kompakt tutuluyor.
"""

from __future__ import annotations

import json
import sys
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
            client.table("trade_stats")
            .select("period_year,flow,gtip_code,country_code,country_name,value_usd,weight_kg")
            .range(offset, offset + page_size - 1)
            .execute()
        )
        batch = resp.data or []
        all_rows.extend(batch)
        if len(batch) < page_size:
            break
        offset += page_size

    compact = [
        [
            r["period_year"],
            0 if r["flow"] == "export" else 1,
            r["gtip_code"],
            r["country_code"],
            r["country_name"],
            r["value_usd"],
            r["weight_kg"],
        ]
        for r in all_rows
    ]

    print("===EXPORT_START===")
    print(json.dumps(compact, ensure_ascii=False, separators=(",", ":")))
    print("===EXPORT_END===")
    print(f"toplam satır: {len(compact)}", file=sys.stderr)


if __name__ == "__main__":
    main()

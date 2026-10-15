"""USDA FAS Export Sales Reporting verisini çekip Supabase'e yükleyen CLI
giriş noktası.

Kullanım:
    python -m esr.run

ESR her Perşembe öğlen (ET) güncelleniyor. Bu script her çalıştığında takip
edilen 5 emtianın (Mısır, Soya Fasulyesi, Soya Küspesi, Soya Yağı, Ayçiçek
Yağı) güncel pazarlama yılındaki TÜM haftalık geçmişini yeniden çeker ve
sil-ve-ekle yapar (idempotent) — aynı haftayı tekrar tekrar çekmek veri
kopyalamaz, geçmiş haftalara gelen revizyonları da yansıtır.
"""

from __future__ import annotations

import sys

from esr import records
from loader.supabase_loader import finish_run, get_client, replace_export_sales, start_run


def main() -> int:
    client = get_client()
    run_id = start_run(client, source="esr")

    try:
        recs = records.build_records()
        commodities = sorted({r["commodity_name_tr"] for r in recs})
        print(f"{len(recs)} satır çekildi ({', '.join(commodities)}).")

        rows_written = replace_export_sales(client, recs)
        print(f"{rows_written} satır yazıldı (ilgili emtia/pazarlama yılı çiftleri için eski satırlar silinip yenilendi).")

        finish_run(client, run_id, status="success", rows_upserted=rows_written)
        return 0

    except Exception as exc:  # noqa: BLE001
        finish_run(client, run_id, status="failed", error_message=str(exc))
        print(f"HATA: {exc}", file=sys.stderr)
        raise


if __name__ == "__main__":
    raise SystemExit(main())

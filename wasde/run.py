"""En son WASDE (USDA) yayınını çekip Supabase'e yükleyen CLI giriş noktası.

Kullanım:
    python -m wasde.run

WASDE ayda bir (genelde ayın 8-12'si arası, öğlen ET) yayınlanıyor. Bu script
her çalıştığında en son yayını bulur; eğer o `report_date` için satırlar
zaten DB'de varsa sil-ve-yeniden-ekle yapar (idempotent) — yani cron'u
ayın 8-13'ü arası her gün çalıştırmak güvenlidir, henüz yeni yayın çıkmadıysa
aynı (en son) yayını tekrar yükler, veri kopyalanmaz.
"""

from __future__ import annotations

import sys

from loader.supabase_loader import finish_run, get_client, replace_wasde_report, start_run
from wasde import parser, records


def main() -> int:
    client = get_client()
    run_id = start_run(client, source="wasde")

    try:
        report_date, txt_url = parser.find_latest_release()
        print(f"En son WASDE yayını: {report_date} — {txt_url}")

        text = parser.fetch(txt_url)
        release_number = parser.extract_release_number(text)
        print(f"WASDE-{release_number}, {len(text)} karakter")

        recs = records.build_records(text, report_date, release_number)
        rows_written = replace_wasde_report(client, report_date, recs)
        print(f"{rows_written} satır yazıldı (report_date={report_date} için eski satırlar silinip yenilendi).")

        finish_run(client, run_id, status="success", rows_upserted=rows_written)
        return 0

    except Exception as exc:  # noqa: BLE001
        finish_run(client, run_id, status="failed", error_message=str(exc))
        print(f"HATA: {exc}", file=sys.stderr)
        raise


if __name__ == "__main__":
    raise SystemExit(main())

"""KTB'nin kaynağının gerçekte ne kadar geriye gidebildiğini kontrol eden
geçici script. Schema.sql'deki eski not '2+ yıl geriye gidebiliyor,
2024-10-15 dahil test edildi' diyor ama ktb_bulletin'in en eski satırı
2025-10-15 — yani backfill o zamanlar sadece 1 yıl yapılmış, kaynağın
kendisi daha eskiye gidebiliyor olabilir. Birkaç farklı eski tarihi
canlı siteden deneyip gerçek sınırı buluyoruz.
"""

from __future__ import annotations

import datetime as dt
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from ktb import records as ktb_records

TEST_DATES = [
    "2025-09-14", "2025-09-01", "2025-08-01", "2025-06-01",
    "2025-01-01", "2024-10-15", "2024-01-01", "2023-01-01",
]


def main() -> None:
    for date_str in TEST_DATES:
        day = dt.date.fromisoformat(date_str)
        try:
            recs = ktb_records.fetch_day(day)
            print(f"  {date_str} ({day.strftime('%a')}): {len(recs) if recs else 0} satır")
        except Exception as exc:  # noqa: BLE001
            print(f"  {date_str}: HATA — {exc}")


if __name__ == "__main__":
    main()

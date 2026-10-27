"""Son 10 günde her borsa tablosunda gerçekten gün gün veri var mı
kontrol eden geçici script (hafta sonu/tatil hariç)."""

from __future__ import annotations

import datetime as dt
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from loader.supabase_loader import get_client

TABLES = ["turib_bulletin", "ktb_bulletin", "gtb_fiyat", "ctb_fiyat", "ptb_fiyat", "uztb_fiyat"]


def main() -> None:
    client = get_client()
    today = dt.date.today()
    window_start = today - dt.timedelta(days=10)

    for table in TABLES:
        print(f"\n=== {table} ===")
        resp = (
            client.table(table)
            .select("trade_date")
            .gte("trade_date", window_start.isoformat())
            .execute()
        )
        dates = sorted({r["trade_date"] for r in (resp.data or [])})
        print(f"  son 10 gün penceresindeki (pencere: {window_start.isoformat()}..{today.isoformat()}) günler:")
        for d in dates:
            weekday = dt.date.fromisoformat(d).strftime("%a")
            print(f"    {d} ({weekday})")
        if not dates:
            print("    (hiç satır yok)")


if __name__ == "__main__":
    main()

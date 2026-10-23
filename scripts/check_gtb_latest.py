"""Geçici kontrol: gtb_fiyat'ta en güncel trade_date hangisi, ve kaç
satır var. Kullanıcı 'son veriler yok' diyor, gerçek durumu doğruluyoruz."""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from loader.supabase_loader import get_client


def main() -> None:
    client = get_client()
    resp = (
        client.table("gtb_fiyat")
        .select("trade_date")
        .order("trade_date", desc=True)
        .limit(5)
        .execute()
    )
    print("en yeni 5 trade_date (gtb_fiyat):")
    for r in resp.data or []:
        print(" ", r["trade_date"])

    runs = client.table("scrape_runs").select("*").eq("source", "gtb").order("id", desc=True).limit(5).execute()
    print("\nson 5 gtb scrape_runs:")
    for r in runs.data or []:
        print(f"  id={r['id']} status={r['status']} rows_upserted={r.get('rows_upserted')} "
              f"started={r.get('started_at')} finished={r.get('finished_at')} error={r.get('error_message')}")


if __name__ == "__main__":
    main()

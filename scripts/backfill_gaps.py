"""Son 365 gün boşluk taramasında bulunan TÜM eksik hafta içi günleri
(hem 'gerçek boşluk' hem 'muhtemel tatil' olarak etiketlenenler) ilgili
borsa kaynağından tek tek çekip Supabase'e yazan tek seferlik backfill.

Her kaynak için kendi fetch_and_load_day'ini kullanıyoruz (run.py'deki
ile birebir aynı mantık, replace_* ile sil-ve-ekle — zararsız, var olan
veriyi bozmaz). Kaynak gerçekten o gün kapalıysa (resmi tatil) 0 satır
döner — bu rapor edilip atlanır, hata değildir.
"""

from __future__ import annotations

import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import datetime as dt

from loader.supabase_loader import (
    get_client,
    replace_ctb_fiyat,
    replace_gtb_fiyat,
    replace_ktb_bulletin,
    replace_ptb_fiyat,
    replace_turib_bulletin,
)

from ctb import records as ctb_records
from gtb import records as gtb_records
from ktb import records as ktb_records
from ptb import records as ptb_records
from turib import records as turib_records

MISSING = {
    "turib": [
        "2026-01-01", "2026-03-20", "2026-04-23", "2026-05-01", "2026-05-19",
        "2026-05-27", "2026-05-28", "2026-05-29", "2026-07-15",
    ],
    "ktb": [
        "2026-01-01", "2026-03-19", "2026-03-20", "2026-04-23", "2026-05-01",
        "2026-05-19", "2026-05-26", "2026-05-27", "2026-05-28", "2026-05-29",
    ],
    "gtb": [
        "2026-01-01", "2026-01-02", "2026-03-19", "2026-03-20", "2026-04-23",
        "2026-05-01", "2026-05-19", "2026-05-26", "2026-05-27", "2026-05-28",
        "2026-05-29", "2026-07-15",
    ],
    "ctb": [
        "2025-12-31", "2026-01-01", "2026-01-02", "2026-01-13", "2026-01-14",
        "2026-02-16", "2026-03-18", "2026-03-19", "2026-03-20", "2026-04-23",
        "2026-05-01", "2026-05-15", "2026-05-19", "2026-05-22", "2026-05-26",
        "2026-05-27", "2026-05-28", "2026-05-29", "2026-07-30", "2026-08-07",
    ],
    "ptb": [
        "2026-01-01", "2026-03-19", "2026-03-20", "2026-04-23", "2026-05-01",
        "2026-05-19", "2026-05-26", "2026-05-27", "2026-05-28", "2026-05-29",
    ],
}

FETCHERS = {
    "turib": (turib_records.fetch_day, replace_turib_bulletin),
    "ktb": (ktb_records.fetch_day, replace_ktb_bulletin),
    "gtb": (gtb_records.fetch_day, replace_gtb_fiyat),
    "ctb": (ctb_records.fetch_day, replace_ctb_fiyat),
    "ptb": (ptb_records.fetch_day, replace_ptb_fiyat),
}


def main() -> None:
    client = get_client()
    totals = {"doldu": 0, "tatil/kapalı (0 satır)": 0, "hata": 0}

    for source, dates in MISSING.items():
        fetch_day, replace_fn = FETCHERS[source]
        print(f"\n=== {source} ===")
        for date_str in dates:
            day = dt.date.fromisoformat(date_str)
            try:
                recs = fetch_day(day)
                if not recs:
                    print(f"  {date_str}: 0 satır (kaynak boş döndü — tatil/kapalı)")
                    totals["tatil/kapalı (0 satır)"] += 1
                    continue
                rows = replace_fn(client, date_str, recs)
                print(f"  {date_str}: {rows} satır yazıldı")
                totals["doldu"] += 1
            except Exception as exc:  # noqa: BLE001
                print(f"  {date_str}: HATA — {exc}", file=sys.stderr)
                totals["hata"] += 1
            time.sleep(0.3)

    print(f"\n=== ÖZET === dolduruldu={totals['doldu']}  tatil/kapalı={totals['tatil/kapalı (0 satır)']}  hata={totals['hata']}")


if __name__ == "__main__":
    main()

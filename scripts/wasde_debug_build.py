"""Debug: production ortamında (GitHub Actions runner) wasde.parser +
wasde.records'ın gerçekte ne ürettiğini adım adım yazdırır — Supabase'e
hiçbir şey yazmaz. 330-vs-634 satır tutarsızlığını teşhis etmek için."""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from wasde import parser, records


def main() -> None:
    report_date, txt_url = parser.find_latest_release()
    print(f"report_date={report_date} txt_url={txt_url}")

    text = parser.fetch(txt_url)
    print(f"raw fetched text length: {len(text)}")
    print(f"repr first 80 chars: {text[:80]!r}")
    release_number = parser.extract_release_number(text)
    print(f"release_number={release_number}")

    corn_rows = parser.parse_us_corn(text)
    print(f"\nparse_us_corn -> {len(corn_rows)} measures")
    print(list(corn_rows.keys()))

    soy = parser.parse_us_soy(text)
    for sub, rows in soy.items():
        print(f"parse_us_soy[{sub}] -> {len(rows)} measures: {list(rows.keys())}")

    world_corn = parser.parse_world_corn(text)
    for region, series in world_corn.items():
        print(f"world_corn[{region}] periods: {list(series.keys())}")

    recs = records.build_records(text, report_date, release_number)
    print(f"\nTOTAL records: {len(recs)}")
    import collections
    by_cs = collections.Counter((r["commodity"], r["scope"]) for r in recs)
    for k, v in sorted(by_cs.items()):
        print(k, v)
    by_period = collections.Counter(r["period_label"] for r in recs)
    print("periods:", dict(by_period))


if __name__ == "__main__":
    main()

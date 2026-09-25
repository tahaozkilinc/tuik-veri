"""Tek seferlik denetim: wasde_stats'ta gerçekte ne var, hangi ölçüler/dönemler
eksik — Supabase'e hiçbir şey yazmaz."""

from __future__ import annotations

import collections
import os

from supabase import create_client


def main() -> None:
    client = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])

    rows = []
    frm = 0
    page_size = 1000
    while True:
        resp = (
            client.table("wasde_stats")
            .select("report_date,release_number,commodity,scope,region,period_label,measure,measure_label_tr,value,unit")
            .range(frm, frm + page_size - 1)
            .execute()
        )
        page = resp.data
        rows.extend(page)
        if len(page) < page_size:
            break
        frm += page_size

    print(f"TOPLAM satır: {len(rows)}")
    report_dates = sorted({r["report_date"] for r in rows})
    print(f"report_date değerleri: {report_dates}")
    releases = sorted({r["release_number"] for r in rows})
    print(f"release_number değerleri: {releases}")

    by_cs = collections.Counter((r["commodity"], r["scope"]) for r in rows)
    print("\n--- commodity/scope satır sayısı ---")
    for k, v in sorted(by_cs.items()):
        print(k, v)

    expected_us = {"corn": 15, "soybeans": 14, "soybean_oil": 11, "soybean_meal": 9}
    print("\n--- ABD tabloları: ölçü sayısı beklenene uyuyor mu (x4 dönem) ---")
    for commodity, n_measures in expected_us.items():
        measures = {r["measure"] for r in rows if r["commodity"] == commodity and r["scope"] == "us"}
        count = by_cs.get((commodity, "us"), 0)
        print(f"{commodity}: {len(measures)} farklı ölçü (beklenen {n_measures}), {count} satır (beklenen {n_measures*4})")
        print("  ölçüler:", sorted(measures))

    print("\n--- Dünya tabloları: bölge x dönem tam mı ---")
    for commodity in ["corn", "soybeans", "soybean_meal"]:
        regions = {r["region"] for r in rows if r["commodity"] == commodity and r["scope"] == "world"}
        for region in sorted(regions):
            periods = sorted({r["period_label"] for r in rows if r["commodity"] == commodity and r["scope"] == "world" and r["region"] == region})
            print(f"{commodity} / {region}: {len(periods)} dönem -> {periods}")

    print("\n--- ending_stocks trend satırları var mı ---")
    trend = [r for r in rows if r["measure"].endswith("_change_pct")]
    print(f"{len(trend)} trend satırı")

    print("\n--- value NULL/None olan satır var mı ---")
    nulls = [r for r in rows if r["value"] is None]
    print(f"{len(nulls)} NULL değerli satır")


if __name__ == "__main__":
    main()

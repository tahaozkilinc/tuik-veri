"""Debug: wasde_stats'ta gerçekte ne var — satır sayısı tutarsızlığını (334 vs
beklenen 634) teşhis etmek için kırılım dökümü. Supabase'e hiçbir şey yazmaz."""

from __future__ import annotations

import collections
import os

from supabase import create_client


def main() -> None:
    client = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])

    rows = []
    page_size = 1000
    frm = 0
    while True:
        resp = (
            client.table("wasde_stats")
            .select("commodity,scope,region,period_label,measure")
            .range(frm, frm + page_size - 1)
            .execute()
        )
        page = resp.data
        rows.extend(page)
        if len(page) < page_size:
            break
        frm += page_size

    print(f"TOPLAM satır: {len(rows)}")

    by_commodity_scope = collections.Counter((r["commodity"], r["scope"]) for r in rows)
    print("\n--- commodity/scope ---")
    for k, v in sorted(by_commodity_scope.items()):
        print(k, v)

    by_period = collections.Counter(r["period_label"] for r in rows)
    print("\n--- period_label ---")
    for k, v in sorted(by_period.items()):
        print(repr(k), v)

    by_region = collections.Counter((r["commodity"], r["scope"], r["region"]) for r in rows if r["scope"] == "world")
    print("\n--- world regions per commodity ---")
    for k, v in sorted(by_region.items(), key=lambda kv: str(kv[0])):
        print(k, v)

    us_corn_measures = sorted({r["measure"] for r in rows if r["commodity"] == "corn" and r["scope"] == "us"})
    print(f"\n--- us corn measures ({len(us_corn_measures)}) ---")
    print(us_corn_measures)

    world_corn_world_periods = sorted(
        {r["period_label"] for r in rows if r["commodity"] == "corn" and r["scope"] == "world" and r["region"] == "world"}
    )
    print(f"\n--- world corn / region=world periods present ({len(world_corn_world_periods)}) ---")
    print(world_corn_world_periods)


if __name__ == "__main__":
    main()

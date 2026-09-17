"""Supabase'deki trade_stats verisini doğrulamak için tek seferlik kontrol
script'i: satır sayısı, olası kopya kayıtlar, birkaç bilinen toplamın
GitHub Actions log'undaki değerlerle eşleşip eşleşmediği, ve saçma
(negatif/aşırı büyük/eksik alan) değer taraması.
"""

from __future__ import annotations

import sys
from collections import Counter
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
            .select("*")
            .range(offset, offset + page_size - 1)
            .execute()
        )
        batch = resp.data or []
        all_rows.extend(batch)
        if len(batch) < page_size:
            break
        offset += page_size

    print(f"toplam satır: {len(all_rows)}")

    # 1) Kopya kontrolü (gerçek unique key: year, month, flow, gtip, port, country)
    key_counts = Counter(
        (r["period_year"], r["period_month"], r["flow"], r["gtip_code"], r["port_code"], r["country_code"])
        for r in all_rows
    )
    dupes = {k: c for k, c in key_counts.items() if c > 1}
    print(f"kopya anahtar sayısı: {len(dupes)}")
    for k, c in list(dupes.items())[:10]:
        print(f"  KOPYA: {k} -> {c} kez")

    # 2) Saçma değer taraması
    bad = []
    for r in all_rows:
        if r.get("value_usd") is not None and r["value_usd"] < 0:
            bad.append(("negatif value_usd", r))
        if r.get("weight_kg") is not None and r["weight_kg"] < 0:
            bad.append(("negatif weight_kg", r))
        if not r.get("country_name"):
            bad.append(("ülke adı eksik", r))
        if not r.get("gtip_code"):
            bad.append(("gtip kodu eksik", r))
        if r.get("flow") not in ("export", "import"):
            bad.append(("geçersiz flow", r))
    print(f"şüpheli satır sayısı: {len(bad)}")
    for reason, r in bad[:10]:
        print(f"  {reason}: {r}")

    # 3) GTİP bazında toplam (İthalat 2026) — Actions log'undaki değerlerle karşılaştırma için
    print("\n--- İthalat 2026, GTİP bazında toplam ---")
    totals: dict[str, float] = {}
    for r in all_rows:
        if r["flow"] == "import" and r["period_year"] == 2026:
            totals[r["gtip_code"]] = totals.get(r["gtip_code"], 0) + (r["value_usd"] or 0)
    for gtip, total in sorted(totals.items(), key=lambda kv: -kv[1]):
        print(f"  {gtip}: ${total:,.0f}")

    # 4) Yıl / GTİP / flow dağılımı (genel sağlık kontrolü)
    years = sorted({r["period_year"] for r in all_rows})
    gtips = sorted({r["gtip_code"] for r in all_rows})
    flows = sorted({r["flow"] for r in all_rows})
    print(f"\nyıllar: {years}")
    print(f"gtip kodları ({len(gtips)}): {gtips}")
    print(f"flow'lar: {flows}")

    # 5) scrape_runs son durumu
    runs = client.table("scrape_runs").select("*").order("id", desc=True).limit(3).execute()
    print("\n--- son 3 scrape_runs ---")
    for run in runs.data or []:
        print(f"  id={run['id']} status={run['status']} rows_upserted={run.get('rows_upserted')} "
              f"started={run.get('started_at')} finished={run.get('finished_at')} error={run.get('error_message')}")

    # 6) daily_reports son durumu
    reports = client.table("daily_reports").select("report_date,generated_at").order("report_date", desc=True).limit(3).execute()
    print("\n--- son 3 daily_reports ---")
    for rep in reports.data or []:
        print(f"  {rep}")


if __name__ == "__main__":
    main()
